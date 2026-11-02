import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareFileFields, deadlineTimestamp, taskDates, submissionDates } from './public/assets/app-logic.mjs';
import { SQL, STORAGE_LIMIT_BYTES, MAX_IMAGE_BYTES, fileUrls, isInlineFile, isSubmissionType, parseClassIds, safeFileName, submissionFile, taskCode, taskFields, textTooLong, withClasses } from './api-shared.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const dataDir = resolve(process.env.DATA_DIR || join(root, 'data'));
const filesDir = join(dataDir, 'files');
const uploadDir = join(dataDir, 'uploads');
mkdirSync(filesDir, { recursive: true });
mkdirSync(uploadDir, { recursive: true });
const db = new DatabaseSync(join(dataDir, 'tugas.sqlite'));
db.exec(`PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS teachers (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE, expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS classes (id TEXT PRIMARY KEY, teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE, name TEXT NOT NULL, UNIQUE(teacher_id, name));
CREATE TABLE IF NOT EXISTS students (id TEXT PRIMARY KEY, class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE, name TEXT NOT NULL, UNIQUE(class_id, name));
CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE, title TEXT NOT NULL, subject TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', deadline TEXT NOT NULL, submission_type TEXT NOT NULL, task_code TEXT NOT NULL UNIQUE, file_url TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS task_classes (task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE, PRIMARY KEY(task_id, class_id));
CREATE TABLE IF NOT EXISTS submissions (id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, student_name TEXT NOT NULL, student_class TEXT NOT NULL, student_note TEXT NOT NULL DEFAULT '', file_url TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_tasks_teacher ON tasks(teacher_id);
CREATE INDEX IF NOT EXISTS idx_submissions_task ON submissions(task_id);`);

const now = () => new Date().toISOString();
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = (res, status, error) => res.status(status).json({ error });
// URL disimpan relatif terhadap origin, jadi header Host dari pengirim tidak ikut tersimpan.
function localFile(url) {
  try {
    const { pathname } = new URL(url, 'http://local');
    if (!pathname.startsWith('/files/')) return null;
    const absolute = resolve(filesDir, decodeURIComponent(pathname.slice('/files/'.length)));
    return absolute.startsWith(filesDir + sep) ? absolute : null;
  } catch { return null; }
}
const pathsOf = rows => rows.flatMap(row => fileUrls(row.file_url)).map(localFile).filter(Boolean);
const removeFiles = paths => { for (const path of paths) rmSync(path, { force: true }); };
function fileBytes(paths) {
  let bytes = 0;
  for (const path of paths) {
    try { bytes += statSync(path).size; }
    catch { /* Missing files are excluded from usage. */ }
  }
  return bytes;
}
const teacherFiles = teacherId => pathsOf(db.prepare(SQL.teacherFiles).all(teacherId, teacherId));
const taskFiles = taskId => pathsOf(db.prepare(SQL.taskFiles).all(taskId, taskId));
const storageLimitBytes = () => {
  const configured = Number(process.env.STORAGE_LIMIT_BYTES);
  return Number.isFinite(configured) && configured > 0 ? configured : STORAGE_LIMIT_BYTES;
};
function saveFile(file, folders, name) {
  const relative = [...folders.map(cleanFolder), `${Date.now()}_${randomBytes(4).toString('hex')}_${name}`];
  const destination = join(filesDir, ...relative);
  mkdirSync(resolve(destination, '..'), { recursive: true });
  renameSync(file.path, destination);
  return `/files/${relative.map(encodeURIComponent).join('/')}`;
}
const cleanFolder = name => String(name || 'Tanpa Kelas').replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 80) || 'Tanpa Kelas';

