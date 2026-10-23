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
  const start = source.indexOf('async function me('), end = source.indexOf('\n  if (!l)', start);
  assert.ok(start >= 0 && end > start);
  const state = {}, messages = [];
  let fail, callbacks;
  const handler = vm.runInNewContext(source.slice(start, end) + '\nme', {
    a: { id: 'task' }, P: false, b: 'Student', w: 'Class', $: [], y: [new Blob(['audio'])], l: '123456', B: '', o: 'audio', FormData, Error,
    U: value => state.locked = value, j: value => state.open = value, d: value => state.phase = value, I: () => {}, setUploadPercent: value => state.percent = value,
    ke: (_, __, options) => { callbacks = options; return new Promise((_, reject) => { fail = reject; }); },
    i: message => messages.push(message),
  });
  const pending = handler({ preventDefault() {} });
  assert.equal(state.phase, 'progress'); assert.equal(state.percent, 0);
  callbacks.onProgress(47); assert.equal(state.percent, 47);
  callbacks.onSaving(); assert.equal(state.phase, 'saving');
  fail(new Error('Waktu pengiriman habis')); await pending;
  assert.equal(state.open, false); assert.equal(state.locked, false);
  assert.deepEqual(messages, ['Waktu pengiriman habis']);
});
