# Midea Daily Energy Report

Website untuk mengisi reading meter JRE dan UNILAND, menghitung konsumsi per periode, dan menyalin laporan harian serta baris worksheet Excel.

Input utama berupa tabel dengan ratio tetap untuk setiap meter. Aplikasi memakai HTML, CSS, JavaScript, dan satu endpoint Node.js untuk waktu. Tidak ada dependency npm, framework UI, SDK AI, analytics, database, atau API key.

## Jalankan lokal

Gunakan Node.js 22.

```sh
npm run dev
```

Buka http://127.0.0.1:3000. Tidak perlu `npm install` karena tidak ada dependency. Jangan membuka `index.html` melalui `file://`: ES modules dan endpoint waktu membutuhkan HTTP.

```sh
npm test
npm run build
npm run preview
```

`build` menyalin file frontend ke `dist/`. `preview` menjalankan hasil build bersama endpoint waktu lokal.

## Cara pakai

1. Pilih JRE atau UNILAND, lalu isi tanggal reading awal dan akhir.
2. Isi angka kumulatif pada kedua kolom. Ratio ditampilkan di samping setiap meter dan tidak bisa diedit melalui tabel.
3. Gunakan Tab untuk pindah kolom atau Enter untuk pindah meter pada kolom yang sama. Cari nama equipment untuk mempersempit tabel.
4. Bisa tempel satu kolom reading atau dua kolom awal/akhir dari Excel. Tempel hanya angkanya, tanpa header, mengikuti urutan meter yang terlihat. Satu baris Excel mewakili satu meter. Data yang melebihi area tujuan atau berisi angka rusak ditolak seluruhnya.
5. Isi utility harian jika tersedia. Nilainya adalah pemakaian langsung, bukan turunan dari meter listrik.
6. Periksa catatan sebelum menyalin laporan. Kolom kosong dan angka yang tidak valid memblokir tombol salin. Gunakan `-` untuk data yang memang tidak tersedia.
7. **Salin gabungan** tersedia setelah kedua pabrik terisi dan tanggal awal serta akhirnya sama.
8. **Salin baris Excel** menghasilkan TSV. JRE memakai tanggal lengkap `YYYY-MM-DD` sebagai kolom pertama. UNILAND memakai 16 kolom sesuai template, tanpa tambahan tanggal. Nilai yang tidak tersedia ditulis `-`.
9. **Simpan draft** menyimpan kedua pabrik di browser ini. Ctrl+S juga menyimpan draft. Data tidak tersimpan otomatis saat mengetik.
10. **Lanjut hari berikutnya** memindahkan reading akhir menjadi reading awal dan mengosongkan reading akhir serta utility. Simpan kembali draft untuk mempertahankan perubahan.

Impor teks tersedia untuk satu snapshot reading lengkap. Sertakan satu baris tanggal dan semua equipment. Parser mendukung angka desimal, ratio dari template, dan baris lanjutan Injection Molding. Teks dengan dua tanggal, duplikat equipment, jumlah meter yang salah, atau angka rusak ditolak. Ratio yang berbeda tetap memakai konfigurasi pabrik dan disertai catatan pada laporan.

**Isi contoh**, **Kosongkan**, impor, dan perpindahan hari dapat dibatalkan satu langkah. Data contoh diberi penanda agar tidak tertukar dengan data operasional.

## Periode laporan

Kedua pabrik memakai **tanggal reading awal**, sesuai keputusan pengguna yang menggantikan instruksi tanggal akhir pada template UNILAND lama.

```text
Reading awal : 16 September 2026 sekitar 08.00 WIB
Reading akhir: 17 September 2026 sekitar 08.00 WIB
Judul laporan: SEPTEMBER 16, 2026 - 24 HOURS
```

Ini periode antar-reading, bukan konsumsi kalender pukul 00.00 sampai 24.00. Waktu 08.00 adalah asumsi operasional dari template; aplikasi tidak merekam jam pengambilan setiap meter.

Tanggal harus valid dan bergerak maju. Periode lebih dari satu hari diberi catatan dan judul sesuai durasinya, misalnya `48 HOURS`, sehingga tidak dilabeli 24 jam. Waktu NTP hanya membantu pemilihan tanggal dan jam WIB. Sinkronisasi tidak mengubah periode yang sedang diisi.

## Perhitungan

```text
Konsumsi setiap meter = (reading akhir - reading awal) × factor
Konsumsi equipment = jumlah konsumsi masing-masing meter
```

