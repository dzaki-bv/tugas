# Status migrasi Cloudflare

Pada 1 Oktober 2026, snapshot sumber di [SOURCE_SNAPSHOT.md](SOURCE_SNAPSHOT.md) dipindahkan ke akun Cloudflare tujuan `decf089cc411f44bb51c8e78e7135547`.

| Resource tujuan | Hasil |
| --- | --- |
| D1 `tugas-db` | Dibuat di region APAC, ID `2633955f-71c0-4563-80d3-52963daf9fd4`. Ekspor SQL sumber diimpor penuh: 8 tabel dan 335 baris total. Jumlah baris setiap tabel cocok dengan sumber. |
| R2 `task-files` | 2 objek, 797.069 byte. Semua key, ukuran, dan ETag cocok dengan manifest sumber. |
| R2 `submission-files` | 37 objek, 46.560.804 byte. Semua key, ukuran, dan ETag cocok dengan manifest sumber. |
| URL berkas di D1 | 2 URL tugas dan 37 JSON array URL kiriman telah diarahkan ke domain R2 tujuan. Tidak ada URL R2 sumber yang tertinggal pada kolom tersebut. |
| Akun guru | Kedua baris `teachers` ikut diimpor. Sandi yang diberikan pengguna telah diuji cocok dengan hash PBKDF2 asal; hash yang sama tetap berlaku. Sandi teks biasa tidak dicatat dalam repo. |

Domain publik tujuan:

- `task-files`: `https://pub-8f313bb90a194fc185f0e4319a7201dd.r2.dev`
- `submission-files`: `https://pub-76de1050ffe64a1bb900d33b4a48c3be.r2.dev`

Kedua domain dikelola R2 dan statusnya **enabled**. Pemeriksaan unduh langsung melalui jaringan lokal terhalang oleh sertifikat `internetbaik.telkomsel.com` yang dikembalikan jaringan untuk host `r2.dev`. Verifikasi objek dilakukan melalui API Cloudflare memakai key, ukuran, dan ETag.

Worker `tugas` di akun tujuan telah dideploy pada `https://tugas.dzaki-fird.workers.dev/`. Kode API ada di `worker.mjs`; binding `DB` menuju D1 tujuan, `TASK_FILES` dan `SUBMISSION_FILES` menuju bucket R2 tujuan, `ASSETS` melayani frontend, dan `ADMIN_SETUP_KEY` merupakan secret Worker. Kunci admin tersimpan lokal di `.env.production` (diabaikan Git). Worker memakai compatibility date `2026-09-30` dan flag `formdata_parser_supports_files` agar unggah multipart menghasilkan objek File.

Seluruh URL media pada D1 sekarang menuju rute `/media/task/` atau `/media/submission/` di origin Worker tujuan; rute tersebut mengambil objek dari R2. Jumlah akhir tabel tetap 335 baris, termasuk kedua akun guru, 4 tugas, dan 37 pengumpulan. Jumlah rujukan media tetap 2 tugas dan 37 pengumpulan. Kedua akun guru lama berhasil login; kelas, tugas, pengumpulan, pemakaian penyimpanan, dan media lama terbaca. Uji buat/ubah/hapus kelas, tambah siswa, buat/hapus tugas, unggah lampiran dan kiriman, serta baca media baru berhasil; seluruh data uji dibersihkan.

Rute media mendukung `HEAD` dan permintaan byte `Range` untuk player audio/video. Respons rentang mengirim HTTP 206, `Content-Range`, `Content-Length`, dan `Accept-Ranges`; respons di luar ukuran berkas mengirim HTTP 416. Ini memperbaiki durasi yang sempat berubah saat player audio memuat berkas. Pada audio Muhammad Daffa, durasi browser 87,800792 detik cocok dengan berkas asli; potongan byte awal dan akhir dari deployment telah dibandingkan dengan snapshot lokal dan cocok.

Modal kelas sekarang memakai satu kotak teks berisi semua nama siswa, satu nama per baris, tanpa daftar terpisah dengan tombol hapus. `PUT /api/classes/:id/students` menyimpan isi kotak sebagai daftar lengkap dan mempertahankan ID baris yang namanya tetap ada. Uji langsung pada kelas percobaan membuktikan tambah/hapus nama dan pelestarian ID; kelas percobaan dihapus setelah uji. Rute SPA langsung seperti `/kelas` juga kembali melayani `index.html`.

Pada 1 Oktober 2026 pukul 12:59 UTC, API website asal diperiksa lagi melalui kedua akun guru: jumlah dan isi kelas, siswa, tugas, pengumpulan, dan hubungan tugas–kelas masih cocok dengan snapshot (tidak ada baris baru, hilang, atau berubah). MCP sumber tidak lagi terhubung, sehingga perubahan pada daftar akun guru dan objek R2 yang tidak dirujuk database setelah snapshot belum dapat diperiksa secara langsung.

