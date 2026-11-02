// Aturan dan query yang sama untuk server.mjs (SQLite lokal) dan worker.mjs (D1/R2).
import { deadlineTimestamp } from './public/assets/app-logic.mjs';

export const STORAGE_LIMIT_BYTES = 10 * 1024 ** 3;
export const MAX_SUBMISSION_FILES = 20;
export const MAX_IMAGE_BYTES = 50 * 1024 ** 2;
export const MAX_FILE_BYTES = 100 * 1024 ** 2;
// Batas panjang isian teks. Frontend memakai angka yang sama lewat atribut maxLength.
export const TEXT_LIMITS = { title: 200, subject: 100, description: 5000, className: 100, studentName: 100, studentNote: 1000 };
const TEXT_LABELS = { title: 'Judul', subject: 'Mata pelajaran', description: 'Deskripsi', className: 'Nama kelas', studentName: 'Nama siswa', studentNote: 'Catatan' };
// Mengembalikan pesan galat untuk isian pertama yang melewati batas, atau null.
export function textTooLong(values) {
  for (const [field, value] of Object.entries(values)) {
    if (String(value ?? '').length > TEXT_LIMITS[field]) return `${TEXT_LABELS[field]} maksimal ${TEXT_LIMITS[field]} karakter.`;
  }
  return null;
}

const SUBMISSION_TYPES = {
  image: { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' },
  video: { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.3gp': 'video/3gpp' },
  audio: { '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.flac': 'audio/flac', '.webm': 'audio/webm' },
};
// Hanya tipe ini yang boleh dibuka langsung di origin aplikasi; sisanya diunduh sebagai lampiran.
const INLINE_TYPES = { ...Object.assign({}, ...Object.values(SUBMISSION_TYPES)), '.gif': 'image/gif', '.pdf': 'application/pdf', '.txt': 'text/plain' };
const INLINE_CONTENT_TYPES = new Set(Object.values(INLINE_TYPES));

export const isSubmissionType = type => Object.hasOwn(SUBMISSION_TYPES, type);
export const safeFileName = name => String(name || 'file').split(/[\\/]/).pop().replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
const extensionOf = name => /\.[^.]*$/.exec(name)?.[0].toLowerCase() ?? '';
export const isInlineFile = name => Object.hasOwn(INLINE_TYPES, extensionOf(name));
export const isInlineContentType = type => INLINE_CONTENT_TYPES.has(String(type || '').split(';')[0].trim().toLowerCase());

// Ekstensi yang disimpan selalu dari daftar izin, sehingga tipe konten saat disajikan tidak bisa dipilih pengirim.
export function submissionFile(type, name, mimeType) {
  const allowed = SUBMISSION_TYPES[type];
  const safe = safeFileName(name);
  const extension = extensionOf(safe);
  if (Object.hasOwn(allowed, extension)) return { name: safe, contentType: allowed[extension] };
  const mime = String(mimeType || '').split(';')[0].trim().toLowerCase();
  const fallback = Object.keys(allowed).find(key => allowed[key] === mime);
  return fallback ? { name: safe + fallback, contentType: mime } : null;
}

export function fileUrls(value) {
  if (!value) return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : [value]; }
  catch { return [value]; }
}

export function taskFields(input) {
  const title = String(input.title || '').trim(), subject = String(input.subject || '').trim(), deadline = deadlineTimestamp(input.deadline);
  return title && subject && deadline ? { title, subject, deadline, description: String(input.description || '').trim() } : null;
}

export function parseClassIds(raw) {
  try {
    const ids = JSON.parse(raw || '[]');
    return Array.isArray(ids) && ids.every(id => typeof id === 'string') ? [...new Set(ids)] : null;
  } catch { return null; }
}

export const taskCode = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');

export function withClasses(tasks, classRows) {
  const byTask = Map.groupBy(classRows, row => row.task_id);
  return tasks.map(task => ({ ...task, classes: (byTask.get(task.id) || []).map(({ id, name, student_count }) => ({ id, name, student_count })) }));
}

const TASK_CLASS_COLUMNS = 'tc.task_id,c.id,c.name,(SELECT COUNT(*) FROM students s WHERE s.class_id=c.id) AS student_count FROM task_classes tc JOIN classes c ON c.id=tc.class_id';
const IDENTITY = "lower(trim(student_name))=lower(?) AND coalesce('id:' || class_id,'name:' || lower(trim(student_class)))=coalesce('id:' || ?,'name:' || lower(trim(?)))";

export const SQL = {
  classes: 'SELECT c.id,c.name,COUNT(s.id) AS student_count FROM classes c LEFT JOIN students s ON s.class_id=c.id WHERE c.teacher_id=? GROUP BY c.id ORDER BY c.name',
  students: 'SELECT id,name FROM students WHERE class_id=? ORDER BY name',
  rosterStudent: 'SELECT id FROM students WHERE class_id=? AND lower(name)=lower(?)',
  ownedClassCount: 'SELECT COUNT(*) AS n FROM classes WHERE teacher_id=? AND id IN (SELECT value FROM json_each(?))',
  linkTaskClasses: 'INSERT INTO task_classes(task_id,class_id) SELECT ?,value FROM json_each(?)',
  taskClasses: `SELECT ${TASK_CLASS_COLUMNS} WHERE tc.task_id=? ORDER BY c.name`,
  teacherTaskClasses: `SELECT ${TASK_CLASS_COLUMNS} JOIN tasks t ON t.id=tc.task_id WHERE t.teacher_id=? ORDER BY c.name`,
  taskHasClasses: 'SELECT 1 FROM task_classes WHERE task_id=? LIMIT 1',
  taskClass: 'SELECT c.id,c.name FROM task_classes tc JOIN classes c ON c.id=tc.class_id WHERE tc.task_id=? AND tc.class_id=?',
  taskByCode: 'SELECT * FROM tasks WHERE task_code=?',
  submissions: 'SELECT * FROM submissions WHERE task_id=? ORDER BY created_at DESC',
  // Parameter: task_id, nama siswa (sudah di-trim), class_id atau null, nama kelas.
  previousSubmission: `SELECT * FROM submissions WHERE task_id=? AND ${IDENTITY}`,
  upsertSubmission: 'INSERT INTO submissions(id,task_id,student_name,student_class,class_id,student_note,file_url,created_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT DO UPDATE SET student_name=excluded.student_name,student_class=excluded.student_class,class_id=excluded.class_id,student_note=excluded.student_note,file_url=excluded.file_url,created_at=excluded.created_at',
  taskFiles: 'SELECT file_url FROM tasks WHERE id=? UNION ALL SELECT file_url FROM submissions WHERE task_id=?',
  teacherFiles: 'SELECT file_url FROM tasks WHERE teacher_id=? UNION ALL SELECT s.file_url FROM submissions s JOIN tasks t ON t.id=s.task_id WHERE t.teacher_id=?',
};
