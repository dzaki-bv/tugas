import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { transform, build } from 'esbuild';

const root = new URL('../', import.meta.url);
const hash = text => createHash('sha256').update(text).digest('hex').slice(0, 8);
const read = path => readFile(new URL(path, root), 'utf8');
const write = (path, text) => writeFile(new URL(path, root), text);
function replaceOnce(text, before, after) {
  if (text.split(before).length !== 2) throw new Error(`Expected one match: ${before.slice(0, 80)}`);
  return text.replace(before, after);
}
function replaceFunction(text, name, replacement) {
  const marker = new RegExp(`(?:async )?function ${name}\\(`);
  const start = text.search(marker);
  if (start < 0) throw new Error(`Missing function ${name}`);
  const offset = text.slice(start + 10).search(/\n(?:async )?function /);
  if (offset < 0) throw new Error(`Missing boundary after ${name}`);
  return text.slice(0, start) + replacement + '\n' + text.slice(start + 10 + offset);
}
const helper = await read('public/assets/app-logic.mjs');
const helperName = `app-logic-${hash(helper)}.mjs`;
await write(`public/assets/${helperName}`, helper);
let entry = (await transform(await read('public/assets/index-e6e3f046.js'), { minify: false })).code;
let chunk = (await transform(await read('public/assets/SubmitPage-B4ZWda05.js'), { minify: false })).code;
entry = `import { isLate as taskIsLate, addSubmissionFiles as archiveSubmissionFiles, filterSubmissions as F3, missingStudents as wy } from './${helperName}';\n` + entry;
chunk = `import { createStudentLoader as studentListLoader, deadlineTimestamp as taskDeadlineTimestamp } from './${helperName}';\n` + chunk;
const editor = (await transform(await read('scripts/frontend/task-editor.jsx'), { loader: 'jsx', jsxFactory: 'pe.createElement', jsxFragment: 'pe.Fragment' })).code.replaceAll('pe.createElement', 'Ye.createElement');
entry += '\n' + editor;
entry = replaceOnce(entry, 'function Sy() {', `function Sy() {
  const [editingTask, setEditingTask] = Ye.useState(false);
  const [savedTask, setSavedTask] = Ye.useState(null);`);
