# Snapshot data website asal

Diambil 1 Oktober 2026 sekitar 11:32–11:35 UTC dari akun Cloudflare yang terhubung ke MCP. Website asal `tugas-app.pages.dev` memakai Worker `tugas-worker`, binding D1 `DB` ke `tugas-db`, serta binding R2 `TASK_FILES` ke `task-files` dan `SUBMISSION_FILES` ke `submission-files`. Identitas ini dicocokkan melalui konfigurasi binding Worker produksi, bukan dari kemiripan nama saja.

## Lokasi snapshot lokal

Semua berkas berada di `data/source-snapshot/` dan terabaikan oleh Git:

- `tugas-db.sql`: ekspor D1 lengkap, skema dan seluruh baris, pada bookmark `000000b5-00000000-000050f7-bedcc80cbb45a1ce5e13ad8a0ae5330d`. SHA-256: `b581054737d7b116dc783a9348db3260c7e9c55d414ee40c0a1b86d3a6ac52bd`.
- `tugas-db.sqlite`: hasil impor ekspor SQL untuk inspeksi dan migrasi nanti.
- `r2/task-files/` dan `r2/submission-files/`: salinan objek R2 dengan key asli.
- `r2-manifest.json`: key, ukuran, ETag, waktu modifikasi, tipe media, dan asal publik setiap objek.
- `r2-verification.json` dan `verification-report.json`: hasil verifikasi.
- `download-r2.mjs` dan `verify.mjs`: alat untuk melanjutkan unduhan dan memeriksa snapshot.

## Struktur D1 asal

| Tabel | Baris | Kolom |
| --- | ---: | --- |
| `teachers` | 2 | `id`, `email`, `password_hash`, `created_at` |
| `classes` | 8 | `id`, `teacher_id`, `name`, `created_at` |
| `students` | 277 | `id`, `class_id`, `name`, `created_at` |
| `tasks` | 4 | `id`, `teacher_id`, `title`, `description`, `subject`, `deadline`, `file_url`, `task_code`, `submission_type`, `created_at` |
| `task_classes` | 5 | `task_id`, `class_id` |
| `submissions` | 37 | `id`, `task_id`, `student_name`, `student_class`, `file_url`, `student_note`, `created_at` |
| `submit_rate_buckets` | 2 | `bucket_key`, `hits`, `expires_at` |
| `submit_slots` | 0 | `id`, `task_id`, `expires_at` |

Relasi: `classes.teacher_id → teachers.id`, `students.class_id → classes.id`, `tasks.teacher_id → teachers.id`, `task_classes.task_id → tasks.id`, `task_classes.class_id → classes.id`, dan `submissions.task_id → tasks.id`. Definisi lengkap, indeks, nilai default, dan data berada di dump SQL.

`tasks.file_url` berisi satu URL lampiran atau NULL. `submissions.file_url` berisi teks JSON array URL. Berkas di R2 memakai key asli tanpa awalan folder. Snapshot memuat 2 objek `task-files` (797.069 byte) dan 37 objek `submission-files` (46.560.804 byte), total 39 objek (47.357.873 byte).

Akun yang sama juga memiliki bucket lama `kumpultugas-files` berisi 3 objek, tetapi bucket itu tidak terikat ke `tugas-worker`, domain publiknya nonaktif, dan tidak ada URL-nya dalam `tugas-db`. Bucket itu tidak termasuk snapshot website asal ini; inventarisnya telah diperiksa agar batas cakupan eksplisit.

## Pemeriksaan dan migrasi berikutnya

`PRAGMA integrity_check` menghasilkan `ok`; `PRAGMA foreign_key_check` tidak menemukan pelanggaran. Semua 39 objek terunduh cocok ukuran dan ETag, semua URL berkas dalam D1 menunjuk objek yang ada, dan tidak ada objek inventaris yang tidak dirujuk.

Database replika di `data/tugas.sqlite` belum diubah. Skemanya mirip, tetapi `teachers.password_hash` pada asal memakai format PBKDF2 sedangkan server replika sekarang memeriksa bcrypt; perlu adaptasi autentikasi atau pengaturan ulang sandi saat migrasi. Kolom `description` dan `student_note` asal dapat NULL, sementara replika memakai string kosong sebagai default. `created_at` asal memakai format waktu SQLite. URL R2 perlu diarahkan ulang ke penyimpanan tujuan saat akun baru tersedia. Tabel `submit_rate_buckets` dan `submit_slots` adalah status pembatasan pengiriman; tetap tersimpan dalam ekspor lengkap.

Snapshot ini adalah keadaan sumber pada waktu pengambilan. Karena website asal masih menerima kiriman, periksa perubahan sejak bookmark sebelum migrasi akhir agar baris dan objek baru ikut terbawa. Jangan masukkan dump, manifest, atau media ini ke Git; berkas memuat data guru dan siswa.
