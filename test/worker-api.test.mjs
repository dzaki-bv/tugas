import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.mjs';
import { createWorkerEnv, seedTask, submissionForm } from './helpers/worker-env.mjs';

async function api(fixture, path, method = 'GET', body) {
  const headers = { Authorization: `Bearer ${fixture.token}` };
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await worker.fetch(new Request(`https://tugas.dzaki-fird.workers.dev${path}`, { method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined }), fixture.env);
  return { status: response.status, body: await response.json() };
}

test('12 submission files retain their numeric order', async t => {
  const fixture = await createWorkerEnv(); t.after(() => fixture.sql.close()); seedTask(fixture.sql);
  const result = await api(fixture, '/api/submissions', 'POST', submissionForm({ count: 12 }));
  assert.equal(result.status, 201);
  assert.deepEqual(result.body.file_urls.map(url => Number(/part_(\d+)\.mp3$/.exec(url)[1])), Array.from({ length: 12 }, (_, i) => i));
});

test('concurrent resubmissions leave one row and remove superseded objects', async t => {
  const fixture = await createWorkerEnv(); t.after(() => fixture.sql.close()); seedTask(fixture.sql);
  const responses = await Promise.all(Array.from({ length: 4 }, () => api(fixture, '/api/submissions', 'POST', submissionForm())));
  assert.deepEqual(responses.map(r => r.status), [201, 201, 201, 201]);
  assert.equal(responses.filter(r => !r.body.replaced).length, 1);
  assert.equal(fixture.sql.prepare('SELECT COUNT(*) AS n FROM submissions').get().n, 1);
  assert.equal(fixture.objects.size, 1);
});

test('renaming an assigned class preserves its previous submission and replacement identity', async t => {
  const fixture = await createWorkerEnv(); t.after(() => fixture.sql.close()); seedTask(fixture.sql);
  fixture.sql.exec("INSERT INTO classes VALUES('class','teacher','Kelas Lama'); INSERT INTO students VALUES('student','class','Siswa Uji'); INSERT INTO task_classes VALUES('task','class');");
  const first = await api(fixture, '/api/submissions', 'POST', submissionForm({ klass: 'Kelas Lama', classId: 'class' }));
  assert.equal(first.status, 201);
  assert.equal((await api(fixture, '/api/classes/class', 'PUT', { name: 'Kelas Baru' })).status, 200);
  const listed = (await api(fixture, '/api/tasks/task/submissions')).body.submissions;
  assert.equal(listed[0].student_class, 'Kelas Baru');
  assert.equal(listed[0].class_id, 'class');
  const next = await api(fixture, '/api/submissions', 'POST', submissionForm({ klass: 'Kelas Lama', classId: 'class' }));
  assert.equal(next.status, 201);
  assert.equal(next.body.replaced, true);
  assert.equal(fixture.sql.prepare('SELECT COUNT(*) AS n FROM submissions').get().n, 1);
  assert.equal(fixture.objects.size, 1);
});

test('API timestamps identify UTC creation and WIB deadline explicitly', async t => {
  const fixture = await createWorkerEnv(); t.after(() => fixture.sql.close()); seedTask(fixture.sql);
  fixture.sql.exec("INSERT INTO submissions(id,task_id,student_name,student_class,file_url,created_at) VALUES('sub','task','Siswa','Bebas','[]','2026-10-10 00:30:00');");
  const task = (await api(fixture, '/api/tasks/task')).body.task;
  const submission = (await api(fixture, '/api/tasks/task/submissions')).body.submissions[0];
  assert.equal(new Date(task.deadline).toISOString(), '2026-10-09T23:00:00.000Z');
  assert.equal(new Date(submission.created_at).toISOString(), '2026-10-10T00:30:00.000Z');
  assert.ok(new Date(submission.created_at) > new Date(task.deadline));
});

test('21 files are rejected before writing any objects', async t => {
  const fixture = await createWorkerEnv(); t.after(() => fixture.sql.close()); seedTask(fixture.sql);
  const result = await api(fixture, '/api/submissions', 'POST', submissionForm({ count: 21 }));
  assert.equal(result.status, 400);
  assert.equal(fixture.objects.size, 0);
});

