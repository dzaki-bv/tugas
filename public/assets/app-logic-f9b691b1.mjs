const hasTimeZone = value => /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
function timestamp(value, defaultZone) {
  if (!value) return value;
  const text = String(value).trim().replace(' ', 'T');
  const date = new Date(hasTimeZone(text) ? text : text + defaultZone);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
export const utcTimestamp = value => timestamp(value, 'Z');
export const deadlineTimestamp = value => timestamp(value, '+07:00');
export const compareFileFields = (a, b) => a.localeCompare(b, 'en', { numeric: true });
export const taskDates = row => ({ ...row, created_at: utcTimestamp(row.created_at), deadline: deadlineTimestamp(row.deadline) });
export const submissionDates = row => ({ ...row, created_at: utcTimestamp(row.created_at) });
export function isLate(submission, deadline) {
  const limit = typeof deadline === 'number' ? deadline : new Date(deadlineTimestamp(deadline)).getTime();
  return new Date(utcTimestamp(submission.created_at)).getTime() > limit;
}
export function createStudentLoader({ load, begin, success, failure, end }) {
  let generation = 0;
  const loader = async classId => {
    const request = ++generation;
    begin();
    try {
      const students = classId ? await load(classId) : [];
      if (request === generation) success(students);
    } catch (error) {
      if (request === generation) failure(error);
    } finally {
      if (request === generation) end();
    }
  };
  loader.cancel = () => { generation++; };
  return loader;
}
export async function addSubmissionFiles({ archive, urls, name, download }) {
  const safe = name.replace(/[\\/:*?"<>|]/g, '_');
  for (let index = 0; index < urls.length; index++) {
    try {
      const { blob, ext } = await download(urls[index]);
      archive.file(urls.length > 1 ? `${safe}_${index + 1}${ext}` : `${safe}${ext}`, blob);
    } catch {
      throw new Error(`Gagal mengunduh berkas ${index + 1}/${urls.length} milik ${name}. ZIP belum dibuat. Coba lagi.`);
    }
  }
  return urls.length;
}
const normalized = value => value.trim().toLowerCase();
const classKey = (classId, className) => classId ? `id:${classId}` : `name:${normalized(className)}`;
export function filterSubmissions(submissions, selectedClassId, classes) {
  if (selectedClassId === 'all') return submissions;
  const selected = classes.find(klass => klass.id === selectedClassId);
  if (!selected) return submissions;
  const name = normalized(selected.name);
  return submissions.filter(sub => sub.class_id ? sub.class_id === selected.id : normalized(sub.student_class) === name);
}
export function missingStudents(rosters, submissions, selectedClassId) {
  const roster = selectedClassId === 'all' ? rosters : rosters.filter(klass => klass.classId === selectedClassId);
  const submitted = new Set(submissions.map(sub => `${classKey(sub.class_id, sub.student_class)}\n${normalized(sub.student_name)}`));
  const missing = [];
  for (const klass of roster) {
    const keys = [classKey(klass.classId), classKey(null, klass.className)];
    for (const student of klass.students) {
      const name = normalized(student.name);
      if (!keys.some(key => submitted.has(`${key}\n${name}`))) missing.push({ name: student.name, className: klass.className });
    }
  }
  return missing.sort((a, b) => a.className.localeCompare(b.className, 'id') || a.name.localeCompare(b.name, 'id'));
}
