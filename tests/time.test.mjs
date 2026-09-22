import test from 'node:test';
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import { decodeReply, writeTimestamp, readTimestamp, queryNtp, createTimeService } from '../server/ntp.js';
import { NetworkClock, wibDate } from '../clock.js';
import time from '../api/time.js';

function packet(unixMs=1790000000000) {
  const request=Buffer.alloc(48); writeTimestamp(request,40,unixMs);
  const reply=Buffer.alloc(48); reply[0]=0x24; reply[1]=2;
  request.copy(reply,24,40,48); writeTimestamp(reply,32,unixMs+10); writeTimestamp(reply,40,unixMs+12);
  return {request,reply,unixMs};
}
test('NTP timestamp eras work before and after the 2036 wraparound',()=>{
  for (const date of ['2026-09-16T01:00:00.125Z','2037-09-16T01:00:00.125Z']) {
    const value=Date.parse(date); const buf=Buffer.alloc(8); writeTimestamp(buf,0,value);
    assert.ok(Math.abs(readTimestamp(buf,0,value)-value)<.001);
  }
});
test('NTP reply applies delay compensation and rejects invalid origin, mode and leap states',()=>{
  const {request,reply,unixMs}=packet();
  assert.ok(Math.abs(decodeReply(reply,request,22,unixMs).unixMs-(unixMs+22))<.001);
  for(const alter of [r=>r[24]^=1,r=>r[0]=0xe4,r=>r[0]=0x23,r=>r[1]=0,r=>r[1]=16,r=>r.fill(0,40,48)]) {
    const bad=Buffer.from(reply); alter(bad); assert.throws(()=>decodeReply(bad,request,22,unixMs));
  }
  assert.throws(()=>decodeReply(reply.subarray(0,40),request,22,unixMs));
});
test('real UDP exchange closes its socket and reads the response',async()=>{
  const server=dgram.createSocket('udp4');
  await new Promise(resolve=>server.bind(0,'127.0.0.1',resolve));
  server.on('message',(request,remote)=>{
    const reply=Buffer.alloc(48); reply[0]=0x24; reply[1]=2;
    request.copy(reply,24,40,48); const now=Date.now(); writeTimestamp(reply,32,now); writeTimestamp(reply,40,now);
    server.send(reply,remote.port,remote.address);
  });
  try {const sample=await queryNtp('127.0.0.1',{port:server.address().port}); assert.ok(Math.abs(sample.unixMs-Date.now())<100);}
  finally {await new Promise(resolve=>server.close(resolve));}
});
test('NTP timeout rejects and does not leave an open socket',async()=>{
  const server=dgram.createSocket('udp4'); await new Promise(resolve=>server.bind(0,'127.0.0.1',resolve));
  try {await assert.rejects(queryNtp('127.0.0.1',{port:server.address().port,timeoutMs:20}),/timeout/);}
  finally {await new Promise(resolve=>server.close(resolve));}
});
test('time service deduplicates requests, uses fresh projected cache, and falls back to second provider',async()=>{
  let now=0, calls=[];
  const get=createTimeService({monotonic:()=>now, query:async host=>{
    calls.push(host); if(host==='time.cloudflare.com') throw new Error('offline');
    return {unixMs:1790000000000,at:now,source:host,uncertaintyMs:5,stratum:2};
  }});
  const [a,b]=await Promise.all([get(),get()]); assert.equal(a.unixMs,b.unixMs); assert.equal(calls.length,2);
  now=12000; const c=await get(); assert.equal(c.unixMs,a.unixMs+12000); assert.equal(c.sampleAgeMs,12000); assert.equal(calls.length,2);
  now=61000; await get(); assert.equal(calls.length,4);
});
test('failed time source is never labelled as synchronized',async()=>{
  let now=0; const get=createTimeService({monotonic:()=>now,query:async()=>{throw new Error('unreachable');}});
  await assert.rejects(get()); await assert.rejects(get()); now=11000; await assert.rejects(get());
});
test('browser time chooses minimum RTT, ignores device clock jumps, and expires',async()=>{
  let mono=0, wall=0, index=0;
  const rtts=[100,20,60];
  const clock=new NetworkClock({monotonic:()=>mono,wall:()=>wall,fetcher:async()=>{
    const rtt=rtts[index++]; mono+=rtt;
    return {ok:true,json:async()=>({protocol:'NTP',source:'time.cloudflare.com',unixMs:1790000000000+mono-rtt/2,sampleAgeMs:0,uncertaintyMs:1})};
  }});
  assert.equal(await clock.sync(),true); assert.equal(clock.anchor.rtt,20); assert.equal(clock.synchronized,true);
  const initial=clock.now(); wall+=864000000; mono+=1000; assert.equal(clock.now(),initial+1000);
  mono+=900000; assert.equal(clock.synchronized,false);
});
test('failed and malformed API responses cannot silently use the device clock as NTP',async()=>{
  const unavailable=new NetworkClock({fetcher:async()=>({ok:false}),wall:()=>1234});
  assert.equal(await unavailable.sync(),false); assert.equal(unavailable.synchronized,false); assert.equal(unavailable.now(),1234);
  const malformed=new NetworkClock({fetcher:async()=>({ok:true,json:async()=>({protocol:'NTP',unixMs:'bad'})})});
  assert.equal(await malformed.sync(),false);
});
test('time endpoint rejects POST and disables all response caches',async()=>{
  const headers={}; let body=''; const response={setHeader:(k,v)=>headers[k]=v,end:text=>body=text};
  await time({method:'POST'},response);
  assert.equal(response.statusCode,405); assert.equal(headers.Allow,'GET'); assert.match(headers['Cache-Control'],/no-store/); assert.match(body,/Method not allowed/);
});
test('WIB calendar crosses midnight independently of device timezone',()=>{
  assert.equal(wibDate(Date.parse('2026-09-16T16:59:59Z')),'2026-09-16');
  assert.equal(wibDate(Date.parse('2026-09-16T17:00:00Z')),'2026-09-17');
});
