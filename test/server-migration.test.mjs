import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('a half-applied identity migration with duplicate legacy rows is completed on startup', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tugas-migrate-'));
  mkdirSync(join(dir, 'files'), { recursive: true });
  for (const name of ['old.mp3', 'new.mp3']) writeFileSync(join(dir, 'files', name), name);
  const legacy = new DatabaseSync(join(dir, 'tugas.sqlite'));
  // Kondisi sesudah percobaan migrasi lama gagal: kolom class_id sudah ada, indeks unik belum.
  legacy.exec(`CREATE TABLE teachers (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE tasks (id TEXT PRIMARY KEY, teacher_id TEXT NOT NULL, title TEXT NOT NULL, subject TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', deadline TEXT NOT NULL, submission_type TEXT NOT NULL, task_code TEXT NOT NULL UNIQUE, file_url TEXT, created_at TEXT NOT NULL);
    CREATE TABLE submissions (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, student_name TEXT NOT NULL, student_class TEXT NOT NULL, student_note TEXT NOT NULL DEFAULT '', file_url TEXT NOT NULL, created_at TEXT NOT NULL, class_id TEXT);
    INSERT INTO teachers VALUES ('t','a@b.test','x','2026-01-01');
    INSERT INTO tasks VALUES ('k','t','T','S','','2030-01-01','audio','123456',NULL,'2026-01-01');
    INSERT INTO submissions VALUES ('1','k','Budi','IX','','/files/old.mp3','2026-10-01T00:00:00.000Z',NULL), ('2','k','budi ','ix','','/files/new.mp3','2026-10-02T00:00:00.000Z',NULL);`);
  legacy.close();
  process.env.NODE_ENV = 'test';
  process.env.DATA_DIR = dir;
  const { db } = await import('../server.mjs');
  try {
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name='submission_identity'").get());
    assert.deepEqual(db.prepare('SELECT id FROM submissions').all().map(row => row.id), ['2']);
    assert.equal(existsSync(join(dir, 'files', 'old.mp3')), false);
    assert.equal(existsSync(join(dir, 'files', 'new.mp3')), true);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});