function migrateSubmissionIdentity() {
  const [addClassId, linkClasses, createIndex] = readFileSync(join(root, 'migrations/001-submission-identity.sql'), 'utf8').split(';').map(sql => sql.trim()).filter(Boolean);
  const hasClassId = db.prepare('PRAGMA table_info(submissions)').all().some(column => column.name === 'class_id');
  const superseded = [];
  db.exec('BEGIN');
  try {
    if (!hasClassId) db.exec(addClassId);
    db.exec(linkClasses);
    // Kiriman lama yang ganda akan menggagalkan indeks unik; yang terbaru dipertahankan.
    const identity = "lower(trim(n.student_name))=lower(trim(s.student_name)) AND coalesce('id:' || n.class_id,'name:' || lower(trim(n.student_class)))=coalesce('id:' || s.class_id,'name:' || lower(trim(s.student_class)))";
    const older = db.prepare(`SELECT s.rowid, s.file_url FROM submissions s WHERE EXISTS (SELECT 1 FROM submissions n WHERE n.task_id=s.task_id AND ${identity} AND (n.created_at > s.created_at OR (n.created_at = s.created_at AND n.rowid > s.rowid)))`).all();
    const remove = db.prepare('DELETE FROM submissions WHERE rowid=?');
    for (const row of older) { remove.run(row.rowid); superseded.push(row); }
    db.exec(createIndex);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  removeFiles(pathsOf(superseded));
}
if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='submission_identity'").get()) migrateSubmissionIdentity();

if (process.env.TEACHER_EMAIL && process.env.TEACHER_PASSWORD) {
  const email = process.env.TEACHER_EMAIL.trim().toLowerCase();
  if (!db.prepare('SELECT id FROM teachers WHERE email=?').get(email)) {
    db.prepare('INSERT INTO teachers VALUES (?,?,?,?)').run(randomUUID(), email, bcrypt.hashSync(process.env.TEACHER_PASSWORD, 12), now());
  }
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use((req, _res, next) => { req.body ??= {}; next(); });
app.use('/files', express.static(filesDir, {
  fallthrough: false,
  setHeaders: (res, path) => {
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!isInlineFile(path)) res.setHeader('Content-Disposition', 'attachment');
  },
}));
app.use('/assets', express.static(join(root, 'public/assets'), {
  immutable: true, maxAge: '1y', fallthrough: false,
  setHeaders: (res, path) => { if (path.endsWith(`${sep}index-Ci25O57r.js`)) res.setHeader('Cache-Control', 'no-store'); },
}));
const upload = multer({
  storage: multer.diskStorage({ destination: uploadDir, filename: (_req, _file, callback) => callback(null, randomUUID()) }),
  // Isian teks terpanjang (deskripsi 5000 karakter) jauh di bawah 100 KB.
  limits: { files: 20, fileSize: 100 * 1024 * 1024, fieldSize: 100 * 1024 },
});
app.use((req, res, next) => {
  res.on('finish', () => removeFiles([...(req.files || []), ...(req.file ? [req.file] : [])].map(file => file.path)));
  next();
});
function taskFor(row) { return withClasses([taskDates(row)], db.prepare(SQL.taskClasses).all(row.id))[0]; }
function taskById(id) { const row = db.prepare('SELECT * FROM tasks WHERE id=?').get(id); return row ? taskFor(row) : null; }
function tokenTeacher(req) {
  const token = /^Bearer (.+)$/i.exec(req.get('authorization') || '')?.[1];
  if (!token) return null;
  return db.prepare('SELECT t.id, t.email FROM sessions s JOIN teachers t ON t.id=s.teacher_id WHERE s.token_hash=? AND s.expires_at>?').get(hash(token), now());
}
function requireTeacher(req, res, next) {
  req.teacher = tokenTeacher(req);
  if (!req.teacher) return fail(res, 401, 'Sesi berakhir, silakan login kembali.');
  next();
}
function ownedTask(req) {
  return db.prepare('SELECT * FROM tasks WHERE id=? AND teacher_id=?').get(req.params.id, req.teacher.id);
}
function ownedClass(req) {
  return db.prepare('SELECT * FROM classes WHERE id=? AND teacher_id=?').get(req.params.id, req.teacher.id);
}
const studentsOf = classId => db.prepare(SQL.students).all(classId);

app.post('/api/auth/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const teacher = db.prepare('SELECT * FROM teachers WHERE email=?').get(email);
  if (!teacher || !bcrypt.compareSync(String(req.body.password || ''), teacher.password_hash)) return fail(res, 401, 'Email atau password salah');
  const token = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(token), teacher.id, new Date(Date.now() + 30 * 86400000).toISOString());
  res.json({ token, teacher_id: teacher.id });
});
app.get('/api/auth/check', requireTeacher, (req, res) => res.json({ ok: true, teacher_id: req.teacher.id }));

