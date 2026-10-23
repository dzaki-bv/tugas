import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import worker from '../worker.mjs';

test('submission chunk can load its legacy entry import when the asset is missing', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const entry = html.match(/src="([^"]+\.js)"/)[1];
  const chunk = await readFile(new URL('../public/assets/SubmitPage-B4ZWda05.js', import.meta.url), 'utf8');
  assert.ok(chunk.includes('./index-Ci25O57r.js'));
  const response = await worker.fetch(new Request('https://tugas.dzaki-fird.workers.dev/assets/index-Ci25O57r.js'), {
    ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Content-Type'), /application\/javascript/);
  assert.equal(await response.text(), `export * from './${entry.split('/').pop()}';\n`);
});
