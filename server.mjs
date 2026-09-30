import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, unlinkSync, existsSync, statSync } from 'node:fs';
import { join, resolve, extname, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

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

if (process.env.TEACHER_EMAIL && process.env.TEACHER_PASSWORD) {
  const email = process.env.TEACHER_EMAIL.trim().toLowerCase();
  if (!db.prepare('SELECT id FROM teachers WHERE email=?').get(email)) {
    db.prepare('INSERT INTO teachers VALUES (?,?,?,?)').run(randomUUID(), email, bcrypt.hashSync(process.env.TEACHER_PASSWORD, 12), new Date().toISOString());
  }
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use('/files', express.static(filesDir, { fallthrough: false, setHeaders: res => res.setHeader('Cache-Control', 'private, max-age=3600') }));
app.use('/assets', express.static(join(root, 'public/assets'), { immutable: true, maxAge: '1y' }));
const upload = multer({
  storage: multer.diskStorage({ destination: uploadDir, filename: (_req, _file, callback) => callback(null, randomUUID()) }),
  limits: { files: 20, fileSize: 100 * 1024 * 1024 },
});
app.use((req, res, next) => {
  res.on('finish', () => {
    for (const file of [...(req.files || []), ...(req.file ? [req.file] : [])]) {
      if (file.path && existsSync(file.path)) unlinkSync(file.path);
    }
  });
  next();
});
const now = () => new Date().toISOString();
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = (res, status, error) => res.status(status).json({ error });
const origin = req => process.env.PUBLIC_ORIGIN || `${req.protocol}://${req.get('host')}`;
const cleanName = name => basename(name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
const cleanFolder = name => String(name || 'Tanpa Kelas').replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 80) || 'Tanpa Kelas';
const fileKey = file => `${Date.now()}_${randomBytes(4).toString('hex')}_${cleanName(file.originalname)}`;
function storageFile(urlValue) {
  const url = new URL(urlValue);
  if (!url.pathname.startsWith('/files/')) throw new Error('Invalid file URL');
  const relative = decodeURIComponent(url.pathname.slice(7));
  const absolute = resolve(filesDir, relative);
  if (!absolute.startsWith(filesDir + sep)) throw new Error('Invalid file path');
  return absolute;
}
function saveFile(req, file, folders = []) {
  const relative = [...folders.map(cleanFolder), fileKey(file)];
  const destination = join(filesDir, ...relative);
  mkdirSync(resolve(destination, '..'), { recursive: true });
  renameSync(file.path, destination);
  return `${origin(req)}/files/${relative.map(encodeURIComponent).join('/')}`;
}
function removeUrls(urls) {
  for (const value of parseUrls(urls)) {
    try {
      const file = storageFile(value);
      if (existsSync(file)) unlinkSync(file);
    } catch { /* Old external files are not stored here. */ }
  }
}
function parseUrls(value) {
  if (!value) return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : [value]; }
  catch { return [value]; }
}
function taskFor(row) {
  return { ...row, classes: db.prepare('SELECT c.id, c.name, (SELECT COUNT(*) FROM students s WHERE s.class_id=c.id) AS student_count FROM classes c JOIN task_classes tc ON tc.class_id=c.id WHERE tc.task_id=? ORDER BY c.name').all(row.id) };
}
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
function parseClassIds(raw, teacherId) {
  if (!raw) return [];
  const ids = JSON.parse(raw);
  if (!Array.isArray(ids)) throw new Error('Daftar kelas tidak valid.');
  for (const id of ids) if (!db.prepare('SELECT id FROM classes WHERE id=? AND teacher_id=?').get(id, teacherId)) throw new Error('Kelas tidak ditemukan.');
  return [...new Set(ids)];
}

app.post('/api/auth/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const teacher = db.prepare('SELECT * FROM teachers WHERE email=?').get(email);
  if (!teacher || !bcrypt.compareSync(String(req.body?.password || ''), teacher.password_hash)) return fail(res, 401, 'Email atau password salah');
  const token = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(token), teacher.id, new Date(Date.now() + 30 * 86400000).toISOString());
  res.json({ token, teacher_id: teacher.id });
});
app.get('/api/auth/check', requireTeacher, (req, res) => res.json({ ok: true, teacher_id: req.teacher.id }));

