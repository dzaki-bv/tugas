import test from 'node:test';
import assert from 'node:assert/strict';
import { addSubmissionFiles, createStudentLoader, deadlineTimestamp, utcTimestamp, isLate, missingStudents, filterSubmissions } from '../public/assets/app-logic.mjs';

test('legacy UTC timestamps and WIB deadlines produce the same result in any host timezone', () => {
  const original = process.env.TZ;
  try {
    for (const zone of ['UTC', 'Asia/Jakarta', 'America/New_York']) {
      process.env.TZ = zone;
      assert.equal(utcTimestamp('2026-10-10 00:30:00'), '2026-10-10T00:30:00.000Z');
      assert.equal(deadlineTimestamp('2026-10-10 06:00'), '2026-10-09T23:00:00.000Z');
      assert.ok(isLate({ created_at: '2026-10-10 00:30:00' }, '2026-10-10 06:00'));
      assert.ok(isLate({ created_at: '2026-10-10 00:30:00' }, Date.parse('2026-10-09T23:00:00Z')));
      assert.equal(isLate({ created_at: '2026-10-09 22:30:00' }, Date.parse('2026-10-09T23:00:00Z')), false);
    }
  } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
});

test('class identity survives renaming in filters and missing-student counts', () => {
  const submissions = [{ class_id: 'class', student_class: 'Kelas Lama', student_name: 'Siswa' }];
  const classes = [{ id: 'class', name: 'Kelas Baru' }];
  assert.equal(filterSubmissions(submissions, 'class', classes).length, 1);
  assert.deepEqual(missingStudents([{ classId: 'class', className: 'Kelas Baru', students: [{ name: 'Siswa' }] }], submissions, 'all', classes), []);
});

test('slower previous class responses cannot replace the current student list', async () => {
  const pending = new Map(); let shown = []; let endings = 0;
  const loader = createStudentLoader({ load: id => new Promise(resolve => pending.set(id, resolve)), begin: () => {}, success: names => { shown = names; }, failure: () => assert.fail('unexpected failure'), end: () => endings++ });
  const first = loader('A'), second = loader('B');
  pending.get('B')(['Siswa B']); await second;
  pending.get('A')(['Siswa A']); await first;
  assert.deepEqual(shown, ['Siswa B']);
  assert.equal(endings, 1);
});

test('a stale error or cancelled request cannot change the active class state', async () => {
  let fail; let failures = 0; let endings = 0;
  const loader = createStudentLoader({ load: () => new Promise((_resolve, reject) => { fail = reject; }), begin: () => {}, success: () => assert.fail('unexpected response'), failure: () => failures++, end: () => endings++ });
  const request = loader('A'); loader.cancel(); fail(new Error('offline')); await request;
  assert.equal(failures, 0); assert.equal(endings, 0);
});

test('a ZIP file failure stops the export with a useful error instead of reporting a partial archive as complete', async () => {
  const archive = new Map();
  await assert.rejects(addSubmissionFiles({ archive: { file: (name, data) => archive.set(name, data) }, urls: ['good', 'broken'], name: 'Siswa Uji', download: async url => { if (url === 'broken') throw new Error('HTTP 404'); return { blob: 'bytes', ext: '.mp3' }; } }), /berkas 2\/2 milik Siswa Uji.*ZIP belum dibuat/);
  assert.equal(archive.size, 1);
});

test('a complete ZIP uses numeric filenames in the original submission order', async () => {
  const names = [];
  const count = await addSubmissionFiles({ archive: { file: name => names.push(name) }, urls: ['first', 'second'], name: 'Siswa Uji', download: async () => ({ blob: 'bytes', ext: '.mp3' }) });
  assert.equal(count, 2);
  assert.deepEqual(names, ['Siswa Uji_1.mp3', 'Siswa Uji_2.mp3']);
});

test('legacy submissions without a class id still match their roster by class name', () => {
  const rosters = [{ classId: 'class', className: 'IX.1', students: [{ name: 'Siswa Lama' }, { name: 'Siswa Baru' }, { name: 'Belum' }] }];
  const submissions = [{ student_class: ' ix.1 ', student_name: 'siswa lama ' }, { class_id: 'class', student_class: 'IX.1', student_name: 'Siswa Baru' }, { class_id: 'other', student_class: 'IX.1', student_name: 'Belum' }];
  assert.deepEqual(missingStudents(rosters, submissions, 'all'), [{ name: 'Belum', className: 'IX.1' }]);
  assert.deepEqual(missingStudents(rosters, submissions, 'class'), [{ name: 'Belum', className: 'IX.1' }]);
});