test('oversized audio is rejected before reading file streams', async t => {
  const fixture = await createWorkerEnv(); t.after(() => fixture.sql.close()); seedTask(fixture.sql);
  const fields = new Map([['task_id', 'task'], ['task_code', '900010'], ['student_name', 'Siswa'], ['student_class', 'Bebas'], ['file_0', { name: 'large.mp3', type: 'audio/mpeg', size: 100 * 1024 ** 2 + 1, stream: () => assert.fail('must reject before streaming') }]]);
  const request = new Request('https://tugas.dzaki-fird.workers.dev/api/submissions', { method: 'POST' });
  request.formData = async () => ({ get: key => fields.get(key), entries: () => fields.entries() });
  assert.equal((await worker.fetch(request, fixture.env)).status, 413);
  assert.equal(fixture.objects.size, 0);
});

test('failed replacement uploads preserve the previous submission and clean partial uploads', async t => {
  const fixture = await createWorkerEnv(); t.after(() => fixture.sql.close()); seedTask(fixture.sql);
  const first = await api(fixture, '/api/submissions', 'POST', submissionForm());
  const saved = fixture.sql.prepare('SELECT file_url FROM submissions').get().file_url;
  const originalPut = fixture.env.SUBMISSION_FILES.put;
  let calls = 0;
  fixture.env.SUBMISSION_FILES.put = async (...args) => { if (++calls === 2) throw new Error('synthetic upload failure'); return originalPut(...args); };
  assert.equal((await api(fixture, '/api/submissions', 'POST', submissionForm({ count: 2 }))).status, 500);
  assert.equal(fixture.sql.prepare('SELECT file_url FROM submissions').get().file_url, saved);
  assert.equal(fixture.objects.size, 1);
  assert.equal(JSON.parse(saved)[0], first.body.file_urls[0]);
});

test('editing task preserves code, attachment, classes and submissions and validates owner', async t => {
  const fixture = await createWorkerEnv(); t.after(() => fixture.sql.close()); seedTask(fixture.sql);
  const original = (await api(fixture, '/api/tasks/task')).body.task;
  await api(fixture, '/api/submissions', 'POST', submissionForm());
  const changes = { title: 'Judul baru', subject: 'English', description: 'Petunjuk baru\nBaris kedua', deadline: '2026-10-19T00:00' };
  const updated = await api(fixture, '/api/tasks/task', 'PUT', changes);
  assert.equal(updated.status, 200);
  assert.equal(updated.body.task.title, changes.title);
  assert.equal(updated.body.task.description, changes.description);
  assert.equal(Date.parse(updated.body.task.deadline), Date.parse('2026-10-19T00:00:00+07:00'));
  assert.equal(updated.body.task.task_code, original.task_code);
  assert.equal(updated.body.task.file_url, original.file_url);
  assert.deepEqual(updated.body.task.classes, original.classes);
  assert.equal((await api(fixture, '/api/tasks/task/submissions')).body.submissions.length, 1);
  assert.equal((await api(fixture, '/api/tasks/task', 'PUT', { ...changes, title: ' ' })).status, 400);
  assert.equal((await api(fixture, '/api/tasks/missing', 'PUT', changes)).status, 404);
  fixture.sql.exec("INSERT INTO teachers(id,email,password_hash) VALUES('other-teacher','other@example.test','x')");
  fixture.sql.prepare('UPDATE tasks SET teacher_id=? WHERE id=?').run('other-teacher', 'task');
  assert.equal((await api(fixture, '/api/tasks/task', 'PUT', changes)).status, 404);
});

test('submission does not inspect every previous file before saving', async t => {
  const fixture = await createWorkerEnv(); t.after(() => fixture.sql.close()); seedTask(fixture.sql);
  for (let i = 0; i < 160; i++) {
    const key = `previous-${i}.mp3`;
    fixture.objects.set(key, new Uint8Array(1).buffer);
    fixture.sql.prepare('INSERT INTO submissions(id,task_id,student_name,student_class,file_url) VALUES(?,?,?,?,?)').run(`previous-${i}`, 'task', `Previous ${i}`, 'Bebas', JSON.stringify([`https://tugas.dzaki-fird.workers.dev/media/submission/${key}`]));
  }
  let heads = 0;
  const head = fixture.env.SUBMISSION_FILES.head;
  fixture.env.SUBMISSION_FILES.head = async key => { heads++; return head(key); };
  fixture.env.SUBMISSION_FILES.list = async () => ({ objects: [...fixture.objects].map(([key, bytes]) => ({ key, size: bytes.byteLength })), truncated: false });
  const result = await api(fixture, '/api/submissions', 'POST', submissionForm());
  assert.equal(result.status, 201);
  assert.ok(heads <= 1, `submission waited for ${heads} individual R2 reads`);
});