Salinan lokal di `data/source-snapshot/` tetap tersedia dan diabaikan Git.

Pada 5 Oktober 2026, delapan kelompok bug hasil audit diperbaiki dan dideploy ke Worker tujuan: zona waktu, unggahan ulang bersamaan, identitas saat kelas berganti nama, urutan berkas, respons daftar siswa yang terlambat, ekspor ZIP parsial, batas unggahan Worker, dan respons sumber daya lokal yang hilang. Deployment ID `1509b83ced5541e68369ed63b3431315`; entry frontend `index-d4d83349.js`.

Pada 14 Oktober 2026, fitur **Edit Tugas** dideploy ke Worker `tugas` pada akun `dzaki.fird@gmail.com`, di `https://tugas.dzaki-fird.workers.dev/`. Versi `e968ecdece724b96be8bb35f1bc03824` memakai entry frontend `index-fe6f1909.js`. Tombol di sebelah Hapus membuka form judul, mata pelajaran, deskripsi, dan deadline WIB; `PUT /api/tasks/:id` memvalidasi pemilik dan data sebelum menyimpan. Binding D1, R2, dan secret dipertahankan. Build dan 23 tes lokal lulus; sembilan aset produksi cocok dengan build. Uji produksi membuat akun dan tugas sementara, mengedit dan membaca ulang hasilnya, lalu menghapus seluruh data percobaan. Website lama `tugas-app.pages.dev` tidak diubah.

Pembaruan berikutnya pada 14 Oktober 2026 memisahkan pemuatan kapasitas dari daftar tugas. Angka kapasitas terakhir disimpan di localStorage per ID guru, langsung ditampilkan jika tersedia, dan diperiksa ulang di latar belakang saat dashboard dimuat ulang atau datanya berubah. Nilai hanya diganti jika berbeda; kegagalan pengecekan mempertahankan cache tanpa indikator loading kapasitas. Versi `2352da21eef9422f8693b2170c4a5202` memakai entry `index-297587bf.js`; seluruh 26 tes lokal lulus, termasuk regresi pemuatan tugas dengan kapasitas yang tidak merespons dan pembaruan cache.

Migrasi identitas kelas mempertahankan 37 kiriman dan menautkan semuanya ke kelas yang benar. Jumlah sesudah migrasi: 2 guru, 8 kelas, 277 siswa, 5 tugas, 6 relasi tugas–kelas, 37 kiriman; `PRAGMA foreign_key_check` kosong. Bookmark D1 sebelum migrasi: `0000001b-00000000-000050fb-3b995a51f596a8829dd0a3213c81e992`. Seluruh 22 tes lokal lulus. Lima aset produksi termasuk modul `.mjs` cocok byte demi byte dengan hasil build; formulir `379010` terbuka di browser tanpa error dan menampilkan IX.6 tanpa pemilih kelas.

Pada 22 Oktober 2026, pengiriman yang tampak macet di 95% diperbaiki dan dideploy melalui akun `dzaki.fird@gmail.com`. Angka 95% sebelumnya ditampilkan sebelum transfer dimulai dan permintaan tidak memiliki timeout. Progress sekarang mengikuti byte unggahan; tahap menyimpan dimulai setelah transfer selesai, dengan batas menunggu respons 60 detik dan batas keseluruhan permintaan 5 menit. Kegagalan membuka kembali form serta mempertahankan file untuk dikirim ulang. Respons 429 non-JSON juga dapat dicoba ulang. Pemeriksaan kapasitas diganti dari satu `R2.head` per berkas menjadi `R2.list` berhalaman, tetap menghitung berkas yang dirujuk guru dan menegakkan batas 10 GB. Regresi dengan 160 kiriman mereproduksi 160 pembacaan metadata sebelum perbaikan; setelahnya tidak memerlukan pembacaan individual untuk kiriman baru.

Versi produksi `499cfd6d-e50f-4f14-9d96-d820b057e517` memakai entry `index-a198186d.js` dan chunk `SubmitPage-75b999a0.js`. Build dan seluruh 33 tes, termasuk handler form, berhasil. Uji produksi memakai akun dan tugas sementara: unggah dan unggah ulang audio 1 MB berhasil masing-masing sekitar 4,6 dan 4,7 detik; byte media, penghitungan kapasitas, satu baris pengumpulan, dan penghapusan objek lama diverifikasi. Akun, tugas, serta media percobaan dibersihkan. Satu percobaan jaringan awal melewati 30 detik, sementara pengulangan berhasil; penyebab koneksi pada HP di foto tidak dapat dipastikan tanpa trace permintaan perangkat tersebut.
