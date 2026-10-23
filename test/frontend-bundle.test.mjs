import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { transform } from 'esbuild';
import { addSubmissionFiles, isLate } from '../public/assets/app-logic.mjs';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const entryPath = html.match(/src="([^"]+\.js)"/)[1];
const source = (await transform(await readFile(new URL('../public' + entryPath, import.meta.url), 'utf8'), { minify: false })).code;
function extract(name) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, `Missing ${name}`);
  const boundaries = [source.indexOf('\nfunction ', start + 10), source.indexOf('\nasync function ', start + 10)].filter(value => value >= 0);
  return source.slice(start, Math.min(...boundaries));
}

test('the actual download-all handler never downloads a partial ZIP', async () => {
  let exported = false;
  const context = {
    archiveSubmissionFiles: addSubmissionFiles,
    taskIsLate: isLate,
    F6: 'Tepat Waktu', q6: 'Terlambat',
    ad: value => JSON.parse(value),
    e0: value => value,
    $2: class { folder() { return this; } file() {} },
    rd: async url => { if (url === 'broken') throw new Error('HTTP 404'); return { blob: 'bytes', ext: '.mp3' }; },
    id: async () => { exported = true; },
  };
  const handler = vm.runInNewContext([extract('B3'), extract('D3'), extract('G6'), 'G6'].join('\n'), context);
  await assert.rejects(handler({ title: 'Tugas', deadline: '2026-10-10T00:00:00+07:00', submission_type: 'audio' }, [{ student_class: 'Kelas', student_name: 'Siswa', created_at: '2026-10-09 00:00:00', file_url: JSON.stringify(['good', 'broken']) }]), /ZIP belum dibuat/);
  assert.equal(exported, false);
});

test('the actual bulk ZIP handler surfaces submission API failures', async () => {
  let exported = false;
  const context = {
    Ma: async path => { if (path === '/api/tasks') return { tasks: [{ id: 'task', title: 'Tugas', subject: 'Bahasa', created_at: '2026-10-09T00:00:00Z' }] }; throw new Error('offline'); },
    e0: value => value,
    $2: class { folder() { return this; } },
    id: async () => { exported = true; },
  };
  const handler = vm.runInNewContext(extract('X6') + '\nX6', context);
  await assert.rejects(handler(), /Gagal memuat kiriman tugas Tugas.*ZIP belum dibuat/);
  assert.equal(exported, false);
});

test('the actual frontend separates late submissions correctly for UTC legacy dates', () => {
  const classify = vm.runInNewContext(extract('yy') + '\nyy', { taskIsLate: isLate });
  const result = classify([{ created_at: '2026-10-10 00:30:00' }, { created_at: '2026-10-09 22:30:00' }], Date.parse('2026-10-09T23:00:00Z'));
  assert.equal(result.late.length, 1);
  assert.equal(result.submitted.length, 1);
});

test('displayed task times stay in WIB in browsers from other timezones', () => {
  const format = vm.runInNewContext(extract('wf') + '\nwf', { Date });
  assert.match(format('2026-10-09T23:00:00Z'), /10 Oktober 2026.*06[.:]00/);
});

test('dashboard tasks finish while capacity is unavailable', async () => {
  const calls = [];
  const load = vm.runInNewContext(extract('Zv') + '\nZv', {
    Ma: async path => {
      calls.push(path);
      if (path === '/api/storage/usage') return new Promise(() => {});
      return path === '/api/tasks' ? { tasks: [{ id: 'task' }] } : { classes: [] };
    },
  });
  const result = await Promise.race([load(), new Promise((_, reject) => setTimeout(() => reject(Error('Dashboard waited for storage')), 100))]);
  assert.equal(result.tasks[0].id, 'task');
  assert.deepEqual(calls.sort(), ['/api/classes', '/api/tasks']);
});

function storageHookHarness(initial = {}) {
  const cache = new Map(Object.entries(initial));
  cache.set('teacher_id', 'teacher');
  let state, effect, resolve, reject, writes = 0;
  const context = {
    Number, JSON,
    localStorage: { getItem: key => cache.get(key) ?? null, setItem: (key, value) => { writes++; cache.set(key, value); } },
    Ye: { useState: init => { if (state === undefined) state = init(); return [state, update => { state = update(state); }]; }, useEffect: callback => { effect = callback; } },
    Ma: () => new Promise((yes, no) => { resolve = yes; reject = no; }),
  };
  const hook = vm.runInNewContext(extract('storageUsage') + '\n' + extract('readDashboardStorage') + '\n' + extract('useDashboardStorage') + '\nuseDashboardStorage', context);
  return { render: () => hook({ tasks: [] }, '/dashboard'), start: () => effect(), resolve: value => resolve(value), reject: () => reject(Error('offline')), cache, state: () => state, writes: () => writes };
}

test('capacity uses the account cache immediately and replaces it only when changed', async () => {
  const h = storageHookHarness({ 'tugas:storage:teacher': '{"used_bytes":100}' });
  assert.equal(h.render().used_bytes, 100);
  h.start();
  assert.equal(h.state().value.used_bytes, 100);
  h.resolve({ used_bytes: 200 }); await new Promise(setImmediate);
  assert.equal(h.render().used_bytes, 200);
  assert.equal(JSON.parse(h.cache.get('tugas:storage:teacher')).used_bytes, 200);
  const previous = h.state(); h.start(); h.resolve({ used_bytes: 200 }); await new Promise(setImmediate);
  assert.equal(h.state(), previous);
  assert.equal(h.writes(), 1);
});

test('capacity stays hidden on first load and preserves the cache on failures', async () => {
  const fresh = storageHookHarness();
  assert.equal(fresh.render(), null); fresh.start(); fresh.reject(); await new Promise(setImmediate);
  assert.equal(fresh.render(), null);
  const cached = storageHookHarness({ 'tugas:storage:teacher': '{"used_bytes":100}', 'tugas:storage:other': '{"used_bytes":999}' });
  assert.equal(cached.render().used_bytes, 100); const cancel = cached.start(); cancel(); cached.resolve({ used_bytes: 300 }); await new Promise(setImmediate);
  assert.equal(cached.render().used_bytes, 100);
  cached.start(); cached.reject(); await new Promise(setImmediate);
  assert.equal(cached.render().used_bytes, 100);
});
