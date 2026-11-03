# Kumpulin

Tampilan React dan aset aplikasi asal `https://tugas-app.pages.dev/` disalin dari deploy publik, lalu URL API diarahkan ke origin yang sama. Deployment baru ada di `https://tugas.dzaki-fird.workers.dev/`, memakai `worker.mjs` dengan D1 dan R2 di akun Cloudflare tujuan. `server.mjs` tetap tersedia sebagai replika lokal berbasis SQLite dan berkas lokal. Data produksi tidak disalin ke Git.

## Menjalankan

Butuh Node.js 22.13 atau lebih baru.

```sh
npm ci
cp .env.example .env
```

Isi `ADMIN_SETUP_KEY` di `.env` dengan nilai acak yang kuat. Untuk membuat guru pertama, isi `TEACHER_EMAIL` dan `TEACHER_PASSWORD`, lalu jalankan `npm start`. Setelah akun terbentuk, hapus kedua nilai guru dari `.env`; akun tetap tersimpan di `data/tugas.sqlite`. Buka `http://localhost:8787`. Admin guru ada di `/admin` dan masuk dengan `ADMIN_SETUP_KEY`.

```sh
npm test
```

`PORT` dan `DATA_DIR` dapat diatur melalui lingkungan. URL berkas disimpan relatif (`/files/...`), sehingga tidak bergantung pada header `Host` maupun domain proxy. Kapasitas penyimpanan per guru adalah 10 GB, sesuai indikator di dasbor; `STORAGE_LIMIT_BYTES` tersedia untuk pengujian batas dengan nilai kecil. Folder `data/`, `.env`, dan unduhan ZIP diabaikan Git.

## Fitur dan alur yang dipetakan

| Area | Perilaku |
| --- | --- |
| Beranda | Siswa mencari tugas dengan kode 6 digit; guru login dengan email dan password. |
| Dasbor guru | Menampilkan kuota 10 GB, daftar tugas, buat tugas, unduh semua tugas, hapus semua tugas. Mulai 10 tugas muncul kotak pencarian (judul, mapel, kode); daftar ditampilkan 50 per langkah lewat tombol **Tampilkan 50 lagi**. Halaman Kelas memakai pola yang sama. |
| Kelas | Buat, ubah nama, dan hapus kelas; seluruh nama siswa ditampilkan dalam satu kotak teks (satu per baris). Tombol **Simpan daftar** menambah nama baru dan menghapus nama yang dihilangkan dari kotak. |
| Buat tugas | Judul, mata pelajaran, deadline, deskripsi opsional, jenis kiriman gambar/video/audio, target satu atau beberapa kelas, lampiran soal opsional. Tanpa target kelas, formulir siswa menerima kelas dan nama bebas. |
| Detail tugas | Kode dan tautan siswa, QR, lampiran soal, total pengumpulan, tepat waktu, terlambat, belum mengumpulkan, filter kelas, pratinjau, unduh per siswa dan massal, hapus tugas. Tombol **Lihat Semua** membuka satu halaman gulir berisi seluruh kiriman: dikelompokkan menurut nama siswa dan kelas, lalu setiap lembar foto diberi `Halaman i dari n`. Video dan audio tampil dengan pemutar dan urutan file. |
| Pengumpulan siswa | Pilih kelas dan nama dari daftar target, tambahkan hingga 20 berkas, tulis catatan opsional, kirim. Pengiriman ulang untuk nama dan kelas yang sama mengganti pengumpulan sebelumnya. Kiriman setelah deadline tetap diterima dan diberi status terlambat. |
| Admin | Halaman `/admin` memakai `X-Admin-Key` untuk melihat, menambah, dan menghapus akun guru. Halaman admin produksi hanya dapat dilihat sampai formulir Setup Key karena kunci itu tidak tersedia. |

### Unggah dan penyimpanan

