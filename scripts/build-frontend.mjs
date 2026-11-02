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
// Nama merek: Kumpulin (sidebar guru dan halaman beranda).
entry = replaceOnce(entry, 'children: "\\u{1F33F} Sistem Tugas" }', 'children: "\\u{1F33F} Kumpulin" }');
entry = replaceOnce(entry, 'pe.jsx("h1", { children: "Sistem Tugas" })', 'pe.jsx("h1", { children: "Kumpulin" })');
// Dasbor dan halaman Kelas: pencarian dan tampil bertahap per 50 untuk ribuan item.
entry = replaceOnce(entry, '  Ye.useEffect(() => {\n    if (r !== "/dashboard") return;', '  const taskList = useListWindow(u, task => [task.title, task.subject, task.task_code]);\n  Ye.useEffect(() => {\n    if (r !== "/dashboard") return;');
entry = replaceOnce(entry, 'pe.jsx("div", { className: "task-list", children: u.map((M) => pe.jsxs(Ju, {', 'pe.jsxs(pe.Fragment, { children: [pe.jsx(ListSearch, { list: taskList, label: "Cari tugas", placeholder: "Cari judul, mata pelajaran, atau kode" }), pe.jsx("div", { className: "task-list", children: taskList.shown.map((M) => pe.jsxs(Ju, {');
entry = replaceOnce(entry, '}, M.id)) }), h && pe.jsx("div", { className: "modal active"', '}, M.id)) }), pe.jsx(ListMore, { list: taskList })] }), h && pe.jsx("div", { className: "modal active"');
entry = replaceOnce(entry, '= K2(Na.classes, Z2), o = r ?? [],', '= K2(Na.classes, Z2), o = r ?? [], classList = useListWindow(o, klass => [klass.name]),');
entry = replaceOnce(entry, 'pe.jsx("div", { className: "task-list", children: o.map((P) => pe.jsx("div", { className: "task-item", onClick: () => V(P)', 'pe.jsxs(pe.Fragment, { children: [pe.jsx(ListSearch, { list: classList, label: "Cari kelas", placeholder: "Cari nama kelas" }), pe.jsx("div", { className: "task-list", children: classList.shown.map((P) => pe.jsx("div", { className: "task-item", onClick: () => V(P)');
entry = replaceOnce(entry, '}, P.id)) }), l && pe.jsx("div", { className: "modal active"', '}, P.id)) }), pe.jsx(ListMore, { list: classList })] }), l && pe.jsx("div", { className: "modal active"');
// Detail tugas: filter kelas ringkas, tabel pengumpulan tahan teks panjang.
entry = replaceOnce(entry, 'ie && pe.jsxs("div", { className: "class-filter-bar", children: [pe.jsx("button", { type: "button", className: `class-filter-btn${b === "all" ? " active" : ""}`, onClick: () => V("all"), children: "Semua Kelas" }), U.map((d) => pe.jsx("button", { type: "button", className: `class-filter-btn${b === d.id ? " active" : ""}`, onClick: () => V(d.id), children: d.name }, d.id))] })', 'ie && pe.jsx(ClassFilter, { classes: U, value: b, onChange: V })');
// Tabel kiriman dan tabel Belum diganti versi di long-lists.jsx (pencarian, tampil bertahap, teks panjang).
entry = replaceFunction(entry, 'Av', '');
entry = replaceFunction(entry, 'xy', '');
entry += '\n' + (await transform(await read('scripts/frontend/long-lists.jsx'), { loader: 'jsx', jsxFactory: 'pe.createElement', jsxFragment: 'pe.Fragment' })).code.replaceAll('pe.createElement', 'Ye.createElement').replaceAll('pe.Fragment', 'Ye.Fragment');
// Penampil media: judul panjang dipatah dan dibatasi dua baris.
entry = replaceOnce(entry, 'pe.jsx("div", { style: { fontWeight: 600, fontSize: 14 }, children: s }), pe.jsx("button", { type: "button", className: "btn btn-outline btn-inline", style: { fontSize: 12, padding: "6px 14px" }, onClick: t, children: "Tutup" })', 'pe.jsx("div", { className: "viewer-title", title: s, style: { fontWeight: 600, fontSize: 14 }, children: s }), pe.jsx("button", { type: "button", className: "btn btn-outline btn-inline", style: { fontSize: 12, padding: "6px 14px" }, onClick: t, children: "Tutup" })');
entry = replaceOnce(entry, 'pe.jsx("div", { style: { maxWidth: 720, margin: "0 auto", padding: 20 }, children: a4.map((o, l) =>', 'pe.jsx("div", { className: "viewer-body", style: { maxWidth: 720, margin: "0 auto", padding: 20 }, children: a4.map((o, l) =>');
// Batas panjang isian sama dengan TEXT_LIMITS di api-shared.mjs.
entry = replaceOnce(entry, 'id: "taskTitleInput", value: y,', 'id: "taskTitleInput", maxLength: TEXT_LIMITS.title, value: y,');
entry = replaceOnce(entry, 'id: "taskSubjectInput", value: N,', 'id: "taskSubjectInput", maxLength: TEXT_LIMITS.subject, value: N,');
entry = replaceOnce(entry, 'pe.jsx("textarea", { value: T, onChange: (M) => x(M.target.value), rows: 3 }', 'pe.jsx("textarea", { value: T, maxLength: TEXT_LIMITS.description, onChange: (M) => x(M.target.value), rows: 3 }');
entry = replaceOnce(entry, 'id: "classNameInput", value: f,', 'id: "classNameInput", maxLength: TEXT_LIMITS.className, value: f,');
entry = replaceOnce(entry, 'id: "studentModalClassNameInput", className: "class-name-input", value: S,', 'id: "studentModalClassNameInput", className: "class-name-input", maxLength: TEXT_LIMITS.className, value: S,');
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
chunk = replaceOnce(chunk, 'id: "studentNote", rows: 2,', 'id: "studentNote", maxLength: 1000, rows: 2,');
chunk = replaceOnce(chunk, 'id: "studentClass", required: true, placeholder: "Contoh: XII IPA 1",', 'id: "studentClass", required: true, maxLength: 100, placeholder: "Contoh: XII IPA 1",');
chunk = replaceOnce(chunk, 'id: "studentName", required: true, placeholder: "Nama lengkap",', 'id: "studentName", required: true, maxLength: 100, placeholder: "Nama lengkap",');
const chunkCode = (await transform(chunk, { minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: false, legalComments: 'none' })).code;
const chunkName = `SubmitPage-${hash(chunkCode)}.js`;
await write(`public/assets/${chunkName}`, chunkCode);
entry = replaceOnce(entry, './SubmitPage-B4ZWda05.js', './' + chunkName);
const entryCode = (await transform(entry, { minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: false, legalComments: 'none' })).code;
const entryName = `index-${hash(entryCode)}.js`;
await write(`public/assets/${entryName}`, entryCode);
const css = await read('public/assets/index-Dv3Ww8pd.css') + '\n' + await read('scripts/frontend/overrides.css');
const cssName = `index-${hash(css)}.css`;
await write(`public/assets/${cssName}`, css);
const html = await read('public/index.html');
await write('public/index.html', html.replace(/src="\/assets\/index-[^"/]+\.js"/, `src="/assets/${entryName}"`).replace(/href="\/assets\/index-[^"/]+\.css"/, `href="/assets/${cssName}"`));
await write('public/assets/index-Ci25O57r.js', `export * from './${entryName}';\n`);
const worker = await read('worker.mjs');
await write('worker.mjs', worker.replace(/export \* from '\.\/index-[^']+\.js';/, `export * from './${entryName}';`));
await build({ entryPoints: [new URL(`public/assets/${entryName}`, root).pathname], bundle: true, write: false, platform: 'browser', logLevel: 'error' });
console.log(JSON.stringify({ entryName, chunkName, helperName, cssName }));
