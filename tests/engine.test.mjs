import test from 'node:test';
import assert from 'node:assert/strict';
import { PLANT_SCHEMAS } from '../schema.js';
import { createDraft, calculateDraft, generateFullIndonesiaReport } from '../engine.js';
import { scaledReading, parseFlexibleNumber, shiftDate } from '../numbers.js';
import { worksheetRowToTSV } from '../worksheet.js';
import { parseReading, planTablePaste } from '../importer.js';
import { restoreDrafts, nextDayDraft } from '../storage.js';

function complete(plant='JRE', start='2026-09-16', end='2026-09-17') {
  const draft=createDraft(plant,start,end);
  draft.rows.forEach(r=>{r.start.fill('1000'); r.end.fill('1000');});
  return draft;
}
function set(draft,name,start,end) {
  const ri=PLANT_SCHEMAS[draft.plantKey].rows.findIndex(r=>r.name===name);
  draft.rows[ri].start=Array.isArray(start)?start:[start];
  draft.rows[ri].end=Array.isArray(end)?end:[end];
  return ri;
}
function value(result,name) {return result.calculatedRows.find(r=>r.name===name).totalEnergy;}
function raw(draft,side='start') {
  return `${side==='start'?draft.startDate:draft.endDate}\n`+PLANT_SCHEMAS[draft.plantKey].rows.map((row,i)=>`${i+1}. ${row.name}: ${draft.rows[i][side].map((n,mi)=>`${n}${row.ratioLabel?.includes('/')?` ((Ratio ${row.ratioLabel.split('/')[0]})/1000)`:row.factors[mi]===1?'':` (Ratio ${row.factors[mi]})`}`).join(' + ')}`).join('\n');
}