- Frontend produksi mengirim `POST /api/tasks` sebagai `multipart/form-data` untuk tugas, termasuk lampiran `file` bila ada.
- Form siswa mengirim `POST /api/submissions` sebagai `multipart/form-data`: `task_code`, `task_id`, `student_name`, `class_id` (wajib jika tugas memiliki kelas) atau `student_class` (untuk tugas tanpa kelas), `student_note` opsional, lalu `file_0`, `file_1`, dan seterusnya. Setiap berkas harus berekstensi dari daftar izin tipe tugas; jika ekstensinya tidak dikenal tetapi MIME-nya cocok, ekstensi yang sesuai ditambahkan. Berkas disajikan dengan `nosniff`, dan tipe selain gambar, audio, video, PDF, dan teks diunduh sebagai lampiran.
- Gambar dibatasi 50 MB sebelum diproses; gambar besar diperkecil hingga sisi terpanjang 1200 px dan dapat menjadi JPEG. Video dan audio dibatasi 100 MB. Audio rekaman maksimal 10 menit; file audio yang diunggah dapat dikonversi ke MP3 di browser. Format HEIC/HEIF ditolak. Antarmuka siswa menyarankan HP untuk kamera/mikrofon.
- Pada produksi, lampiran soal teramati di host R2 publik `pub-f215…r2.dev` dan audio siswa di host R2 publik lain `pub-1ae…r2.dev`. Nama objek yang terlihat mengikuti pola `timestamp_acak_nama-asli.ext` tanpa folder status pada URL yang teramati. Pemisahan `Tepat Waktu` dan `Terlambat` pasti ada pada tampilan guru dan ZIP unduhan; susunan internal bucket R2 tidak dapat diverifikasi dari URL publik.
- Pada replika, metadata guru, kelas, siswa, tugas, sesi, dan kiriman disimpan di `data/tugas.sqlite`. Berkas disimpan secara fisik di `data/files/tasks/<id-tugas>/<timestamp>_<acak>_<nama-asli>` untuk lampiran dan `data/files/submissions/<id-tugas>/<kelas>/Tepat Waktu|Terlambat/<timestamp>_<acak>_<nama-asli>` untuk kiriman. Unggahan dialirkan dahulu ke `data/uploads/`, lalu dipindah setelah validasi. Gambar lebih dari 50 MB per file dan unggahan yang melewati kapasitas 10 GB ditolak oleh API. URL berkas `/files/...` dapat diakses siapa pun yang mengetahui tautannya, seperti URL R2 publik pada aplikasi asal. Jalur unduh guru `/api/files/blob?url=…` hanya menerima token guru pemilik berkas. Berkas lama dari versi replika pertama dengan lokasi langsung di `data/files/` tetap dapat dibaca.

### Unduh

| Aksi | Hasil |
| --- | --- |
| Satu siswa, tugas gambar | `Tugas_NAMA.pdf`, semua gambar siswa menjadi halaman PDF. |
| Satu siswa, audio/video | Satu berkas `Tugas_NAMA.ext`; jika banyak berkas, `Tugas_NAMA.zip` dengan nama `NAMA_1.ext`, dst. |
| Semua kiriman satu tugas gambar | `Semua_Tugas_JUDUL.pdf`, seluruh gambar digabung. |
| Semua kiriman satu tugas audio/video | `Semua_Tugas_JUDUL.zip` dengan `Kelas/Tepat Waktu/NAMA.ext` atau `Kelas/Terlambat/NAMA.ext`. |
| Semua tugas dari dasbor | `Semua_Tugas_YYYY-MM-DD.zip` dengan `Judul (Mata Pelajaran)/Kelas/Tepat Waktu/NAMA.ext` dan folder Terlambat bila ada. |

ZIP produksi yang diuji berisi 28 MP3 di `IX.1/Tepat Waktu/`, satu berkas per siswa, total sekitar 38 MB. Pada replika, ZIP seluruh tugas diuji lewat UI dengan berkas gambar, video, dan audio, termasuk jalur `CODEX FOTO TERLAMBAT (Uji Media)/Kelas Uji/Terlambat/Siswa Uji.png` serta jalur tepat waktu untuk tugas lain. PDF semua foto yang diunduh berisi 5 halaman dari 3 siswa; PDF per siswa berisi 2 halaman. Nama siswa terlihat di galeri dan nama berkas ZIP, sedangkan PDF mengikuti aplikasi asal yang berisi lembar gambar tanpa judul nama di tiap halaman. Arsip uji tetap di folder Downloads lokal dan tidak menjadi bagian repo.

