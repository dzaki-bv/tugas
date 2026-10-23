import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.mjs';

const bytes = new TextEncoder().encode('0123456789');
const key = 'sample.mp3';
const bucket = {
  async head(requested) { return requested === key ? metadata() : null; },
  async get(requested, options = {}) {
    if (requested !== key) return null;
    const offset = options.range?.offset ?? 0;
    const length = options.range?.length ?? bytes.length;
    return { ...metadata(), body: new Blob([bytes.slice(offset, offset + length)]).stream() };
  },
};
function metadata() {
  return {
    size: bytes.length,
    httpEtag: '"sample"',
    writeHttpMetadata(headers) { headers.set('Content-Type', 'audio/mpeg'); },
  };
}
const url = `https://tugas.dzaki-fird.workers.dev/media/submission/${key}`;
const fetchMedia = (method, range) => worker.fetch(new Request(url, { method, headers: range ? { Range: range } : {} }), { SUBMISSION_FILES: bucket });

test('audio endpoint supports byte ranges used by media players', async () => {
  const first = await fetchMedia('GET', 'bytes=0-3');
  assert.equal(first.status, 206);
  assert.equal(first.headers.get('Content-Range'), 'bytes 0-3/10');
  assert.equal(first.headers.get('Content-Length'), '4');
  assert.equal(first.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(await first.text(), '0123');

  const last = await fetchMedia('GET', 'bytes=-3');
  assert.equal(last.status, 206);
  assert.equal(await last.text(), '789');

  const invalid = await fetchMedia('GET', 'bytes=10-');
  assert.equal(invalid.status, 416);
  assert.equal(invalid.headers.get('Content-Range'), 'bytes */10');

  const head = await fetchMedia('HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('Content-Length'), '10');
  assert.equal(await head.text(), '');
});

test('media responses forbid sniffing and download non-media types', async () => {
  const html = { ...bucket, async head() { return { ...metadata(), writeHttpMetadata(headers) { headers.set('Content-Type', 'text/html'); } }; } };
  const response = await worker.fetch(new Request('https://tugas.dzaki-fird.workers.dev/media/task/page.html', { method: 'HEAD' }), { TASK_FILES: html });
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('Content-Disposition'), 'attachment');
  const audio = await fetchMedia('HEAD');
  assert.equal(audio.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(audio.headers.get('Content-Disposition'), null);
});
