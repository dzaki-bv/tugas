import { compareFileFields, taskDates, submissionDates, utcTimestamp } from './public/assets/app-logic.mjs';
import { SQL, STORAGE_LIMIT_BYTES, MAX_SUBMISSION_FILES, MAX_IMAGE_BYTES, MAX_FILE_BYTES, fileUrls, isInlineContentType, isSubmissionType, parseClassIds, safeFileName, submissionFile, taskCode, taskFields, withClasses } from './api-shared.mjs';

const TASK_PUBLIC = 'https://pub-8f313bb90a194fc185f0e4319a7201dd.r2.dev';
const SUBMISSION_PUBLIC = 'https://pub-76de1050ffe64a1bb900d33b4a48c3be.r2.dev';
const SITE_ORIGIN = 'https://tugas.dzaki-fird.workers.dev';
const enc = new TextEncoder();
const json = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (status, error) => json({ error }, status);
const now = () => new Date().toISOString();
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
const hex = bytes => [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, '0')).join('');
const isFile = value => value && typeof value === 'object' && typeof value.stream === 'function' && typeof value.size === 'number' && typeof value.name === 'string';
const owned = (db, table, id, teacher) => db.prepare(`SELECT * FROM ${table} WHERE id=? AND teacher_id=?`).bind(id, teacher).first();
const all = (db, sql, ...args) => db.prepare(sql).bind(...args).all().then(r => r.results);
const one = (db, sql, ...args) => db.prepare(sql).bind(...args).first();
const run = (db, sql, ...args) => db.prepare(sql).bind(...args).run();
async function pbkdf2(password, stored) {
  const [kind, rounds, salt, expected] = stored.split(':');
  if (kind !== 'pbkdf2') return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const result = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(salt), iterations: Number(rounds) }, key, unb64(expected).length * 8);
  const a = new Uint8Array(result), b = unb64(expected);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