entry = replaceOnce(entry, 'f = (o == null ? void 0 : o.task) ?? null', 'f = savedTask ?? (o == null ? void 0 : o.task) ?? null');
entry = replaceOnce(entry, 'justifyContent: "flex-end" }, children: pe.jsx("button", { type: "button", className: "btn btn-danger btn-inline"', 'justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }, children: [pe.jsx("button", { type: "button", className: "btn btn-inline", "aria-expanded": editingTask, onClick: () => setEditingTask(!editingTask), children: "Edit Tugas" }), pe.jsx("button", { type: "button", className: "btn btn-danger btn-inline"');
entry = replaceOnce(entry, 'children: "Hapus" }) }), pe.jsxs("div", { className: "card", children: [pe.jsx("h1", { children: f.title })', 'children: "Hapus" })] }), editingTask && pe.jsx(TaskEditor, { task: f, onClose: () => setEditingTask(false), onSaved: updated => { setSavedTask(updated); Ur(Na.task(updated.id)); Ur(Na.dashboard); t("Tugas berhasil diperbarui.", "success"); } }), pe.jsxs("div", { className: "card", children: [pe.jsx("h1", { children: f.title })');
entry += '\n' + await read('scripts/frontend/dashboard-storage.mjs');
entry = replaceFunction(entry, 'Zv', `async function Zv() {
  const [tasks, classes] = await Promise.all([Ma('/api/tasks'), Ma('/api/classes')]);
  return { tasks: tasks.tasks || [], classes: classes.classes || [] };
}`);
entry = replaceOnce(entry, 'f = (s == null ? void 0 : s.storage) ?? null', 'f = useDashboardStorage(s, r)');
entry = replaceFunction(entry, 'wf', `function wf(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '\u2014' : date.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
}`);
entry = replaceFunction(entry, 'B3', `async function B3(archive, submission, type) {
  return archiveSubmissionFiles({ archive, urls: ad(submission.file_url), name: submission.student_name, download: url => rd(url, type) });
}`);
entry = replaceFunction(entry, 'F3', '');
entry = replaceFunction(entry, 'wy', '');
entry = replaceFunction(entry, 'yy', `function yy(submissions, deadline) {
  const submitted = [], late = [];
  for (const submission of submissions) (taskIsLate(submission, deadline) ? late : submitted).push(submission);
  return { submitted, late };
}`);
entry = replaceOnce(entry, 'new Date(p.created_at).getTime() > t', 'taskIsLate(p, t)');
const uploadStart = entry.indexOf('async function Ry(');
const uploadEnd = entry.indexOf('\nconst Na ', uploadStart);
if (uploadStart < 0 || uploadEnd < 0) throw new Error('Upload handler boundary missing');
entry = entry.slice(0, uploadStart) + await read('scripts/frontend/submission-upload.mjs') + entry.slice(uploadEnd);
const bulkStart = entry.indexOf('async function X6(');
const bulkEnd = entry.indexOf('\nfunction Z6(', bulkStart);
const bulk = replaceOnce(entry.slice(bulkStart, bulkEnd), '} catch {\n      continue;\n    }', '} catch {\n      throw new Error(`Gagal memuat kiriman tugas ${u.title}. ZIP belum dibuat. Coba lagi.`);\n    }');
entry = entry.slice(0, bulkStart) + bulk + entry.slice(bulkEnd);
const callbackStart = chunk.indexOf('  const ee = t.useCallback');
const callbackEnd = chunk.indexOf('  function te(', callbackStart);
if (callbackStart < 0 || callbackEnd < 0) throw new Error('Student loader boundary missing');
chunk = chunk.slice(0, callbackStart) + `  const ee = t.useMemo(() => studentListLoader({
    begin: () => { V(true); E(false); F([]); S(''); },
    load: async classId => {
      const response = await fetch(oe + '/api/tasks/code/' + l + '/classes/' + classId + '/students');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Gagal memuat siswa');
      return (data.students || []).map(student => student.name);
    },
    success: F,
    failure: () => { E(true); F([]); },
    end: () => V(false),
  }), [l]);
  t.useEffect(() => () => ee.cancel(), [ee]);
  t.useEffect(() => {
    N(''); F([]); S('');
    if ($.length === 1) { N($[0].name); ee($[0].id); }
  }, [$, ee]);
` + chunk.slice(callbackEnd);
chunk = replaceOnce(chunk, 'x ? ee(x) : (F([]), S(""))', 'ee(x || null)');
chunk = replaceOnce(chunk, 'e.jsxs("select", { id: "studentClass"', '$.length === 1 ? e.jsx("p", { id: "studentClass", children: $[0].name }) : e.jsxs("select", { id: "studentClass"');
chunk = replaceOnce(chunk, 'r.append("student_class", w.trim()),', 'r.append("student_class", w.trim()), r.append("class_id", $.find(klass => klass.name === w)?.id || ""),');
chunk = replaceOnce(chunk, 'new Date(a.deadline).getTime()', 'new Date(taskDeadlineTimestamp(a.deadline)).getTime()');
chunk = replaceOnce(chunk, 'd("saving"), I("Menyimpan ke server...");', 'd("progress"), I("Mengunggah file..."), setUploadPercent(0);');
chunk = replaceOnce(chunk, 'function ze() {', 'function ze() { const [uploadPercent, setUploadPercent] = t.useState(0);');
chunk = replaceOnce(chunk, 'onRetry: (x, _) => {', 'onProgress: setUploadPercent, onSaving: () => { d("saving"); I("Menyimpan ke server..."); }, onRetry: (x, _) => { setUploadPercent(0);');
chunk = replaceOnce(chunk, 'phase: z,', 'phase: z, percent: uploadPercent,');
const chunkCode = (await transform(chunk, { minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: false, legalComments: 'none' })).code;
const chunkName = `SubmitPage-${hash(chunkCode)}.js`;
await write(`public/assets/${chunkName}`, chunkCode);
entry = replaceOnce(entry, './SubmitPage-B4ZWda05.js', './' + chunkName);
const entryCode = (await transform(entry, { minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: false, legalComments: 'none' })).code;
const entryName = `index-${hash(entryCode)}.js`;
await write(`public/assets/${entryName}`, entryCode);
const html = await read('public/index.html');
await write('public/index.html', html.replace(/src="\/assets\/index-[^"/]+\.js"/, `src="/assets/${entryName}"`));
await write('public/assets/index-Ci25O57r.js', `export * from './${entryName}';\n`);
const worker = await read('worker.mjs');
await write('worker.mjs', worker.replace(/export \* from '\.\/index-[^']+\.js';/, `export * from './${entryName}';`));
await build({ entryPoints: [new URL(`public/assets/${entryName}`, root).pathname], bundle: true, write: false, platform: 'browser', logLevel: 'error' });
console.log(JSON.stringify({ entryName, chunkName, helperName }));
