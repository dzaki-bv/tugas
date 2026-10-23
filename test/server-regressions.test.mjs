import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'tugas-regress-'));
Object.assign(process.env, { NODE_ENV: 'test', DATA_DIR: dir, TEACHER_EMAIL: 'regress@example.test', TEACHER_PASSWORD: 'regress-password' });
const { app, db } = await import('../server.mjs');
const server = app.listen(0);
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => { server.close(); db.close(); rmSync(dir, { recursive: true, force: true }); });

const { token } = await (await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'regress@example.test', password: 'regress-password' }) })).json();
const auth = { Authorization: `Bearer ${token}` };
async function createTask(type, attachment) {
  const form = new FormData();
  form.set('title', 'Uji'); form.set('subject', 'Uji'); form.set('deadline', '2030-01-01T10:00'); form.set('submission_type', type);
  if (attachment) form.set('file', attachment, 'lampiran.html');
  return (await (await fetch(base + '/api/tasks', { method: 'POST', headers: auth, body: form })).json()).task;
}
function submission(task, file, name = 'Siswa') {
  const form = new FormData();
  form.set('task_id', task.id); form.set('task_code', task.task_code); form.set('student_name', name); form.set('student_class', 'Bebas');
  form.set('file_0', file.blob, file.name);
  return form;
}

test('an HTML upload disguised with an image MIME is stored and served as an image', async () => {
  const task = await createTask('image');
  const response = await fetch(base + '/api/submissions', { method: 'POST', body: submission(task, { blob: new Blob(['<script>alert(1)</script>'], { type: 'image/png' }), name: 'evil.html' }) });
  assert.equal(response.status, 201);
  const [url] = (await response.json()).file_urls;
  assert.match(url, /evil\.html\.png$/);
  const served = await fetch(base + url);
  assert.equal(served.headers.get('content-type'), 'image/png');
  assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
  const svg = await fetch(base + '/api/submissions', { method: 'POST', body: submission(task, { blob: new Blob(['<svg/>'], { type: 'image/svg+xml' }), name: 'x.svg' }, 'Siswa SVG') });
  assert.equal(svg.status, 400);
});

test('teacher attachments that are not media are downloaded, not rendered', async () => {
  const task = await createTask('image', new Blob(['<script>alert(1)</script>'], { type: 'text/html' }));
  const served = await fetch(base + task.file_url);
  assert.equal(served.headers.get('content-disposition'), 'attachment');
});

test('stored file URLs ignore the request Host header', async () => {
  const task = await createTask('image');
  const body = new Response(submission(task, { blob: new Blob(['x'], { type: 'image/png' }), name: 'a.png' }, 'Siswa Host'));
  const payload = Buffer.from(await body.arrayBuffer());
  const text = await new Promise((resolve, reject) => {
    const req = request(base + '/api/submissions', { method: 'POST', headers: { host: 'evil.example', 'content-type': body.headers.get('content-type') } }, res => {
      let data = ''; res.on('data', chunk => { data += chunk; }); res.on('end', () => resolve(data));
    });
    req.on('error', reject); req.end(payload);
  });
  const [url] = JSON.parse(text).file_urls;
  assert.match(url, /^\/files\//);
});

test('editing a task without a JSON body is a validation error, not a crash', async () => {
  const task = await createTask('image');
  const response = await fetch(base + `/api/tasks/${task.id}`, { method: 'PUT', headers: auth });
  assert.equal(response.status, 400);
});