### Pemeriksaan antarmuka

- Di Safari, dua PNG contoh dikirim dari formulir siswa dan tanda terima menunjukkan 2 halaman serta catatan. MP4 contoh juga berhasil dikirim dan diputar di tanda terima. Untuk audio, penolakan izin mikrofon memunculkan opsi unggah berkas; MP3 contoh berhasil dikirim dan diputar.
- Tugas melewati deadline tetap menerima unggahan dari Safari, menampilkan peringatan keterlambatan, lalu kiriman muncul pada tabel `Terlambat` dan folder fisik `.../Terlambat/`. Tugas tanpa target kelas menerima kelas dan nama yang diketik bebas.
- Di guru, **Lihat Semua** menampilkan 3 nama siswa dan 5 lembar gambar secara berurutan. Galeri video lokal berisi pemutar untuk 2 siswa; galeri audio produksi menampilkan `Semua Audio (28 siswa)`.
- QR untuk tautan pengumpulan ditampilkan dan tombol **Salin** menyalin URL tugas yang benar. Pratinjau per siswa, rekap tepat waktu/terlambat/belum, PDF, dan ZIP diperiksa dari UI.
- Kelas contoh dibuat melalui UI, diisi dua siswa sekaligus, lalu diubah namanya. Tugas baru yang menarget dua kelas menampilkan filter kelas dengan jumlah siswa belum mengumpulkan yang sesuai. Panel admin lokal dapat dibuka dengan Setup Key; penambahan, pembacaan, dan penghapusan guru contoh diuji melalui API terisolasi.
- Semua media uji dibuat secara sintetis di Mac dan disimpan di luar repo. Data siswa serta media produksi tidak diunggah ulang ke clone atau Git.

## API

Perubahan frontend dibangun dengan `npm run build`. Skrip `scripts/build-frontend.mjs` memakai bundle dasar yang disimpan di `public/assets`, menerapkan perubahan perilaku, lalu menghasilkan nama aset berdasarkan konten. Logika waktu WIB, identitas kelas, pengambilan siswa, dan ekspor ZIP ada di `public/assets/app-logic.mjs`. Aturan berkas, validasi tugas, dan query yang dipakai bersama oleh `server.mjs` dan `worker.mjs` ada di `api-shared.mjs`; deploy Worker harus menyertakan modul ini. Jalankan `npm test` setelah perubahan.

Tampilan mengikuti kanvas desain **Redesign Kumpulin** (design system v1, 3 November 2026): token warna terang/gelap, tipografi DM Sans/DM Mono, dan ikon garis ada di `scripts/frontend/theme.css` dan `scripts/frontend/icons.jsx`. Beranda, kerangka halaman guru, toast, dan dialog ditulis ulang di `scripts/frontend/teacher-ui.jsx`. Seluruh halaman siswa (form, perekam audio, pemilih nama, sheet unggah, tanda terima, layar galat) ada di `scripts/frontend/submit-page.jsx` dan menggantikan fungsi tampilan chunk `SubmitPage` asal. Mode gelap mengikuti pengaturan perangkat.

Migrasi `migrations/001-submission-identity.sql` menambahkan identitas kelas pada kiriman dan indeks unik untuk unggahan ulang. Server lokal menjalankannya otomatis dalam satu transaksi jika indeks `submission_identity` belum ada; kiriman ganda lama disisakan yang terbaru agar indeks dapat dibuat; D1 produksi sudah dimigrasikan pada 5 Oktober 2026. Jangan menjalankan `ALTER TABLE` tersebut dua kali. Deadline tanpa zona dibaca sebagai WIB; waktu pembuatan lama dari SQLite dibaca sebagai UTC. Unggahan ulang mengganti kiriman sebelumnya secara atomik, dan ZIP dibatalkan jika satu berkas gagal diunduh. Batas unggahan adalah 20 berkas, 50 MB per gambar, dan 100 MB per audio/video.