Konfigurasi lengkap ada di `schema.js`. Nama, kapitalisasi, dan urutan equipment mengikuti template: JRE 29 equipment dengan 57 meter; UNILAND 28 equipment dengan 28 meter. Injection Molding JRE memiliki 13 meter dan Server Room memiliki 2 meter.

Aturan JRE yang perlu diperhatikan:

- Total berasal dari selisih main meter, tanpa ratio 1000 dan tanpa menjumlahkan sub-meter.
- All Office Building memakai ×1000.
- Utility Area memakai ×1000 pada meter pertama dan ×40 pada meter kedua.
- `394,850` berarti `394.850`, sehingga Office `394,850` ke `395,250` menghasilkan `400.00 kWh`.
- Utility `660,610 + 29,09` ke `660,700 + 29,53` menghasilkan `107.60 kWh`.
- Piping All adalah Piping Building 1# + Piping Building 3#, bukan meter baru.
- Cross-check membandingkan Total dengan jumlah equipment 2 sampai 29. Jika ada sub-meter yang hilang atau invalid, jumlah sub-meter dan gap tidak ditampilkan sebagai angka lengkap. Gap tidak otomatis berarti salah karena cakupan meter dapat berbeda.
- `-` boleh menjadi nol hanya untuk Air Compressor 1# dan New Air Compressor 2# setelah **Unit tidak aktif** ditandai. Konfirmasi tersebut berlaku untuk periode yang sedang diisi dan direset saat lanjut hari berikutnya.
- Hasil bukan nol ditulis dua desimal. Nol ditulis `0 kWh`.

Aturan UNILAND:

| Equipment | Factor | Satuan hasil |
| --- | --- | --- |
| Total | 3200 / 1000 | MWh |
| Trafo 1, 2, 3 | Selisih langsung; raw meter sudah MWh | MWh |
| Building A, PP hydrant | 160 / 1000 | MWh |
| Building B | 80 / 1000 | MWh |
| SDP pompa, Dp power house | 20 / 1000 | MWh |
| Refrigant and LPG area | 40 | kWh |
| Equipment lainnya | Selisih langsung | kWh |

Kapitalisasi `Mwh` pada Trafo 3 dan `KWh` pada Refrigant and LPG area tetap mengikuti teks laporan template. Utility ditempatkan setelah seluruh 28 equipment.

```text
Indoor Area = Indoor + Vacum box indoor
Outdoor Area = Outdoor + Vacum box outdoor + Line compressor outdoor
```

Kedua kelompok tersebut hanya untuk worksheet. Laporan utama tetap menampilkan masing-masing equipment. UNILAND mempertahankan desimal hasil yang relevan, termasuk `0.6912 MWh`, tanpa pemisah ribuan atau notasi eksponen.

## Validasi angka

- Koma dan titik diterima sebagai pemisah desimal tunggal. Pemisah ribuan, notasi eksponen, teks tambahan, dan angka negatif ditolak agar tidak ditebak.
- Batas input: enam angka desimal, nilai kumulatif maksimum 1000000000000. Pengurangan memakai integer berskala melalui BigInt untuk mempertahankan selisih kecil pada counter besar.
- Reading yang turun menghasilkan `-` untuk equipment tersebut dan catatan pemeriksaan. Equipment lain tetap dihitung. Reset/rollover perlu diperiksa manual, tidak dikoreksi otomatis.
- Jumlah meter wajib cocok dengan template pada kedua reading. Satu meter hilang membuat hasil equipment tidak lengkap.
- Kenaikan yang melebihi **100 unit raw dan 50% reading awal** diberi peringatan. Ini pemeriksaan sederhana, bukan analisis pola historis atau batas beban mesin.
- Laporan memasukkan `CHECK RAW DATA` jika diperlukan. Tidak ada substitusi nol untuk missing data di worksheet.

## Sinkronisasi waktu

Browser meminta `GET /api/time` secara asynchronous. Endpoint Node.js melakukan permintaan NTP ke `time.cloudflare.com`, dengan `time.google.com` sebagai cadangan. Endpoint tidak menerima atau mengirim reading meter.