test('fixed schemas match every meter in the supplied templates',()=>{
  assert.equal(PLANT_SCHEMAS.JRE.rows.length,29); assert.equal(PLANT_SCHEMAS.UNILAND.rows.length,28);
  const jre=PLANT_SCHEMAS.JRE.rows;
  assert.deepEqual(jre.map(r=>r.factors.length),[1,2,2,5,1,4,13,1,2,1,1,1,1,1,2,1,1,1,1,1,2,1,1,1,1,3,2,2,1]);
  assert.deepEqual(jre[17].factors,[1000]); assert.deepEqual(jre[27].factors,[1000,40]); assert.deepEqual(jre[0].factors,[1]);
  assert.deepEqual(PLANT_SCHEMAS.UNILAND.rows.map(r=>r.no),Array.from({length:28},(_,i)=>String(i+1)));
});
test('JRE main, Office, Utility and Piping use the documented examples',()=>{
  const d=complete(); set(d,'Total','5079757','5105040'); set(d,'All Office Building','394,850','395,250');
  set(d,'Utility Area',['660,610','29,09'],['660,700','29,53']);
  set(d,'Piping Building 1#','100','100.25'); set(d,'Piping Building 3#','200','205');
  const r=calculateDraft(d);
  assert.equal(value(r,'Total'),25283); assert.equal(value(r,'All Office Building'),400); assert.equal(value(r,'Utility Area'),107.6);
  assert.equal(r.worksheet.derived.pipingAll,15); assert.equal(r.subAreasSumKWh,522.6); assert.equal(r.gapKWh,24760.4);
  assert.match(r.reportSectionText,/18\. All Office Building: 400\.00 kWh/); assert.match(r.reportSectionText,/28\. Utility Area: 107\.60 kWh/);
  assert.match(r.reportSectionText,/CROSS-CHECK:/); assert.equal(r.issues.length,0);
});
test('multi-meter factors apply to paired differences before adding',()=>{
  const d=complete(); set(d,'Window',['100','200','300','400','500'],['110','201','302','403','504']);
  assert.equal(value(calculateDraft(d),'Window'),560);
});
test('UNILAND ratios, units, precision and worksheet sums match the examples',()=>{
  const d=complete('UNILAND'); set(d,'Total','712.33','716.11'); set(d,'Building A','3691.4','3695.72');
  set(d,'Indoor','24095.65','24228.1'); set(d,'Vacum box indoor','100','107.7');
  set(d,'Outdoor','1000','1149.1'); set(d,'Vacum box outdoor','2000','2405.1'); set(d,'Line compressor outdoor','200','231.05');
  set(d,'Refrigant and LPG area','20.08','22.31'); set(d,'Trafo 1','10','10.125');
  const r=calculateDraft(d); assert.equal(value(r,'Total'),12.096); assert.equal(value(r,'Building A'),.6912);
  assert.equal(value(r,'Trafo 1'),.125); assert.equal(value(r,'Refrigant and LPG area'),89.2);
  assert.equal(r.worksheet.derived.indoorArea,140.15); assert.equal(r.worksheet.derived.outdoorArea,585.25);
  assert.match(r.mainText,/2\. Trafo 1 : 0.125 MWh/); assert.match(r.mainText,/28\. Refrigant and LPG area  : 89.2 KWh/);
  assert.equal(r.worksheet.values.length,16); assert.equal(r.worksheet.headers[0],'Indoor Area');
});
test('both reports and JRE worksheet use the first reading date',()=>{
  const jre=calculateDraft(complete()); const uni=calculateDraft(complete('UNILAND'));
  assert.equal(jre.reportDate,'2026-09-16'); assert.equal(uni.reportDate,'2026-09-16');
  assert.match(uni.mainText,/SEPTEMBER 16, 2026 - 24 HOURS/);
  assert.ok(worksheetRowToTSV(jre.worksheet).startsWith('2026-09-16\t'));
  assert.match(generateFullIndonesiaReport(jre,uni),/Summary situation:\nA\) JRE/);
});
test('combined report enforces both endpoints, even when report dates match',()=>{
  const jre=calculateDraft(complete());
  const uni=calculateDraft(complete('UNILAND','2026-09-16','2026-09-18'));
  assert.throws(()=>generateFullIndonesiaReport(jre,uni),/Periode/);
  assert.match(uni.mainText,/48 HOURS/); assert.ok(uni.issues.some(i=>i.code==='DATE_GAP'));
  assert.throws(()=>generateFullIndonesiaReport(jre,calculateDraft(createDraft('UNILAND'))),/Lengkapi/);
});
test('zero main meter produces no invalid gap percentage',()=>{
  const r=calculateDraft(complete()); assert.equal(r.gapPercent,null); assert.match(r.mainText,/1\. Total: 0 kWh/);
  assert.doesNotMatch(r.reportSectionText,/NaN|Infinity/);
});
test('missing meters never become zero or a misleading partial total',()=>{
  const d=complete(); set(d,'Server Room',['1','-'],['2','3']); const r=calculateDraft(d);
  assert.equal(value(r,'Server Room'),null); assert.equal(r.subAreasSumKWh,null); assert.equal(r.gapKWh,null);
  assert.match(r.mainText,/27\. Server Room: -\n/); assert.ok(r.issues.some(i=>i.code==='UNAVAILABLE'));
  set(d,'Server Room','1','2'); assert.equal(calculateDraft(d).success,false);
});
test('JRE inactive exception needs confirmation and only applies to the two compressor rows',()=>{
  const d=complete(); const ri=set(d,'Air Compressor 1#','-','-');
  assert.equal(value(calculateDraft(d),'Air Compressor 1#'),null);
  d.rows[ri].inactive=true; assert.equal(value(calculateDraft(d),'Air Compressor 1#'),0);
  set(d,'Air Compressor 1#','-','400'); assert.equal(value(calculateDraft(d),'Air Compressor 1#'),0);
  const other=set(d,'Crusher Machine','-','-'); d.rows[other].inactive=true;
  assert.equal(value(calculateDraft(d),'Crusher Machine'),null);
});
test('UNILAND missing Trafo and missing grouped worksheet components stay unavailable',()=>{
  const d=complete('UNILAND'); set(d,'Trafo 1','-','-'); set(d,'Vacum box indoor','-','1');
  const r=calculateDraft(d); assert.equal(value(r,'Trafo 1'),null); assert.equal(r.worksheet.derived.indoorArea,null);
  assert.ok(worksheetRowToTSV(r.worksheet).startsWith('-\t'));
});
test('decreasing meters are flagged and excluded, with valid equipment still calculated',()=>{
  const d=complete(); set(d,'Total','1000','1200'); set(d,'Dehumidifier','2345','345');
  const r=calculateDraft(d); assert.equal(value(r,'Dehumidifier'),null); assert.equal(value(r,'Total'),200);
  assert.match(r.reportSectionText,/reading turun dari 2345 menjadi 345/); assert.equal(r.gapKWh,null);
});
test('large jumps produce a warning without modifying readings',()=>{
  const d=complete(); set(d,'Dehumidifier','1000','10000'); const r=calculateDraft(d);
  assert.equal(value(r,'Dehumidifier'),9000); assert.ok(r.issues.some(i=>i.code==='SUSPICIOUS_JUMP'));
});
test('blank, invalid, ambiguous and negative raw values block copying',()=>{
  for (const value of ['','-1','1,234.56','1.2.3','1 23','123abc','1e4','1000000000001','1.0000001']) {
    const d=complete(); set(d,'Total',value,'1234'); assert.equal(calculateDraft(d).success,false,value);
  }
  assert.equal(parseFlexibleNumber('394,850'),394.85); assert.equal(scaledReading('1000000000000'),1000000000000000000n);
});
test('decimal subtraction preserves small changes in large counters',()=>{
  const d=complete(); set(d,'All Office Building','999999999.123456','999999999.123457');
  assert.equal(value(calculateDraft(d),'All Office Building'),.001);
  const u=complete('UNILAND'); set(u,'Building A','100.000001','100.000002');
  assert.match(calculateDraft(u).mainText,/Building A : 0.00000016 MWh/);
});
test('invalid or reversed dates cannot be copied',()=>{
  for (const [start,end] of [['2026-02-31','2026-03-01'],['2026-09-17','2026-09-16'],['2026-09-17','2026-09-17']]) assert.equal(calculateDraft(complete('JRE',start,end)).success,false);
  assert.equal(shiftDate('2026-12-31',1),'2027-01-01'); assert.equal(shiftDate('2028-02-28',1),'2028-02-29');
});
test('utilities keep order, units, decimal normalization and water notes',()=>{
  const d=complete(); d.utilities[0].value='2,50'; d.utilities[4]={value:'99,26',note:'the process of filling the reservoir tank for hydrant water reserves'};
  const r=calculateDraft(d); assert.match(r.mainText,/- LPG: 2.5 Kg/); assert.match(r.mainText,/- Water: 99.26 m³ \(the process/);
  assert.doesNotMatch(r.mainText,/- Oxygen/); d.utilities[2].note='note without value'; assert.equal(calculateDraft(d).success,false);
});
test('importer accepts decimal commas, metadata and wrapped injection readings',()=>{
  const d=complete(); const text='Engineer\n[17/09/2026, 08:03] Engineer:\n'+raw(d).replace('7. Injection Molding: ','7. Injection Molding:\n');
  const r=parseReading(text,'JRE'); assert.equal(r.success,true,JSON.stringify(r.issues)); assert.equal(r.date,'2026-09-16'); assert.equal(r.values[6].length,13);
});
test('importer validates ratios and preserves their warning in calculated reports',()=>{
  const d=complete(); const parsed=parseReading(raw(d).replace('1000 (Ratio 1000)','1000 (Ratio 1)'),'JRE');
  assert.equal(parsed.success,true); assert.ok(parsed.issues.some(i=>i.code==='RATIO_MISMATCH'));
  d.importIssues=parsed.issues; assert.match(calculateDraft(d).reportSectionText,/ratio input 1, ratio template 1000/);
});
test('importer blocks two days, duplicate equipment, missing meter and junk suffixes',()=>{
  const text=raw(complete());
  for(const changed of [text+'\n'+text,text+'\n1. Total: 20',text.replace('27. Server Room: 1000 + 1000','27. Server Room: 1000'),text.replace('1. Total: 1000','1. Total: 1000 junk'),text.replace('1000 + 1000','1000 + + 1000')]) assert.equal(parseReading(changed,'JRE').success,false);
});
test('TSV paste preserves matrix position and rejects entire oversized or malformed blocks',()=>{
  const coords=[{ri:0,mi:0},{ri:1,mi:0},{ri:1,mi:1}];
  assert.deepEqual(planTablePaste('10\t20\n30\t40\n',coords,1,'start').map(c=>c.value),['10','20','30','40']);
  assert.throws(()=>planTablePaste('1\t2',coords,0,'end'));
  assert.throws(()=>planTablePaste('1\n2\n3\n4',coords,0,'start'));
  assert.throws(()=>planTablePaste('1\n2bad',coords,0,'start'));
});
test('saved drafts restore with exact readings and reject corrupt schema',()=>{
  const drafts={JRE:complete(),UNILAND:complete('UNILAND')};
  const saved=JSON.stringify({version:4,drafts}); const restored=restoreDrafts(saved);
  assert.deepEqual(restored.JRE.rows,drafts.JRE.rows);
  drafts.JRE.rows[26].end=['20']; assert.throws(()=>restoreDrafts(JSON.stringify({version:4,drafts})));
  assert.throws(()=>restoreDrafts('{broken'));
});
test('next day copies only the ending baseline and resets utilities and inactive confirmation',()=>{
  const d=complete(); d.utilities[0].value='12'; d.rows[11].inactive=true;
  const next=nextDayDraft(d); assert.equal(next.startDate,'2026-09-17'); assert.equal(next.endDate,'2026-09-18');
  assert.deepEqual(next.rows[0].start,d.rows[0].end); assert.equal(next.rows[0].end[0],''); assert.equal(next.rows[11].inactive,false); assert.equal(next.utilities[0].value,'');
  assert.throws(()=>nextDayDraft(createDraft('JRE','2026-09-16','2026-09-17')));
});