async function makeHash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256);
  return `pbkdf2:100000:${b64(salt)}:${b64(bits)}`;
}
async function sign(value, secret) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(value)));
}
async function teacherFrom(request, db) {
  const token = /^Bearer (.+)$/i.exec(request.headers.get('authorization') || '')?.[1];
  if (!token) return null;
  const [id, expires, signature] = token.split('.');
  if (!id || !expires || !signature || Number(expires) < Date.now()) return null;
  const teacher = await one(db, 'SELECT * FROM teachers WHERE id=?', id);
  if (!teacher || await sign(`${id}.${expires}`, teacher.password_hash) !== signature) return null;
  return teacher;
}
async function taskFor(db, row) {
  return withClasses([taskDates(row)], await all(db, SQL.taskClasses, row.id))[0];
}
const urlsOf = rows => rows.flatMap(row => fileUrls(row.file_url));
const teacherUrls = async (db, id) => urlsOf(await all(db, SQL.teacherFiles, id, id));
function fileLocation(url) {
  try {
    const value = new URL(url);
    let bucket = value.origin === TASK_PUBLIC ? 'TASK_FILES' : value.origin === SUBMISSION_PUBLIC ? 'SUBMISSION_FILES' : null;
    let path = value.pathname.slice(1);
    if (value.origin === SITE_ORIGIN && value.pathname.startsWith('/media/task/')) { bucket = 'TASK_FILES'; path = value.pathname.slice('/media/task/'.length); }
    if (value.origin === SITE_ORIGIN && value.pathname.startsWith('/media/submission/')) { bucket = 'SUBMISSION_FILES'; path = value.pathname.slice('/media/submission/'.length); }
    const key = decodeURIComponent(path);
    return bucket && key && !key.includes('..') ? { bucket, key } : null;
  } catch { return null; }
}
// Ukuran tiap objek ikut dikembalikan agar ukuran kiriman lama tidak perlu dibaca ulang satu per satu.
async function usage(db, env, teacherId) {
  const keys = new Map();
  for (const url of await teacherUrls(db, teacherId)) {
    const place = fileLocation(url);
    if (!place) continue;
    if (!keys.has(place.bucket)) keys.set(place.bucket, new Map());
    const bucketKeys = keys.get(place.bucket);
    bucketKeys.set(place.key, (bucketKeys.get(place.key) || 0) + 1);
  }
  const sizes = new Map();
  let total = 0;
  await Promise.all([...keys].map(async ([bucket, remaining]) => {
    let cursor;
    do {
      const page = await env[bucket].list({ limit: 1000, ...(cursor ? { cursor } : {}) });
      for (const object of page.objects) {
        const references = remaining.get(object.key);
        if (references) { total += object.size * references; sizes.set(`${bucket}/${object.key}`, object.size); remaining.delete(object.key); }
      }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor && remaining.size);
  }));
  return { total, sizes };
}
async function deleteFiles(env, list) {
  for (const url of list) {
    const place = fileLocation(url);
    if (place) await env[place.bucket].delete(place.key);
  }
}
function fileResponse(object, status = 200, range = null, head = false) {
  if (!object) return fail(404, 'File tidak ditemukan.');
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('ETag', object.httpEtag);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Length', String(range ? range.end - range.start + 1 : object.size));
  if (range) headers.set('Content-Range', `bytes ${range.start}-${range.end}/${object.size}`);
  headers.set('Cache-Control', 'private, max-age=3600');
  headers.set('X-Content-Type-Options', 'nosniff');
  if (!isInlineContentType(headers.get('Content-Type'))) headers.set('Content-Disposition', 'attachment');
  return new Response(head ? null : object.body, { status, headers });
}
async function serveFile(request, bucket, key) {
  const rangeHeader = request.headers.get('Range');
  const head = request.method === 'HEAD';
  if (!rangeHeader) {
    const object = head ? await bucket.head(key) : await bucket.get(key);
    return fileResponse(object, 200, null, head);
  }
  const metadata = await bucket.head(key);
  if (!metadata) return fail(404, 'File tidak ditemukan.');
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match || (!match[1] && !match[2])) return fileResponse(head ? metadata : await bucket.get(key), 200, null, head);
  const start = match[1] ? Number(match[1]) : Math.max(0, metadata.size - Number(match[2]));
  const end = match[1] ? (match[2] ? Math.min(Number(match[2]), metadata.size - 1) : metadata.size - 1) : metadata.size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= metadata.size || end < start) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${metadata.size}`, 'Accept-Ranges': 'bytes' } });
  }
  const range = { start, end };
  const object = head ? metadata : await bucket.get(key, { range: { offset: start, length: end - start + 1 } });
  return fileResponse(object, 206, range, head);
}
async function route(request, env) {
  const url = new URL(request.url), path = url.pathname, method = request.method, db = env.DB;
  if ((method === 'GET' || method === 'HEAD') && (path.startsWith('/media/task/') || path.startsWith('/media/submission/'))) {
    const place = fileLocation(request.url);
    return place ? serveFile(request, env[place.bucket], place.key) : fail(404, 'File tidak ditemukan.');
  }
  if (!path.startsWith('/api/')) {
    if (path === '/assets/index-Ci25O57r.js' && (method === 'GET' || method === 'HEAD')) {
      return new Response("export * from './index-a49c49e6.js';\n", { headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
      } });
    }
    const asset = await env.ASSETS.fetch(request);
    if (asset.status === 404 && method === 'GET' && !path.startsWith('/assets/')) {
      return env.ASSETS.fetch(new Request(new URL('/index.html', request.url)));
    }
    return asset;
  }
  const match = pattern => pattern.exec(path);
  const publicRoute = path === '/api/auth/login' || path.startsWith('/api/tasks/code/') || path === '/api/submissions';
  const adminRoute = path.startsWith('/api/admin/');
  const teacher = publicRoute || adminRoute ? null : await teacherFrom(request, db);
  if (!publicRoute && !adminRoute && !teacher) return fail(401, 'Sesi berakhir, silakan login kembali.');
  const body = async () => request.json().catch(() => ({}));
  if (path === '/api/auth/login' && method === 'POST') {
    const input = await body();
    const user = await one(db, 'SELECT * FROM teachers WHERE email=?', String(input.email || '').trim().toLowerCase());
    if (!user || !await pbkdf2(String(input.password || ''), user.password_hash)) return fail(401, 'Email atau password salah');
    const expires = Date.now() + 30 * 86400000;
    const signature = await sign(`${user.id}.${expires}`, user.password_hash);
    return json({ token: `${user.id}.${expires}.${signature}`, teacher_id: user.id });
  }
  if (path === '/api/auth/check' && method === 'GET') return json({ ok: true, teacher_id: teacher.id });
  if (path === '/api/classes' && method === 'GET') return json({ classes: await all(db, SQL.classes, teacher.id) });
  if (path === '/api/classes' && method === 'POST') {
    const name = String((await body()).name || '').trim();
    if (!name) return fail(400, 'Nama kelas wajib diisi.');
    if (await one(db, 'SELECT id FROM classes WHERE teacher_id=? AND name=?', teacher.id, name)) return fail(409, 'Kelas sudah ada.');
    const id = crypto.randomUUID();
    await run(db, 'INSERT INTO classes(id,teacher_id,name) VALUES(?,?,?)', id, teacher.id, name);
    return json({ class: { id, name, student_count: 0 } }, 201);
  }
  let m;
  if ((m = match(/^\/api\/classes\/([^/]+)$/))) {
    const id = m[1], klass = await owned(db, 'classes', id, teacher.id);
    if (!klass) return fail(404, 'Kelas tidak ditemukan.');
    if (method === 'PUT') {
      const name = String((await body()).name || '').trim();
      if (!name) return fail(400, 'Nama kelas wajib diisi.');
      if (await one(db, 'SELECT id FROM classes WHERE teacher_id=? AND name=? AND id<>?', teacher.id, name, id)) return fail(409, 'Kelas sudah ada.');
      await db.batch([
        db.prepare('UPDATE classes SET name=? WHERE id=?').bind(name, id),
        db.prepare('UPDATE submissions SET student_class=? WHERE class_id=?').bind(name, id),
      ]);
      return json({ class: { id, name } });
    }
    if (method === 'DELETE') { await run(db, 'DELETE FROM classes WHERE id=?', id); return json({ ok: true }); }
  }
  if ((m = match(/^\/api\/classes\/([^/]+)\/students$/))) {
    const id = m[1];
    if (!await owned(db, 'classes', id, teacher.id)) return fail(404, 'Kelas tidak ditemukan.');
    if (method === 'PUT') {
      const input = (await body()).names;
      if (!Array.isArray(input)) return fail(400, 'Daftar siswa tidak valid.');
      const names = input.map(name => String(name).trim()).filter(Boolean);
      if (new Set(names.map(name => name.toLocaleLowerCase('id'))).size !== names.length) return fail(400, 'Nama siswa tidak boleh berulang.');
      const existing = await all(db, SQL.students, id);
      const wanted = new Set(names);
      const current = new Set(existing.map(student => student.name));
      const changes = [
        ...existing.filter(student => !wanted.has(student.name)).map(student => db.prepare('DELETE FROM students WHERE id=? AND class_id=?').bind(student.id, id)),
        ...names.filter(name => !current.has(name)).map(name => db.prepare('INSERT INTO students(id,class_id,name) VALUES(?,?,?)').bind(crypto.randomUUID(), id, name)),
      ];
      if (changes.length) await db.batch(changes);
    }
    return json({ students: await all(db, SQL.students, id) });
  }
  if ((m = match(/^\/api\/students\/([^/]+)$/)) && method === 'DELETE') {
    const result = await run(db, 'DELETE FROM students WHERE id=? AND class_id IN (SELECT id FROM classes WHERE teacher_id=?)', m[1], teacher.id);
    return result.meta.changes ? json({ ok: true }) : fail(404, 'Siswa tidak ditemukan.');
  }
  if (path === '/api/tasks' && method === 'GET') {
    const tasks = (await all(db, 'SELECT * FROM tasks WHERE teacher_id=? ORDER BY created_at DESC', teacher.id)).map(taskDates);
    return json({ tasks: withClasses(tasks, await all(db, SQL.teacherTaskClasses, teacher.id)) });
  }
  if (path === '/api/tasks' && method === 'POST') {
    const form = await request.formData();
    const fields = taskFields(Object.fromEntries(form)), type = String(form.get('submission_type') || 'image');
    if (!fields || !isSubmissionType(type)) return fail(400, 'Lengkapi judul, mata pelajaran, dan deadline.');
    const classIds = parseClassIds(form.get('classes'));
    if (!classIds) return fail(400, 'Daftar kelas tidak valid.');
    if ((await one(db, SQL.ownedClassCount, teacher.id, JSON.stringify(classIds))).n !== classIds.length) return fail(400, 'Kelas tidak ditemukan.');
    const file = form.get('file'), attachment = isFile(file) && file.size ? file : null;
    if (attachment && (await usage(db, env, teacher.id)).total + attachment.size > STORAGE_LIMIT_BYTES) return fail(413, 'Kapasitas penyimpanan sudah penuh.');
    let code;
    do { code = taskCode(); } while (await one(db, SQL.taskByCode, code));
    const id = crypto.randomUUID();
    let fileUrl = null;
    if (attachment) { const key = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${safeFileName(attachment.name)}`; await env.TASK_FILES.put(key, attachment.stream(), { httpMetadata: { contentType: attachment.type || 'application/octet-stream' } }); fileUrl = `${SITE_ORIGIN}/media/task/${encodeURIComponent(key)}`; }
    await db.batch([
      db.prepare('INSERT INTO tasks(id,teacher_id,title,description,subject,deadline,file_url,task_code,submission_type) VALUES(?,?,?,?,?,?,?,?,?)').bind(id, teacher.id, fields.title, fields.description, fields.subject, fields.deadline, fileUrl, code, type),
      db.prepare(SQL.linkTaskClasses).bind(id, JSON.stringify(classIds)),
    ]);
    return json({ task: await taskFor(db, await one(db, 'SELECT * FROM tasks WHERE id=?', id)) }, 201);
  }
  if ((m = match(/^\/api\/tasks\/code\/([^/]+)\/classes\/([^/]+)\/students$/)) && method === 'GET') {
    const task = await one(db, SQL.taskByCode, m[1]);
    if (!task) return fail(404, 'Tugas tidak ditemukan.');
    if (!await one(db, SQL.taskClass, task.id, m[2])) return fail(404, 'Kelas tidak tersedia untuk tugas ini.');
    return json({ students: await all(db, SQL.students, m[2]) });
  }
  if ((m = match(/^\/api\/tasks\/code\/([^/]+)$/)) && method === 'GET') {
    const task = await one(db, SQL.taskByCode, m[1]);
    return task ? json({ task: await taskFor(db, task) }) : fail(404, 'Kode tugas tidak ditemukan.');
  }
  if ((m = match(/^\/api\/tasks\/([^/]+)\/submissions$/)) && method === 'GET') {
    if (!await owned(db, 'tasks', m[1], teacher.id)) return fail(404, 'Tugas tidak ditemukan.');
    return json({ submissions: (await all(db, SQL.submissions, m[1])).map(submissionDates) });
  }
  if ((m = match(/^\/api\/tasks\/([^/]+)$/))) {
    const task = await owned(db, 'tasks', m[1], teacher.id);
    if (!task) return fail(404, 'Tugas tidak ditemukan.');
    if (method === 'GET') return json({ task: await taskFor(db, task) });
    if (method === 'PUT') {
      const fields = taskFields(await body());
      if (!fields) return fail(400, 'Lengkapi judul, mata pelajaran, dan deadline.');
      await run(db, 'UPDATE tasks SET title=?,subject=?,description=?,deadline=? WHERE id=?', fields.title, fields.subject, fields.description, fields.deadline, task.id);
      return json({ task: await taskFor(db, { ...task, ...fields }) });
    }
    if (method === 'DELETE') {
      await deleteFiles(env, urlsOf(await all(db, SQL.taskFiles, task.id, task.id)));
      // task_classes ikut terhapus lewat ON DELETE CASCADE; submissions di D1 tidak punya cascade.
      await db.batch([
        db.prepare('DELETE FROM submissions WHERE task_id=?').bind(task.id),
        db.prepare('DELETE FROM tasks WHERE id=?').bind(task.id),
      ]);
      return json({ ok: true });
    }
  }
  if (path === '/api/submissions' && method === 'POST') {
    const form = await request.formData(), task = await one(db, 'SELECT * FROM tasks WHERE id=? AND task_code=?', String(form.get('task_id') || ''), String(form.get('task_code') || ''));
    if (!task) return fail(404, 'Tugas tidak ditemukan.');
    const name = String(form.get('student_name') || '').trim();
    let klass = String(form.get('student_class') || '').trim(), classId = null;
    if (await one(db, SQL.taskHasClasses, task.id)) {
      const selected = await one(db, SQL.taskClass, task.id, String(form.get('class_id') || ''));
      if (!selected) return fail(400, 'Kelas tidak tersedia untuk tugas ini.');
      if (name && !await one(db, SQL.rosterStudent, selected.id, name)) return fail(400, 'Nama tidak ada di daftar kelas ini.');
      ({ id: classId, name: klass } = selected);
    }
    const files = [...form.entries()].filter(([, value]) => isFile(value)).sort(([a], [b]) => compareFileFields(a, b)).map(([, value]) => value);
    if (!name || !klass || !files.length) return fail(400, 'Lengkapi nama, kelas, dan file tugas.');
    if (files.length > MAX_SUBMISSION_FILES) return fail(400, 'Maksimal 20 file per pengumpulan.');
    const accepted = files.map(file => submissionFile(task.submission_type, file.name, file.type));
    if (accepted.includes(null)) return fail(400, 'Jenis file tidak sesuai dengan tugas.');
    if (task.submission_type === 'image' && files.some(file => file.size > MAX_IMAGE_BYTES)) return fail(413, 'Foto maksimal 50 MB per file.');
    if (files.some(file => file.size > MAX_FILE_BYTES)) return fail(413, 'File maksimal 100 MB per file.');
    const identity = [task.id, name, classId, klass];
    const previous = await one(db, SQL.previousSubmission, ...identity);
    const current = await usage(db, env, task.teacher_id);
    const replaced = fileUrls(previous?.file_url).map(fileLocation).filter(Boolean).reduce((n, place) => n + (current.sizes.get(`${place.bucket}/${place.key}`) || 0), 0);
    if (current.total - replaced + files.reduce((n, f) => n + f.size, 0) > STORAGE_LIMIT_BYTES) return fail(413, 'Kapasitas penyimpanan sudah penuh.');
    const stored = [];
    let replacedSubmission;
    try {
      for (const [index, file] of files.entries()) {
        const key = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${accepted[index].name}`;
        stored.push(`${SITE_ORIGIN}/media/submission/${encodeURIComponent(key)}`);
        await env.SUBMISSION_FILES.put(key, file.stream(), { httpMetadata: { contentType: accepted[index].contentType } });
      }
      // Kiriman lama dibaca ulang di batch yang sama agar unggahan ulang bersamaan tetap atomik.
      const result = await db.batch([
        db.prepare(SQL.previousSubmission).bind(...identity),
        db.prepare(SQL.upsertSubmission).bind(crypto.randomUUID(), task.id, name, klass, classId, String(form.get('student_note') || '').trim(), JSON.stringify(stored), now()),
      ]);
      replacedSubmission = result[0].results[0];
    } catch (error) {
      await deleteFiles(env, stored).catch(cleanupError => console.error(cleanupError));
      throw error;
    }
    if (replacedSubmission) await deleteFiles(env, fileUrls(replacedSubmission.file_url)).catch(error => console.error(error));
    return json({ file_urls: stored, replaced: !!replacedSubmission }, 201);
  }
  if (path === '/api/storage/usage' && method === 'GET') return json({ used_bytes: (await usage(db, env, teacher.id)).total });
  if (path === '/api/files/blob' && method === 'GET') {
    const requested = url.searchParams.get('url') || '';
    if (!(await teacherUrls(db, teacher.id)).includes(requested)) return fail(404, 'File tidak ditemukan.');
    const place = fileLocation(requested);
    return place ? serveFile(request, env[place.bucket], place.key) : fail(400, 'URL file tidak valid.');
  }
  if (adminRoute) {
    if (!env.ADMIN_SETUP_KEY || request.headers.get('X-Admin-Key') !== env.ADMIN_SETUP_KEY) return fail(401, 'Setup key salah.');
    if (path === '/api/admin/teachers' && method === 'GET') return json({ teachers: (await all(db, 'SELECT id,email,created_at FROM teachers ORDER BY created_at DESC')).map(row => ({ ...row, created_at: utcTimestamp(row.created_at) })) });
    if (path === '/api/admin/teachers' && method === 'POST') {
      const input = await body(), email = String(input.email || '').trim().toLowerCase(), password = String(input.password || '');
      if (!email.includes('@') || password.length < 8) return fail(400, 'Email valid dan password minimal 8 karakter diperlukan.');
      if (await one(db, 'SELECT id FROM teachers WHERE email=?', email)) return fail(409, 'Email sudah digunakan.');
      const id = crypto.randomUUID(); await run(db, 'INSERT INTO teachers(id,email,password_hash) VALUES(?,?,?)', id, email, await makeHash(password));
      return json({ teacher: { id, email } }, 201);
    }
    if ((m = match(/^\/api\/admin\/teachers\/([^/]+)$/)) && method === 'DELETE') {
      const target = await one(db, 'SELECT id FROM teachers WHERE id=?', m[1]);
      if (!target) return fail(404, 'Guru tidak ditemukan.');
      await deleteFiles(env, await teacherUrls(db, target.id));
      // classes, students, dan task_classes ikut terhapus lewat ON DELETE CASCADE.
      await db.batch([
        db.prepare('DELETE FROM submissions WHERE task_id IN (SELECT id FROM tasks WHERE teacher_id=?)').bind(target.id),
        db.prepare('DELETE FROM tasks WHERE teacher_id=?').bind(target.id),
        db.prepare('DELETE FROM teachers WHERE id=?').bind(target.id),
      ]);
      return json({ ok: true });
    }
  }
  return fail(404, 'Endpoint tidak ditemukan.');
}
export default { async fetch(request, env) { try { return await route(request, env); } catch (error) { console.error(error); return fail(500, 'Terjadi kesalahan server.'); } } };
