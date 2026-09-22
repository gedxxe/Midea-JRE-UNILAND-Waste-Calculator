# Data dan keamanan

Reading meter dihitung di browser. Aplikasi tidak mengirim reading, utility, draft, atau laporan ke server. Endpoint `/api/time` hanya menerima GET tanpa payload meter dan mengambil waktu dari dua host NTP tetap.

Draft hanya ditulis ke localStorage setelah **Simpan draft** ditekan. Siapa pun yang menggunakan profil browser yang sama dapat membukanya. **Hapus draft tersimpan** menghapus data tersimpan; reading yang masih terbuka tetap berada di memori halaman sampai ditutup atau dikosongkan.

Teks input dan catatan ditampilkan lewat DOM text/value, bukan `innerHTML`. Content Security Policy membatasi script, style, gambar, dan koneksi browser ke origin yang sama. Header Vercel juga memblokir embedding halaman dan MIME sniffing. Build hanya menyalin file frontend yang tercantum, sehingga test dan file server tidak disajikan sebagai aset statis.

NTP menggunakan UDP dengan pemeriksaan sumber, timestamp asal, mode, dan status sinkronisasi. Host tujuan tidak dapat dipilih dari parameter request. Ini bukan NTS yang memakai autentikasi kriptografis. Jangan memakai jam aplikasi sebagai acuan kontrol mesin atau tanda waktu untuk audit resmi.

Tidak ada API key, login, analytics, atau credential cloud di runtime aplikasi. Logo, nama equipment, dan ratio tetap merupakan informasi pabrik. Akses dan publikasi repository mengikuti kebijakan pemiliknya.

Laporkan masalah dengan contoh minimal yang dapat direproduksi. Hindari menyertakan reading operasional yang tidak diperlukan, token, atau password.
