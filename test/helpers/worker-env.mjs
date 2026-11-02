import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export async function createWorkerEnv() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE teachers(id TEXT PRIMARY KEY,email TEXT,password_hash TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE classes(id TEXT PRIMARY KEY,teacher_id TEXT REFERENCES teachers(id) ON DELETE CASCADE,name TEXT);
    CREATE TABLE students(id TEXT PRIMARY KEY,class_id TEXT REFERENCES classes(id) ON DELETE CASCADE,name TEXT);
    CREATE TABLE tasks(id TEXT PRIMARY KEY,teacher_id TEXT REFERENCES teachers(id),title TEXT,subject TEXT,description TEXT,deadline TEXT,task_code TEXT UNIQUE,submission_type TEXT,file_url TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE task_classes(task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,class_id TEXT REFERENCES classes(id) ON DELETE CASCADE,PRIMARY KEY(task_id,class_id));
    CREATE TABLE submissions(id TEXT PRIMARY KEY,task_id TEXT REFERENCES tasks(id),student_name TEXT,student_class TEXT,class_id TEXT REFERENCES classes(id) ON DELETE SET NULL,file_url TEXT,student_note TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE UNIQUE INDEX submission_identity ON submissions(task_id,lower(trim(student_name)),coalesce('id:' || class_id,'name:' || lower(trim(student_class))));`);
  sql.exec(readFileSync(new URL('../../migrations/002-file-bytes.sql', import.meta.url), 'utf8'));
  const DB = {
    prepare(text) {
      let args = [];
      const statement = {
        bind(...values) { args = values; return statement; },
        async first() { return sql.prepare(text).get(...args) || null; },
        async all() { return { results: sql.prepare(text).all(...args) }; },
        async run() { return { meta: sql.prepare(text).run(...args) }; },
        execute() {
          const prepared = sql.prepare(text);
          return prepared.columns().length ? { results: prepared.all(...args) } : { results: [], meta: prepared.run(...args) };
        },
      };
      return statement;
    },
    async batch(statements) {
      sql.exec('BEGIN');
      try { const result = statements.map(statement => statement.execute()); sql.exec('COMMIT'); return result; }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
  const objects = new Map(), metadata = new Map();
  const bucket = {
    async put(key, stream, options) { objects.set(key, await new Response(stream).arrayBuffer()); metadata.set(key, options?.httpMetadata); },
    async head(key) { return objects.has(key) ? { size: objects.get(key).byteLength } : null; },
    async delete(key) { objects.delete(key); },
    async list() { return { objects: [...objects].map(([key, bytes]) => ({ key, size: bytes.byteLength })), truncated: false }; },
  };
  const secret = 'fixture-password-hash';
  sql.prepare('INSERT INTO teachers(id,email,password_hash) VALUES(?,?,?)').run('teacher', 'fixture@example.test', secret);
  const expires = String(Date.now() + 86400000);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`teacher.${expires}`))).toString('hex');
  return { sql, objects, metadata, token: `teacher.${expires}.${signature}`, env: { DB, TASK_FILES: bucket, SUBMISSION_FILES: bucket } };
}
export function seedTask(sql, id = 'task', code = '900010') {
  sql.prepare('INSERT INTO tasks(id,teacher_id,title,subject,deadline,task_code,submission_type) VALUES(?,?,?,?,?,?,?)').run(id, 'teacher', 'Fixture', 'Uji', '2026-10-10 06:00', code, 'audio');
}
export function submissionForm({ id = 'task', code = '900010', name = 'Siswa Uji', klass = 'Bebas', classId, count = 1 } = {}) {
  const form = new FormData();
  form.set('task_id', id); form.set('task_code', code); form.set('student_name', name); form.set('student_class', klass);
  if (classId) form.set('class_id', classId);
  for (let i = 0; i < count; i++) form.set(`file_${i}`, new Blob([String(i)], { type: 'audio/mpeg' }), `part_${i}.mp3`);
  return form;
}
