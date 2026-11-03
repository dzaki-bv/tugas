import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { transform } from 'esbuild';

async function uploadHandler(XMLHttpRequest) {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const path = html.match(/src="([^"]+\.js)"/)[1];
  const source = (await transform(await readFile(new URL('../public' + path, import.meta.url), 'utf8'), { minify: false })).code;
  const start = source.indexOf('async function Ry(');
  const end = source.indexOf('\nconst Na ', start);
  return vm.runInNewContext(source.slice(start, end) + '\nRy', { XMLHttpRequest, tc: '', _o: Error, setTimeout, clearTimeout, Kg: async () => {} });
}

function xhrFixture(send) {
  return class {
    upload = {};
    open() {}
    getResponseHeader() { return null; }
    abort() { this.aborted = true; this.onabort?.(); }
    send(form) { send(this, form); }
  };
}

test('submission stops waiting when the connection stalls at saving', async () => {
  let request;
  const upload = await uploadHandler(xhrFixture(xhr => { request = xhr; xhr.upload.onload(); }));
  const result = await Promise.race([
    upload('/api/submissions', new FormData(), { savingTimeoutMs: 10 }).then(() => 'resolved', error => error.message),
    new Promise(resolve => setTimeout(() => resolve('stuck at 95%'), 100)),
  ]);
  assert.notEqual(result, 'stuck at 95%');
  assert.match(result, /Waktu.*habis/);
  assert.equal(request.aborted, true);
});

test('real upload progress precedes saving and a successful response', async () => {
  const events = [];
  const upload = await uploadHandler(xhrFixture(xhr => {
    assert.equal(xhr.timeout, 300000);
    xhr.upload.onprogress({ lengthComputable: true, loaded: 50, total: 100 });
    xhr.upload.onload();
    xhr.status = 201; xhr.responseText = '{"file_urls":["file"]}'; xhr.onload();
  }));
  const result = await upload('/api/submissions', new FormData(), { onProgress: n => events.push(n), onSaving: () => events.push('saving') });
  assert.deepEqual(events, [47, 'saving']);
  assert.equal(result.file_urls[0], 'file');
});

test('network failures and total request timeout reject and allow retry', async () => {
  for (const event of ['onerror', 'ontimeout']) {
    const upload = await uploadHandler(xhrFixture(xhr => xhr[event]()));
    await assert.rejects(upload('/api/submissions', new FormData()), /koneksi|Waktu/i);
  }
});

test('rate limits with non-JSON bodies retry before parsing the response', async () => {
  let calls = 0;
  const upload = await uploadHandler(xhrFixture(xhr => {
    xhr.status = ++calls === 1 ? 429 : 201;
    xhr.responseText = calls === 1 ? 'Too many requests' : '{"file_urls":[]}';
    xhr.onload();
  }));
  const retries = [];
  await upload('/api/submissions', new FormData(), { onRetry: attempt => retries.push(attempt) });
  assert.equal(calls, 2); assert.deepEqual(retries, [1]);
});

test('actual submit form stays in upload phase until transfer finishes and unlocks after failure', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../public' + html.match(/src="([^"]+\.js)"/)[1], import.meta.url), 'utf8');
  const chunkName = entry.match(/import\("\.\/(SubmitPage-[^"]+\.js)"\)/)[1];
  const source = (await transform(await readFile(new URL('../public/assets/' + chunkName, import.meta.url), 'utf8'), { minify: false })).code;
  const start = source.indexOf('function createSubmitHandler('), end = source.indexOf('\nfunction ', start + 10);
  assert.ok(start >= 0 && end > start);
  const createSubmitHandler = vm.runInNewContext(source.slice(start, end) + '\ncreateSubmitHandler', { FormData, Error, setTimeout, Promise, Object });
  const state = {}, messages = [], forms = [];
  let fail, callbacks;
  const deps = {
    task: { id: 'task' }, submitting: false, code: '123456', studentName: ' Student ', studentClass: 'Class', classes: [{ id: 'class-1', name: 'Class' }], note: '', files: [new Blob(['audio'])],
    validate: () => ({}), toast: message => messages.push(message),
    setFieldErrors: value => state.errors = value, setSubmitting: value => state.locked = value, setUploadOpen: value => state.open = value,
    setPhase: value => state.phase = value, setStatusText: () => {}, setUploadPercent: value => state.percent = value, setUploadError: value => state.error = value,
    upload: (_, form, options) => { forms.push(form); callbacks = options; return new Promise((_, reject) => { fail = reject; }); },
    onDone: () => { state.done = true; },
  };
  const pending = createSubmitHandler(deps)({ preventDefault() {} });
  assert.equal(state.phase, 'progress'); assert.equal(state.percent, 0); assert.equal(state.open, true); assert.equal(state.locked, true);
  assert.equal(forms[0].get('student_name'), 'Student'); assert.equal(forms[0].get('class_id'), 'class-1'); assert.ok(forms[0].get('file_0'));
  callbacks.onProgress(47); assert.equal(state.percent, 47);
  callbacks.onSaving(); assert.equal(state.phase, 'saving');
  fail(new Error('Waktu pengiriman habis')); await pending;
  assert.equal(state.open, false); assert.equal(state.locked, false);
  assert.equal(state.error, 'Waktu pengiriman habis'); assert.equal(state.done, undefined); assert.deepEqual(messages, []);
});

test('actual submit form stops before uploading when validation fails', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../public' + html.match(/src="([^"]+\.js)"/)[1], import.meta.url), 'utf8');
  const chunkName = entry.match(/import\("\.\/(SubmitPage-[^"]+\.js)"\)/)[1];
  const source = (await transform(await readFile(new URL('../public/assets/' + chunkName, import.meta.url), 'utf8'), { minify: false })).code;
  const pick = name => { const start = source.indexOf(`function ${name}(`); return source.slice(start, source.indexOf('\nfunction ', start + 10)); };
  const validate = vm.runInNewContext(pick('validateSubmission') + '\nvalidateSubmission', { TYPE_META: { image: { noun: 'foto' } } });
  const errors = validate({ studentName: 'Zulkarnaen', studentClass: 'XII IPA 2', classes: [{ id: 'a', name: 'XII IPA 2' }], studentsFailed: false, nameIsValid: () => false, files: [], type: 'image' });
  assert.deepEqual({ ...errors }, { name: 'Nama tidak ada di daftar kelas ini.', files: 'Tambahkan foto tugas terlebih dahulu.' });
  const createSubmitHandler = vm.runInNewContext(pick('createSubmitHandler') + '\ncreateSubmitHandler', { FormData, Error, setTimeout, Promise, Object });
  let uploaded = false; const messages = [];
  await createSubmitHandler({ task: { id: 'task' }, submitting: false, validate: () => errors, setFieldErrors: () => {}, toast: message => messages.push(message), upload: () => { uploaded = true; } })();
  assert.equal(uploaded, false); assert.deepEqual(messages, ['Nama tidak ada di daftar kelas ini.']);
});