Batas panjang isian (`TEXT_LIMITS` di `api-shared.mjs`, juga dipasang sebagai `maxLength` di formulir): judul 200, mata pelajaran 100, deskripsi 5000, nama kelas 100, nama siswa 100, catatan 1000 karakter. API menolak isian yang lebih panjang dengan pesan berbahasa Indonesia. Di detail tugas, tabel kiriman dan tabel Belum punya pencarian serta tampil 50 per langkah; nama dan kelas dipotong tiga baris (teks lengkap di tooltip dan di penampil), catatan panjang dibuka lewat **lihat catatan**, dan filter kelas berubah menjadi dropdown bila lebih dari 8 kelas.

Migrasi `migrations/002-file-bytes.sql` menambahkan kolom `file_bytes` pada `tasks` dan `submissions` untuk D1. Worker mengisi kolom ini saat unggah dan menghitung kuota dengan `SUM`, sehingga bucket R2 tidak lagi didaftar pada setiap unggahan. Baris lama yang masih `NULL` diisi sekali dengan membaca daftar bucket. Migrasi ini wajib dijalankan di D1 sebelum Worker baru dideploy: `npx wrangler d1 execute tugas-db --remote --file migrations/002-file-bytes.sql`. Server lokal tetap menghitung kuota dari ukuran berkas di disk dan tidak memerlukan kolom ini.

Server melayani endpoint yang dipanggil frontend asli:

| Endpoint | Fungsi |
| --- | --- |
| `POST /api/auth/login`, `GET /api/auth/check` | Sesi guru |
| `GET/POST /api/classes`, `PUT/DELETE /api/classes/:id` | Kelas |
| `GET/POST /api/classes/:id/students`, `DELETE /api/students/:id` | Siswa |
| `GET/POST /api/tasks`, `GET/DELETE /api/tasks/:id` | Tugas guru |
| `GET /api/tasks/:id/submissions` | Kiriman guru |
| `GET /api/tasks/code/:code`, `GET /api/tasks/code/:code/classes/:classId/students` | Halaman siswa |
| `POST /api/submissions` | Unggah kiriman siswa |
| `GET /api/storage/usage`, `GET /api/files/blob` | Kuota dan unduh guru |
| `GET/POST /api/admin/teachers`, `DELETE /api/admin/teachers/:id` | Manajemen akun guru |

## Catatan keamanan dan batasan

- Frontend produksi menyimpan password guru di `sessionStorage` dan memasukkannya ke pesan WhatsApp “Hubungi Admin”. Replika menghapus password dari alur itu. Jangan menyalin perilaku tersebut kembali.
- Replika memakai aset frontend terkompilasi dari deploy publik. Kode sumber React dan Worker produksi tidak tersedia; API pengganti dibuat dari perilaku UI dan kontrak yang dipakai bundle. Replika dapat dijalankan dan diuji sendiri, tetapi bukan salinan sumber backend produksi.
- Akun Cloudflare MCP sumber pada 1 Oktober 2026 memuat deploy asal `tugas-app`, Worker `tugas-worker`, D1 `tugas-db`, serta bucket R2 `task-files` dan `submission-files`. Snapshot dan strukturnya dicatat di [SOURCE_SNAPSHOT.md](SOURCE_SNAPSHOT.md); hasil migrasi ke akun Cloudflare tujuan dicatat di [MIGRATION_STATUS.md](MIGRATION_STATUS.md).
- Beberapa URL R2 asal mempunyai akses publik. Repo sengaja tidak menyertakan nama siswa, media siswa, ZIP, token, atau kredensial produksi.
- Perekaman mikrofon langsung tidak diuji karena akses mikrofon ditolak saat pemeriksaan; jalur unggah MP3 cadangan berhasil diuji. Pemilih berkas Brave tidak menerima injeksi file dari otomasi, sehingga pengujian unggah antarmuka dilakukan melalui pemilih berkas asli Safari.
- Pada PNG sintetis yang sangat kecil, frontend asal menampilkan persentase kompresi negatif walaupun berkas tetap berhasil dikirim. Replika mempertahankan perilaku tampilan tersebut karena memakai aset frontend yang sama.