- Timeout 1,6 detik per sumber; socket selalu ditutup.
- Balasan diperiksa: asal permintaan, panjang paket, versi, mode, stratum, status leap, timestamp, dan kualitas waktu.
- Sampel NTP disimpan maksimal 60 detik per instance server. Waktu respons diproyeksikan dari sampel menggunakan clock monotonic. Permintaan bersamaan memakai proses sinkronisasi yang sama.
- Respons HTTP diberi `no-store`. Browser mengambil tiga sampel dan memilih round-trip terendah, dengan kompensasi setengah waktu perjalanan sebagai perkiraan.
- Jam berjalan menggunakan `performance.now()`. Perubahan jam perangkat setelah sinkronisasi tidak langsung menggeser waktu yang ditampilkan.
- Sinkronisasi ulang setiap lima menit saat halaman terlihat, ketika tab kembali aktif, atau koneksi kembali online. Kegagalan dicoba lagi setelah satu menit. Status tersinkron kedaluwarsa setelah 15 menit tanpa pembaruan.
- Jika semua sumber gagal, endpoint mengembalikan 503. Halaman menunjukkan jam perangkat atau sampel terakhir dengan status belum tersinkron. Pengisian manual tetap berjalan; tombol periode otomatis membutuhkan sinkronisasi yang berhasil.

Akses UDP keluar port 123 diperlukan pada server. NTP di sini bukan NTS dan tidak ditujukan sebagai acuan waktu presisi untuk kontrol mesin atau audit bertanda tangan. Implementasi memeriksa paket dan menampilkan perkiraan ketidakpastian waktu, tetapi tidak menjanjikan ketepatan milidetik.

Referensi: [Cloudflare Time Services](https://developers.cloudflare.com/time-services/ntp/usage/) dan [spesifikasi NTP v4](https://www.rfc-editor.org/rfc/rfc5905).

## Deploy ke Vercel

1. Import repository ke Vercel.
2. Gunakan root repository ini, preset **Other**, dan Node.js **22.x**. Hapus override lama dari project jika masih memakai konfigurasi framework sebelumnya.
3. `vercel.json` menetapkan build command `npm run build`, output `dist`, dan durasi maksimum 10 detik untuk `api/time.js`. Tidak ada environment variable yang wajib diisi.
4. Jalankan deployment. Vercel menyajikan frontend statis dan memasang `/api/time` sebagai Node.js Function dari direktori `api/`.
5. Buka URL hasil deploy dan periksa status **NTP tersinkron**. `GET /api/time` harus menghasilkan JSON dengan `protocol: "NTP"`, timestamp, sumber, dan umur sampel. Jika 503, periksa akses UDP port 123 dari runtime dan ketersediaan sumber waktu.

Konfigurasi mengikuti [Vercel Node.js Functions](https://vercel.com/docs/functions/runtimes/node-js). `npm run build` memeriksa hasil build lokal, bukan bukti deployment production sudah berjalan. Deployment tidak dilakukan hanya dengan menjalankan build tersebut.

Frontend juga bisa disajikan oleh hosting statis, tetapi sinkronisasi NTP membutuhkan endpoint yang sama. GitHub Pages saja tidak menjalankan endpoint Node.js ini.

## Penyimpanan dan pemeriksaan

Draft tersimpan menggunakan key `midea_energy_draft_v4` di localStorage, hanya setelah tombol simpan ditekan. Draft tetap berada di perangkat/browser yang sama; tidak disinkronkan antarperangkat. **Hapus draft tersimpan** menghapus draft dan baseline versi lama di browser itu. Data yang sedang dibuka tetap ada di memori halaman.

Baseline versi lama tidak otomatis dimigrasikan karena aturan ratio berubah. Gunakan impor yang memvalidasi template jika ingin memindahkan reading lama. Data dari tombol **Isi contoh** dibuat untuk pengujian, bukan data historis pabrik.

`npm test` mencakup ratio, tanggal, format output, missing data, decimal precision, validasi impor, TSV, draft, NTP UDP, timeout, cache, dan kegagalan sinkronisasi. Pengujian otomatis memakai server UDP lokal dan sumber waktu tiruan agar tidak tergantung koneksi internet. Koneksi NTP publik diperiksa terpisah saat menjalankan website.

File utama:

| File | Fungsi |
| --- | --- |
| `schema.js` | Nama equipment, jumlah meter, ratio, satuan utility |
| `engine.js`, `numbers.js` | Validasi dan perhitungan |
| `worksheet.js`, `importer.js` | Worksheet dan impor reading |
| `app.js`, `index.html`, `style.css` | Tabel input dan tampilan laporan |
| `storage.js` | Validasi draft tersimpan dan pindah hari |
| `clock.js`, `api/time.js`, `server/ntp.js` | Sinkronisasi waktu |
| `scripts/` | Server lokal dan build |
| `tests/` | Pengujian tanpa dependency tambahan |