app.get('/api/classes', requireTeacher, (req, res) => res.json({ classes: db.prepare(SQL.classes).all(req.teacher.id) }));
app.post('/api/classes', requireTeacher, (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return fail(res, 400, 'Nama kelas wajib diisi.');
  const tooLong = textTooLong({ className: name });
  if (tooLong) return fail(res, 400, tooLong);
  try {
    const id = randomUUID();
    db.prepare('INSERT INTO classes VALUES (?,?,?)').run(id, req.teacher.id, name);
    res.status(201).json({ class: { id, name, student_count: 0 } });
  } catch { fail(res, 409, 'Kelas sudah ada.'); }
});
app.put('/api/classes/:id', requireTeacher, (req, res) => {
  if (!ownedClass(req)) return fail(res, 404, 'Kelas tidak ditemukan.');
  const name = String(req.body.name || '').trim();
  if (!name) return fail(res, 400, 'Nama kelas wajib diisi.');
  const tooLong = textTooLong({ className: name });
  if (tooLong) return fail(res, 400, tooLong);
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE classes SET name=? WHERE id=?').run(name, req.params.id);
    db.prepare('UPDATE submissions SET student_class=? WHERE class_id=?').run(name, req.params.id);
    db.exec('COMMIT');
    res.json({ class: { id: req.params.id, name } });
  } catch { db.exec('ROLLBACK'); fail(res, 409, 'Kelas sudah ada.'); }
});
app.delete('/api/classes/:id', requireTeacher, (req, res) => {
  if (!ownedClass(req)) return fail(res, 404, 'Kelas tidak ditemukan.');
  db.prepare('DELETE FROM classes WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});
app.get('/api/classes/:id/students', requireTeacher, (req, res) => {
  if (!ownedClass(req)) return fail(res, 404, 'Kelas tidak ditemukan.');
  res.json({ students: studentsOf(req.params.id) });
});
app.put('/api/classes/:id/students', requireTeacher, (req, res) => {
  if (!ownedClass(req)) return fail(res, 404, 'Kelas tidak ditemukan.');
  if (!Array.isArray(req.body.names)) return fail(res, 400, 'Daftar siswa tidak valid.');
  const names = req.body.names.map(name => String(name).trim()).filter(Boolean);
  const tooLong = names.map(studentName => textTooLong({ studentName })).find(Boolean);
  if (tooLong) return fail(res, 400, tooLong);
  if (new Set(names.map(name => name.toLocaleLowerCase('id'))).size !== names.length) return fail(res, 400, 'Nama siswa tidak boleh berulang.');
  const existing = studentsOf(req.params.id);
  const wanted = new Set(names);
  const current = new Set(existing.map(student => student.name));
  const remove = db.prepare('DELETE FROM students WHERE id=?');
  const insert = db.prepare('INSERT INTO students VALUES (?,?,?)');
  db.exec('BEGIN');
  try {
    for (const student of existing) if (!wanted.has(student.name)) remove.run(student.id);
    for (const name of names) if (!current.has(name)) insert.run(randomUUID(), req.params.id, name);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  res.json({ students: studentsOf(req.params.id) });
});
app.delete('/api/students/:id', requireTeacher, (req, res) => {
  const result = db.prepare('DELETE FROM students WHERE id=? AND class_id IN (SELECT id FROM classes WHERE teacher_id=?)').run(req.params.id, req.teacher.id);
  if (!result.changes) return fail(res, 404, 'Siswa tidak ditemukan.');
  res.json({ ok: true });
});

app.get('/api/tasks', requireTeacher, (req, res) => {
  const tasks = db.prepare('SELECT * FROM tasks WHERE teacher_id=? ORDER BY created_at DESC').all(req.teacher.id).map(taskDates);
  res.json({ tasks: withClasses(tasks, db.prepare(SQL.teacherTaskClasses).all(req.teacher.id)) });
});
app.post('/api/tasks', requireTeacher, upload.single('file'), (req, res) => {
  const fields = taskFields(req.body);
  const submissionType = req.body.submission_type || 'image';
  if (!fields || !isSubmissionType(submissionType)) return fail(res, 400, 'Lengkapi judul, mata pelajaran, dan deadline.');
  const tooLong = textTooLong({ title: fields.title, subject: fields.subject, description: fields.description });
  if (tooLong) return fail(res, 400, tooLong);
  const classIds = parseClassIds(req.body.classes);
  if (!classIds) return fail(res, 400, 'Daftar kelas tidak valid.');
  if (db.prepare(SQL.ownedClassCount).get(req.teacher.id, JSON.stringify(classIds)).n !== classIds.length) return fail(res, 400, 'Kelas tidak ditemukan.');
  if (req.file && fileBytes(teacherFiles(req.teacher.id)) + req.file.size > storageLimitBytes()) return fail(res, 413, 'Kapasitas penyimpanan sudah penuh.');
  let code;
  do { code = taskCode(); } while (db.prepare(SQL.taskByCode).get(code));
  const id = randomUUID();
  const fileUrl = req.file ? saveFile(req.file, ['tasks', id], safeFileName(req.file.originalname)) : null;
  db.prepare('INSERT INTO tasks VALUES (?,?,?,?,?,?,?,?,?,?)').run(id, req.teacher.id, fields.title, fields.subject, fields.description, fields.deadline, submissionType, code, fileUrl, now());
  db.prepare(SQL.linkTaskClasses).run(id, JSON.stringify(classIds));
  res.status(201).json({ task: taskById(id) });
});
app.get('/api/tasks/code/:code', (req, res) => {
  const row = db.prepare(SQL.taskByCode).get(req.params.code);
  if (!row) return fail(res, 404, 'Kode tugas tidak ditemukan.');
  res.json({ task: taskFor(row) });
});
app.get('/api/tasks/code/:code/classes/:classId/students', (req, res) => {
  const task = db.prepare(SQL.taskByCode).get(req.params.code);
  if (!task) return fail(res, 404, 'Tugas tidak ditemukan.');
  if (!db.prepare(SQL.taskClass).get(task.id, req.params.classId)) return fail(res, 404, 'Kelas tidak tersedia untuk tugas ini.');
  res.json({ students: studentsOf(req.params.classId) });
});
app.get('/api/tasks/:id', requireTeacher, (req, res) => {
  const row = ownedTask(req);
  if (!row) return fail(res, 404, 'Tugas tidak ditemukan.');
  res.json({ task: taskFor(row) });
});
app.get('/api/tasks/:id/submissions', requireTeacher, (req, res) => {
  if (!ownedTask(req)) return fail(res, 404, 'Tugas tidak ditemukan.');
  res.json({ submissions: db.prepare(SQL.submissions).all(req.params.id).map(submissionDates) });
});
app.put('/api/tasks/:id', requireTeacher, (req, res) => {
  const task = ownedTask(req);
  if (!task) return fail(res, 404, 'Tugas tidak ditemukan.');
  const fields = taskFields(req.body);
  if (!fields) return fail(res, 400, 'Lengkapi judul, mata pelajaran, dan deadline.');
  const tooLong = textTooLong({ title: fields.title, subject: fields.subject, description: fields.description });
  if (tooLong) return fail(res, 400, tooLong);
  db.prepare('UPDATE tasks SET title=?,subject=?,description=?,deadline=? WHERE id=?').run(fields.title, fields.subject, fields.description, fields.deadline, task.id);
  res.json({ task: taskById(task.id) });
});
app.delete('/api/tasks/:id', requireTeacher, (req, res) => {
  const task = ownedTask(req);
  if (!task) return fail(res, 404, 'Tugas tidak ditemukan.');
  const files = taskFiles(task.id);
  db.prepare('DELETE FROM tasks WHERE id=?').run(task.id);
  removeFiles(files);
  res.json({ ok: true });
});
app.post('/api/submissions', upload.any(), (req, res) => {
  const { body } = req;
  const task = db.prepare('SELECT * FROM tasks WHERE id=? AND task_code=?').get(body.task_id, body.task_code);
  if (!task) return fail(res, 404, 'Tugas tidak ditemukan.');
  const studentName = String(body.student_name || '').trim();
  let studentClass = String(body.student_class || '').trim(), classId = null;
  if (db.prepare(SQL.taskHasClasses).get(task.id)) {
    const selected = db.prepare(SQL.taskClass).get(task.id, String(body.class_id || ''));
    if (!selected) return fail(res, 400, 'Kelas tidak tersedia untuk tugas ini.');
    if (studentName && !db.prepare(SQL.rosterStudent).get(selected.id, studentName)) return fail(res, 400, 'Nama tidak ada di daftar kelas ini.');
    ({ id: classId, name: studentClass } = selected);
  }
  if (!studentName || !studentClass || !req.files.length) return fail(res, 400, 'Lengkapi nama, kelas, dan file tugas.');
  const studentNote = String(body.student_note || '').trim();
  // Nama dan kelas dari daftar kelas sudah diperiksa saat daftar disimpan.
  const tooLong = textTooLong(classId ? { studentNote } : { studentName, className: studentClass, studentNote });
  if (tooLong) return fail(res, 400, tooLong);
  const files = req.files.sort((a, b) => compareFileFields(a.fieldname, b.fieldname));
  const accepted = files.map(file => submissionFile(task.submission_type, file.originalname, file.mimetype));
  if (accepted.includes(null)) return fail(res, 400, 'Jenis file tidak sesuai dengan tugas.');
  if (task.submission_type === 'image' && files.some(file => file.size > MAX_IMAGE_BYTES)) return fail(res, 413, 'Foto maksimal 50 MB per file.');
  const previous = db.prepare(SQL.previousSubmission).get(task.id, studentName, classId, studentClass);
  const previousFiles = previous ? pathsOf([previous]) : [];
  const incomingBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (fileBytes(teacherFiles(task.teacher_id)) - fileBytes(previousFiles) + incomingBytes > storageLimitBytes()) return fail(res, 413, 'Kapasitas penyimpanan sudah penuh.');
  const status = Date.now() > Date.parse(deadlineTimestamp(task.deadline)) ? 'Terlambat' : 'Tepat Waktu';
  const urls = files.map((file, index) => saveFile(file, ['submissions', task.id, studentClass, status], accepted[index].name));
  try {
    db.prepare(SQL.upsertSubmission).run(randomUUID(), task.id, studentName, studentClass, classId, studentNote, JSON.stringify(urls), now());
  } catch (error) { removeFiles(urls.map(localFile)); throw error; }
  removeFiles(previousFiles);
  res.status(201).json({ file_urls: urls, replaced: !!previous });
});

app.get('/api/storage/usage', requireTeacher, (req, res) => {
  res.json({ used_bytes: fileBytes(teacherFiles(req.teacher.id)) });
});
app.get('/api/files/blob', requireTeacher, (req, res) => {
  const file = localFile(String(req.query.url));
  if (!file) return fail(res, 400, 'URL file tidak valid.');
  if (!teacherFiles(req.teacher.id).includes(file)) return fail(res, 404, 'File tidak ditemukan.');
  res.sendFile(file);
});

function admin(req, res, next) {
  const expected = process.env.ADMIN_SETUP_KEY;
  const supplied = req.get('X-Admin-Key') || '';
  if (!expected || supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return fail(res, 401, 'Setup key salah.');
  next();
}
app.get('/api/admin/teachers', admin, (_req, res) => res.json({ teachers: db.prepare('SELECT id, email, created_at FROM teachers ORDER BY created_at DESC').all() }));
app.post('/api/admin/teachers', admin, (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!email.includes('@') || password.length < 8) return fail(res, 400, 'Email valid dan password minimal 8 karakter diperlukan.');
  try { const id = randomUUID(); db.prepare('INSERT INTO teachers VALUES (?,?,?,?)').run(id, email, bcrypt.hashSync(password, 12), now()); res.status(201).json({ teacher: { id, email } }); }
  catch { fail(res, 409, 'Email sudah digunakan.'); }
});
app.delete('/api/admin/teachers/:id', admin, (req, res) => {
  const files = teacherFiles(req.params.id);
  const result = db.prepare('DELETE FROM teachers WHERE id=?').run(req.params.id);
  if (!result.changes) return fail(res, 404, 'Guru tidak ditemukan.');
  removeFiles(files);
  res.json({ ok: true });
});

app.use('/api', (_req, res) => fail(res, 404, 'Endpoint tidak ditemukan.'));
app.get(/.*/, (_req, res) => res.type('html').send(readFileSync(join(root, 'public/index.html'))));
const MULTER_MESSAGES = {
  LIMIT_FIELD_VALUE: 'Isian teks terlalu panjang.',
  LIMIT_FILE_SIZE: 'File maksimal 100 MB per file.',
  LIMIT_FILE_COUNT: 'Maksimal 20 file per pengumpulan.',
  LIMIT_UNEXPECTED_FILE: 'Unggahan tidak valid.',
};
app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) return fail(res, error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, MULTER_MESSAGES[error.code] || 'Unggahan tidak valid.');
  if (error.type === 'entity.too.large') return fail(res, 413, 'Data yang dikirim terlalu besar.');
  if (error.status === 404) return fail(res, 404, 'File tidak ditemukan.');
  console.error(error);
  return fail(res, 500, 'Terjadi kesalahan server.');
});

if (process.env.NODE_ENV !== 'test') app.listen(Number(process.env.PORT || 8787), () => console.log(`Sistem Tugas: http://localhost:${process.env.PORT || 8787}`));
export { app, db };