app.get('/api/classes', requireTeacher, (req, res) => res.json({ classes: db.prepare('SELECT c.id, c.name, COUNT(s.id) AS student_count FROM classes c LEFT JOIN students s ON s.class_id=c.id WHERE c.teacher_id=? GROUP BY c.id ORDER BY c.name').all(req.teacher.id) }));
app.post('/api/classes', requireTeacher, (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return fail(res, 400, 'Nama kelas wajib diisi.');
  try {
    const id = randomUUID();
    db.prepare('INSERT INTO classes VALUES (?,?,?)').run(id, req.teacher.id, name);
    res.status(201).json({ class: { id, name, student_count: 0 } });
  } catch { fail(res, 409, 'Kelas sudah ada.'); }
});
app.put('/api/classes/:id', requireTeacher, (req, res) => {
  if (!ownedClass(req)) return fail(res, 404, 'Kelas tidak ditemukan.');
  const name = String(req.body?.name || '').trim();
  if (!name) return fail(res, 400, 'Nama kelas wajib diisi.');
  try { db.prepare('UPDATE classes SET name=? WHERE id=?').run(name, req.params.id); res.json({ class: { id: req.params.id, name } }); }
  catch { fail(res, 409, 'Kelas sudah ada.'); }
});
app.delete('/api/classes/:id', requireTeacher, (req, res) => {
  if (!ownedClass(req)) return fail(res, 404, 'Kelas tidak ditemukan.');
  db.prepare('DELETE FROM classes WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});
app.get('/api/classes/:id/students', requireTeacher, (req, res) => {
  if (!ownedClass(req)) return fail(res, 404, 'Kelas tidak ditemukan.');
  res.json({ students: db.prepare('SELECT id, name FROM students WHERE class_id=? ORDER BY name').all(req.params.id) });
});
app.post('/api/classes/:id/students', requireTeacher, (req, res) => {
  if (!ownedClass(req)) return fail(res, 404, 'Kelas tidak ditemukan.');
  const names = Array.isArray(req.body?.names) ? req.body.names : [];
  const insert = db.prepare('INSERT OR IGNORE INTO students VALUES (?,?,?)');
  for (const name of names) if (String(name).trim()) insert.run(randomUUID(), req.params.id, String(name).trim());
  res.json({ students: db.prepare('SELECT id, name FROM students WHERE class_id=? ORDER BY name').all(req.params.id) });
});
app.delete('/api/students/:id', requireTeacher, (req, res) => {
  const result = db.prepare('DELETE FROM students WHERE id=? AND class_id IN (SELECT id FROM classes WHERE teacher_id=?)').run(req.params.id, req.teacher.id);
  if (!result.changes) return fail(res, 404, 'Siswa tidak ditemukan.');
  res.json({ ok: true });
});

app.get('/api/tasks', requireTeacher, (req, res) => res.json({ tasks: db.prepare('SELECT * FROM tasks WHERE teacher_id=? ORDER BY created_at DESC').all(req.teacher.id).map(taskFor) }));
app.post('/api/tasks', requireTeacher, upload.single('file'), (req, res) => {
  const { title, subject, deadline, description = '', submission_type = 'image' } = req.body;
  if (!title?.trim() || !subject?.trim() || !deadline || !['image', 'video', 'audio'].includes(submission_type) || Number.isNaN(new Date(deadline).getTime())) return fail(res, 400, 'Lengkapi judul, mata pelajaran, dan deadline.');
  let classes;
  try { classes = parseClassIds(req.body.classes, req.teacher.id); }
  catch (error) { return fail(res, 400, error.message); }
  let code;
  do { code = String(randomInt(0, 1000000)).padStart(6, '0'); }
  while (db.prepare('SELECT id FROM tasks WHERE task_code=?').get(code));
  const id = randomUUID();
  const fileUrl = req.file ? saveFile(req, req.file, ['tasks', id]) : null;
  db.prepare('INSERT INTO tasks VALUES (?,?,?,?,?,?,?,?,?,?)').run(id, req.teacher.id, title.trim(), subject.trim(), String(description).trim(), deadline, submission_type, code, fileUrl, now());
  for (const classId of classes) db.prepare('INSERT INTO task_classes VALUES (?,?)').run(id, classId);
  res.status(201).json({ task: taskById(id) });
});
app.get('/api/tasks/code/:code', (req, res) => {
  const row = db.prepare('SELECT * FROM tasks WHERE task_code=?').get(req.params.code);
  if (!row) return fail(res, 404, 'Kode tugas tidak ditemukan.');
  res.json({ task: taskFor(row) });
});
app.get('/api/tasks/code/:code/classes/:classId/students', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE task_code=?').get(req.params.code);
  if (!task) return fail(res, 404, 'Tugas tidak ditemukan.');
  const allowed = db.prepare('SELECT 1 FROM task_classes WHERE task_id=? AND class_id=?').get(task.id, req.params.classId);
  if (!allowed) return fail(res, 404, 'Kelas tidak tersedia untuk tugas ini.');
  res.json({ students: db.prepare('SELECT id, name FROM students WHERE class_id=? ORDER BY name').all(req.params.classId) });
});
app.get('/api/tasks/:id', requireTeacher, (req, res) => {
  const row = ownedTask(req);
  if (!row) return fail(res, 404, 'Tugas tidak ditemukan.');
  res.json({ task: taskFor(row) });
});
app.get('/api/tasks/:id/submissions', requireTeacher, (req, res) => {
  if (!ownedTask(req)) return fail(res, 404, 'Tugas tidak ditemukan.');
  res.json({ submissions: db.prepare('SELECT * FROM submissions WHERE task_id=? ORDER BY created_at DESC').all(req.params.id) });
});
app.delete('/api/tasks/:id', requireTeacher, (req, res) => {
  const task = ownedTask(req);
  if (!task) return fail(res, 404, 'Tugas tidak ditemukan.');
  removeUrls(task.file_url);
  for (const sub of db.prepare('SELECT file_url FROM submissions WHERE task_id=?').all(task.id)) removeUrls(sub.file_url);
  db.prepare('DELETE FROM tasks WHERE id=?').run(task.id);
  res.json({ ok: true });
});
app.post('/api/submissions', upload.any(), (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id=? AND task_code=?').get(req.body?.task_id, req.body?.task_code);
  if (!task) return fail(res, 404, 'Tugas tidak ditemukan.');
  const studentName = String(req.body?.student_name || '').trim();
  const studentClass = String(req.body?.student_class || '').trim();
  if (!studentName || !studentClass || !req.files?.length) return fail(res, 400, 'Lengkapi nama, kelas, dan file tugas.');
  const classes = taskFor(task).classes;
  if (classes.length) {
    const selected = classes.find(c => c.name.toLowerCase() === studentClass.toLowerCase());
    if (!selected) return fail(res, 400, 'Kelas tidak tersedia untuk tugas ini.');
    const student = db.prepare('SELECT id FROM students WHERE class_id=? AND lower(name)=lower(?)').get(selected.id, studentName);
    if (!student) return fail(res, 400, 'Nama tidak ada di daftar kelas ini.');
  }
  const files = [...req.files].sort((a, b) => a.fieldname.localeCompare(b.fieldname));
  const extensions = {
    image: new Set(['.jpg', '.jpeg', '.png', '.webp']),
    video: new Set(['.mp4', '.mov', '.webm', '.3gp']),
    audio: new Set(['.mp3', '.m4a', '.aac', '.ogg', '.wav', '.flac', '.webm']),
  };
  if (files.some(file => !file.mimetype.startsWith(`${task.submission_type}/`) && !extensions[task.submission_type].has(extname(file.originalname).toLowerCase()))) return fail(res, 400, 'Jenis file tidak sesuai dengan tugas.');
  const previous = db.prepare('SELECT * FROM submissions WHERE task_id=? AND lower(student_name)=lower(?) AND lower(student_class)=lower(?)').get(task.id, studentName, studentClass);
  const status = Date.now() > new Date(task.deadline).getTime() ? 'Terlambat' : 'Tepat Waktu';
  const urls = files.map(file => saveFile(req, file, ['submissions', task.id, studentClass, status]));
  if (previous) { removeUrls(previous.file_url); db.prepare('DELETE FROM submissions WHERE id=?').run(previous.id); }
  const fileUrl = urls.length === 1 ? urls[0] : JSON.stringify(urls);
  db.prepare('INSERT INTO submissions VALUES (?,?,?,?,?,?,?)').run(randomUUID(), task.id, studentName, studentClass, String(req.body?.student_note || '').trim(), fileUrl, now());
  res.status(201).json({ file_urls: urls, replaced: !!previous });
});

app.get('/api/storage/usage', requireTeacher, (req, res) => {
  const urls = [];
  for (const task of db.prepare('SELECT file_url FROM tasks WHERE teacher_id=?').all(req.teacher.id)) urls.push(...parseUrls(task.file_url));
  for (const sub of db.prepare('SELECT file_url FROM submissions WHERE task_id IN (SELECT id FROM tasks WHERE teacher_id=?)').all(req.teacher.id)) urls.push(...parseUrls(sub.file_url));
  let bytes = 0;
  for (const value of urls) {
    try { bytes += statSync(storageFile(value)).size; }
    catch { /* Missing files are excluded from usage. */ }
  }
  res.json({ used_bytes: bytes });
});
app.get('/api/files/blob', requireTeacher, (req, res) => {
  let file;
  try {
    file = storageFile(String(req.query.url));
  } catch { return fail(res, 400, 'URL file tidak valid.'); }
  if (!existsSync(file)) return fail(res, 404, 'File tidak ditemukan.');
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
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email.includes('@') || password.length < 8) return fail(res, 400, 'Email valid dan password minimal 8 karakter diperlukan.');
  try { const id = randomUUID(); db.prepare('INSERT INTO teachers VALUES (?,?,?,?)').run(id, email, bcrypt.hashSync(password, 12), now()); res.status(201).json({ teacher: { id, email } }); }
  catch { fail(res, 409, 'Email sudah digunakan.'); }
});
app.delete('/api/admin/teachers/:id', admin, (req, res) => {
  const tasks = db.prepare('SELECT * FROM tasks WHERE teacher_id=?').all(req.params.id);
  for (const task of tasks) {
    removeUrls(task.file_url);
    for (const sub of db.prepare('SELECT file_url FROM submissions WHERE task_id=?').all(task.id)) removeUrls(sub.file_url);
  }
  const result = db.prepare('DELETE FROM teachers WHERE id=?').run(req.params.id);
  if (!result.changes) return fail(res, 404, 'Guru tidak ditemukan.');
  res.json({ ok: true });
});

app.get(/.*/, (_req, res) => res.type('html').send(readFileSync(join(root, 'public/index.html'))));
app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) return fail(res, 400, error.message);
  console.error(error);
  return fail(res, 500, 'Terjadi kesalahan server.');
});

if (process.env.NODE_ENV !== 'test') app.listen(Number(process.env.PORT || 8787), () => console.log(`Sistem Tugas: http://localhost:${process.env.PORT || 8787}`));
export { app, db };