test('capacity follows R2 pagination, ignores unrelated objects and enforces the quota', async t => {
  const fixture = await createWorkerEnv(); t.after(() => fixture.sql.close()); seedTask(fixture.sql);
  fixture.sql.prepare('INSERT INTO submissions(id,task_id,student_name,student_class,file_url) VALUES(?,?,?,?,?)').run('old', 'task', 'Previous', 'Bebas', JSON.stringify(['https://tugas.dzaki-fird.workers.dev/media/submission/old.mp3']));
  const cursors = [];
  fixture.env.SUBMISSION_FILES.list = async options => {
    cursors.push(options.cursor);
    return options.cursor ? { objects: [{ key: 'old.mp3', size: 10 * 1024 ** 3 }], truncated: false } : { objects: [{ key: 'unrelated.mp3', size: 50 * 1024 ** 3 }], truncated: true, cursor: 'page-2' };
  };
  const result = await api(fixture, '/api/submissions', 'POST', submissionForm());
  assert.equal(result.status, 413);
  assert.deepEqual(cursors, [undefined, 'page-2']);
  assert.equal(fixture.objects.size, 0);
});

test('stored submission type comes from the allowlisted extension, never from the client MIME', async t => {
  const fixture = await createWorkerEnv(); t.after(() => fixture.sql.close()); seedTask(fixture.sql);
  const form = submissionForm({ count: 0 });
  form.set('file_0', new Blob(['<script>alert(1)</script>'], { type: 'audio/mpeg' }), 'evil.html');
  form.set('file_1', new Blob(['<script>alert(1)</script>'], { type: 'text/html' }), 'song.mp3');
  const result = await api(fixture, '/api/submissions', 'POST', form);
  assert.equal(result.status, 201);
  assert.match(result.body.file_urls[0], /evil\.html\.mp3$/);
  assert.deepEqual([...fixture.metadata.values()].map(meta => meta.contentType), ['audio/mpeg', 'audio/mpeg']);
  const rejected = submissionForm({ count: 0 });
  rejected.set('file_0', new Blob(['<svg onload="alert(1)"/>'], { type: 'image/svg+xml' }), 'x.svg');
  assert.equal((await api(fixture, '/api/submissions', 'POST', rejected)).status, 400);
});

test('tasks with classes identify the class by id only', async t => {
  const fixture = await createWorkerEnv(); t.after(() => fixture.sql.close()); seedTask(fixture.sql);
  fixture.sql.exec("INSERT INTO classes VALUES('class','teacher','IX.1'); INSERT INTO students VALUES('student','class','Siswa Uji'); INSERT INTO task_classes VALUES('task','class');");
  assert.equal((await api(fixture, '/api/submissions', 'POST', submissionForm({ klass: 'IX.1' }))).status, 400);
  const accepted = await api(fixture, '/api/submissions', 'POST', submissionForm({ klass: '', classId: 'class' }));
  assert.equal(accepted.status, 201);
  assert.equal(fixture.sql.prepare('SELECT student_class FROM submissions').get().student_class, 'IX.1');
});

test('deleting a teacher relies on cascades for classes, students and task links', async t => {
  const fixture = await createWorkerEnv(); t.after(() => fixture.sql.close()); seedTask(fixture.sql);
  fixture.sql.exec("INSERT INTO classes VALUES('class','teacher','IX.1'); INSERT INTO students VALUES('student','class','Siswa Uji'); INSERT INTO task_classes VALUES('task','class');");
  await api(fixture, '/api/submissions', 'POST', submissionForm({ classId: 'class' }));
  fixture.env.ADMIN_SETUP_KEY = 'admin-key';
  const response = await worker.fetch(new Request('https://tugas.dzaki-fird.workers.dev/api/admin/teachers/teacher', { method: 'DELETE', headers: { 'X-Admin-Key': 'admin-key' } }), fixture.env);
  assert.equal(response.status, 200);
  for (const table of ['teachers', 'classes', 'students', 'tasks', 'task_classes', 'submissions']) assert.equal(fixture.sql.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0, table);
  assert.equal(fixture.objects.size, 0);
});
