import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

test('migration links legacy submissions to their class and prevents duplicates without removing data', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE classes(id TEXT PRIMARY KEY,name TEXT);
      CREATE TABLE task_classes(task_id TEXT,class_id TEXT);
      CREATE TABLE submissions(id TEXT PRIMARY KEY,task_id TEXT,student_name TEXT,student_class TEXT,file_url TEXT);
      INSERT INTO classes VALUES('class','Kelas Lama'); INSERT INTO task_classes VALUES('task','class');
      INSERT INTO submissions VALUES('sub','task','Siswa','Kelas Lama','kept.mp3');`);
    db.exec(readFileSync(new URL('../migrations/001-submission-identity.sql', import.meta.url), 'utf8'));
    assert.equal(db.prepare('SELECT class_id FROM submissions').get().class_id, 'class');
    assert.equal(db.prepare('SELECT file_url FROM submissions').get().file_url, 'kept.mp3');
    assert.throws(() => db.prepare('INSERT INTO submissions VALUES(?,?,?,?,?,?)').run('duplicate','task','SISWA','Kelas Baru','new.mp3','class'), /UNIQUE/);
    db.exec("UPDATE classes SET name='Kelas Baru';");
    assert.equal(db.prepare('SELECT class_id FROM submissions').get().class_id, 'class');
  } finally { db.close(); }
});
