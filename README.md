# Sistem Tugas — replika mandiri

Replika aplikasi di `https://tugas-app.pages.dev/` dalam satu repo. Tampilan React dan aset yang terbit pada 30 September 2026 disalin dari deploy publik, lalu URL API diarahkan ke server dalam repo ini. API pengganti memakai SQLite dan berkas lokal; data produksi tidak disalin ke Git.

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

`PORT`, `DATA_DIR`, dan `PUBLIC_ORIGIN` dapat diatur melalui lingkungan. `PUBLIC_ORIGIN` diperlukan jika server berada di balik proxy dengan domain lain agar URL berkas dan tautan siswa memakai alamat yang benar. Folder `data/`, `.env`, dan unduhan ZIP diabaikan Git.

## Fitur dan alur yang dipetakan

| Area | Perilaku |
| --- | --- |
| Beranda | Siswa mencari tugas dengan kode 6 digit; guru login dengan email dan password. |
| Dasbor guru | Menampilkan kuota 10 GB, daftar tugas, buat tugas, unduh semua tugas, hapus semua tugas. |
| Kelas | Buat, ubah nama, dan hapus kelas; masukkan banyak nama siswa sekaligus (satu per baris), hapus siswa. |
| Buat tugas | Judul, mata pelajaran, deadline, deskripsi opsional, jenis kiriman gambar/video/audio, target satu atau beberapa kelas, lampiran soal opsional. Tanpa target kelas, formulir siswa menerima kelas dan nama bebas. |
| Detail tugas | Kode dan tautan siswa, QR, lampiran soal, total pengumpulan, tepat waktu, terlambat, belum mengumpulkan, filter kelas, pratinjau, unduh per siswa dan massal, hapus tugas. Tombol **Lihat Semua** membuka satu halaman gulir berisi seluruh kiriman: dikelompokkan menurut nama siswa dan kelas, lalu setiap lembar foto diberi `Halaman i dari n`. Video dan audio tampil dengan pemutar dan urutan file. |
| Pengumpulan siswa | Pilih kelas dan nama dari daftar target, tambahkan hingga 20 berkas, tulis catatan opsional, kirim. Pengiriman ulang untuk nama dan kelas yang sama mengganti pengumpulan sebelumnya. Kiriman setelah deadline tetap diterima dan diberi status terlambat. |
| Admin | Halaman `/admin` memakai `X-Admin-Key` untuk melihat, menambah, dan menghapus akun guru. Halaman admin produksi hanya dapat dilihat sampai formulir Setup Key karena kunci itu tidak tersedia. |

### Unggah dan penyimpanan

- Frontend produksi mengirim `POST /api/tasks` sebagai `multipart/form-data` untuk tugas, termasuk lampiran `file` bila ada.
- Form siswa mengirim `POST /api/submissions` sebagai `multipart/form-data`: `task_code`, `task_id`, `student_name`, `student_class`, `student_note` opsional, lalu `file_0`, `file_1`, dan seterusnya.
- Gambar dibatasi 50 MB sebelum diproses; gambar besar diperkecil hingga sisi terpanjang 1200 px dan dapat menjadi JPEG. Video dan audio dibatasi 100 MB. Audio rekaman maksimal 10 menit; file audio yang diunggah dapat dikonversi ke MP3 di browser. Format HEIC/HEIF ditolak. Antarmuka siswa menyarankan HP untuk kamera/mikrofon.
- Pada produksi, lampiran soal teramati di host R2 publik `pub-f215…r2.dev` dan audio siswa di host R2 publik lain `pub-1ae…r2.dev`. Nama objek yang terlihat mengikuti pola `timestamp_acak_nama-asli.ext` tanpa folder status pada URL yang teramati. Pemisahan `Tepat Waktu` dan `Terlambat` pasti ada pada tampilan guru dan ZIP unduhan; susunan internal bucket R2 tidak dapat diverifikasi dari URL publik.
- Pada replika, metadata guru, kelas, siswa, tugas, sesi, dan kiriman disimpan di `data/tugas.sqlite`. Berkas disimpan secara fisik di `data/files/tasks/<id-tugas>/<timestamp>_<acak>_<nama-asli>` untuk lampiran dan `data/files/submissions/<id-tugas>/<kelas>/Tepat Waktu|Terlambat/<timestamp>_<acak>_<nama-asli>` untuk kiriman. Unggahan dialirkan dahulu ke `data/uploads/`, lalu dipindah setelah validasi. URL unduh memakai `/files/...`; unduhan guru melalui `/api/files/blob?url=…` membutuhkan token. Berkas lama dari versi replika pertama dengan lokasi langsung di `data/files/` tetap dapat dibaca.

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
- Akun Cloudflare yang terhubung hanya menunjukkan Worker bernama `tugas`; daftar Pages dan D1 kosong, dan R2 belum aktif. Deploy produksi asal serta bucket yang dipakai URL publik tidak dapat diinspeksi melalui akun tersebut.
- Beberapa URL R2 asal mempunyai akses publik. Repo sengaja tidak menyertakan nama siswa, media siswa, ZIP, token, atau kredensial produksi.
- Perekaman mikrofon langsung tidak diuji karena akses mikrofon ditolak saat pemeriksaan; jalur unggah MP3 cadangan berhasil diuji. Pemilih berkas Brave tidak menerima injeksi file dari otomasi, sehingga pengujian unggah antarmuka dilakukan melalui pemilih berkas asli Safari.
- Pada PNG sintetis yang sangat kecil, frontend asal menampilkan persentase kompresi negatif walaupun berkas tetap berhasil dikirim. Replika mempertahankan perilaku tampilan tersebut karena memakai aset frontend yang sama.
