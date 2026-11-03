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
  const marker = new RegExp(`(?:async )?function ${name.replace(/\$/g, '\\$')}\\(`);
  const start = text.search(marker);
  if (start < 0) throw new Error(`Missing function ${name}`);
  const offset = text.slice(start + 10).search(/\n(?:async )?function /);
  if (offset < 0) throw new Error(`Missing boundary after ${name}`);
  return text.slice(0, start) + replacement + '\n' + text.slice(start + 10 + offset);
}
function replaceBetween(text, startMarker, endMarker, replacement, includeEnd = false) {
  const start = text.indexOf(startMarker);
  if (start < 0 || text.indexOf(startMarker, start + 1) >= 0) throw new Error(`Expected one start: ${startMarker.slice(0, 80)}`);
  const end = text.indexOf(endMarker, start);
  if (end < 0) throw new Error(`Missing end: ${endMarker.slice(0, 80)}`);
  return text.slice(0, start) + replacement + text.slice(includeEnd ? end + endMarker.length : end);
}
const compileJsx = async (path, factory, fragment) => (await transform(await read(path), { loader: 'jsx', jsxFactory: factory, jsxFragment: fragment })).code;
const helper = await read('public/assets/app-logic.mjs');
const helperName = `app-logic-${hash(helper)}.mjs`;
await write(`public/assets/${helperName}`, helper);
let entry = (await transform(await read('public/assets/index-e6e3f046.js'), { minify: false })).code;
let chunk = (await transform(await read('public/assets/SubmitPage-B4ZWda05.js'), { minify: false })).code;
entry = `import { isLate as taskIsLate, addSubmissionFiles as archiveSubmissionFiles, filterSubmissions as F3, missingStudents as wy } from './${helperName}';\n` + entry;
chunk = `import { createStudentLoader as studentListLoader, deadlineTimestamp as taskDeadlineTimestamp } from './${helperName}';\n` + chunk;
const editor = (await transform(await read('scripts/frontend/task-editor.jsx'), { loader: 'jsx', jsxFactory: 'pe.createElement', jsxFragment: 'pe.Fragment' })).code.replaceAll('pe.createElement', 'Ye.createElement');
entry += '\n' + editor;
// Dasbor dan halaman Kelas: pencarian dan tampil bertahap per 50 untuk ribuan item.
entry = replaceOnce(entry, '  Ye.useEffect(() => {\n    if (r !== "/dashboard") return;', '  const taskList = useListWindow(u, task => [task.title, task.subject, task.task_code]);\n  Ye.useEffect(() => {\n    if (r !== "/dashboard") return;');
entry = replaceOnce(entry, 'pe.jsx("div", { className: "task-list", children: u.map((M) => pe.jsxs(Ju, {', 'pe.jsxs(pe.Fragment, { children: [pe.jsx(ListSearch, { list: taskList, label: "Cari tugas", placeholder: "Cari judul, mata pelajaran, atau kode" }), pe.jsx("div", { className: "task-list", children: taskList.shown.map((M) => pe.jsxs(Ju, {');
entry = replaceOnce(entry, '}, M.id)) }), h && pe.jsx("div", { className: "modal active"', '}, M.id)) }), pe.jsx(ListMore, { list: taskList })] }), h && pe.jsx("div", { className: "modal active"');
entry = replaceOnce(entry, '= K2(Na.classes, Z2), o = r ?? [],', '= K2(Na.classes, Z2), o = r ?? [], classList = useListWindow(o, klass => [klass.name]),');
entry = replaceOnce(entry, 'pe.jsx("div", { className: "task-list", children: o.map((P) => pe.jsx("div", { className: "task-item", onClick: () => V(P)', 'pe.jsxs(pe.Fragment, { children: [pe.jsx(ListSearch, { list: classList, label: "Cari kelas", placeholder: "Cari nama kelas" }), pe.jsx("div", { className: "task-list", children: classList.shown.map((P) => pe.jsx("div", { className: "task-item", onClick: () => V(P)');
entry = replaceOnce(entry, '}, P.id)) }), l && pe.jsx("div", { className: "modal active"', '}, P.id)) }), pe.jsx(ListMore, { list: classList })] }), l && pe.jsx("div", { className: "modal active"');
// Detail tugas: filter kelas ringkas, tabel pengumpulan tahan teks panjang.
entry = replaceOnce(entry, 'ie && pe.jsxs("div", { className: "class-filter-bar", children: [pe.jsx("button", { type: "button", className: `class-filter-btn${b === "all" ? " active" : ""}`, onClick: () => V("all"), children: "Semua Kelas" }), U.map((d) => pe.jsx("button", { type: "button", className: `class-filter-btn${b === d.id ? " active" : ""}`, onClick: () => V(d.id), children: d.name }, d.id))] })', 'ie && pe.jsx(ClassFilter, { classes: U, value: b, onChange: V })');
// Tabel kiriman dan tabel Belum asal dihapus; penggantinya SubmissionTable di long-lists.jsx.
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
// Redesign Kumpulin: ikon garis menggantikan emoji, komponen baru dari icons.jsx dan teacher-ui.jsx.
entry = entry.replace(/className: "close-btn", onClick: ([^\n]+?), children: "\\xD7" \}/g, (_, handler) => `className: "close-btn", "aria-label": "Tutup", onClick: ${handler}, children: pe.jsx(Icon, { name: "close" }) }`);
if (entry.includes('children: "\\xD7"')) throw new Error('Close button left unpatched');
// Dasbor.
entry = replaceOnce(entry, 'pe.jsx("div", { className: "header mt-2", children: pe.jsxs("div", { children: [pe.jsx("h1", { children: "\\u{1F33F} Daftar Tugas" }), pe.jsx("p", { children: "Kelola tugas siswa Anda." })] }) })', 'pe.jsxs("div", { className: "header mt-2", children: [pe.jsxs("div", { children: [pe.jsx("h1", { children: "Daftar Tugas" }), pe.jsx("p", { children: "Kelola tugas siswa Anda." })] }), pe.jsxs("button", { type: "button", className: "btn btn-warm btn-inline", onClick: () => p(true), children: [pe.jsx(Icon, { name: "plus", size: 18, strokeWidth: 2 }), "Buat Tugas"] })] })');
entry = replaceOnce(entry, 'pe.jsxs("div", { style: { marginBottom: 16, display: "flex", gap: 6, flexWrap: "wrap" }, children: [pe.jsx("button", { type: "button", className: "btn btn-accent btn-inline", onClick: () => p(true), children: "Buat Tugas" }), pe.jsx("button", { type: "button", className: "btn btn-outline btn-inline", onClick: w, children: "Unduh Semua" }), pe.jsx("button", { type: "button", className: "btn btn-outline btn-inline", style: { color: "var(--error)", borderColor: "var(--error)" }, onClick: d, children: "Hapus Semua" })] })', 'pe.jsxs("div", { className: "toolbar dashboard-toolbar", children: [pe.jsxs("button", { type: "button", className: "btn btn-outline btn-inline", onClick: w, disabled: !u.length, children: [pe.jsx(Icon, { name: "download", size: 18 }), "Unduh Semua"] }), pe.jsxs("button", { type: "button", className: "btn btn-danger-soft btn-inline", onClick: d, disabled: !u.length, children: [pe.jsx(Icon, { name: "trash", size: 18 }), "Hapus Semua"] })] })');
entry = replaceOnce(entry, 'pe.jsx("p", { className: "empty-state", children: "Belum ada tugas yang dibuat." })', 'pe.jsx(EmptyState, { icon: "file", text: "Belum ada tugas. Buat tugas pertama, lalu bagikan kodenya ke siswa.", action: pe.jsx("button", { type: "button", className: "btn btn-warm btn-inline", onClick: () => p(true), children: "Buat Tugas" }) })');
entry = replaceOnce(entry, 'pe.jsxs("div", { className: "task-info", children: [pe.jsx("h3", { children: M.title }), pe.jsxs("p", { children: [M.subject, " | Deadline: ", wf(M.deadline)] })] }), pe.jsx("span", { style: { fontFamily: "\'DM Mono\', monospace", fontSize: 14, letterSpacing: "0.1em" }, children: M.task_code })', 'pe.jsx(TaskRowContent, { task: M })');
entry = replaceOnce(entry, 'children: M === "image" ? "\\u{1F4F7} Gambar" : M === "video" ? "\\u{1F3A5} Video" : "\\u{1F399}\\uFE0F Audio" }', '"aria-pressed": k === M, children: pe.jsx(TypeLabel, { type: M }) }');
entry = replaceOnce(entry, 'pe.jsx("label", { children: "Deskripsi (opsional)" })', 'pe.jsxs("label", { children: ["Deskripsi ", pe.jsx("span", { className: "optional", children: "(opsional)" })] })');
entry = replaceOnce(entry, 'pe.jsx("label", { children: "Lampiran (opsional)" })', 'pe.jsxs("label", { children: ["Lampiran soal ", pe.jsx("span", { className: "optional", children: "(opsional)" })] })');
entry = replaceOnce(entry, `const re = H > 90 ? { className: "storage-warning danger", html: '\\u26A0\\uFE0F <strong>`, `const re = H > 95 ? { className: "storage-warning danger", html: '<strong>`);
entry = replaceOnce(entry, ': H > 70 ? { className: "storage-warning", html: "\\u{1F4A1} Penyimpanan', ': H > 80 ? { className: "storage-warning", html: "Penyimpanan');
entry = replaceOnce(entry, 'className: `storage-fill${H > 90 ? " danger" : H > 70 ? " warning" : ""}`', 'className: `storage-fill${H > 95 ? " danger" : H > 80 ? " warning" : ""}`');
// Kelas.
entry = replaceOnce(entry, 'pe.jsx("h1", { children: "\\u{1F33F} Kelas" })', 'pe.jsx("h1", { children: "Kelas" })');
entry = replaceOnce(entry, 'pe.jsx("button", { type: "button", className: "btn btn-accent btn-inline", onClick: () => u(true), children: "Tambah Kelas" })', 'pe.jsxs("button", { type: "button", className: "btn btn-warm btn-inline", onClick: () => u(true), children: [pe.jsx(Icon, { name: "plus", size: 18, strokeWidth: 2 }), "Tambah Kelas"] })');
entry = replaceOnce(entry, `pe.jsx("p", { className: "empty-state", children: 'Belum ada kelas. Klik "Tambah Kelas" untuk mulai.' })`, 'pe.jsx(EmptyState, { icon: "users", text: "Belum ada kelas. Buat kelas terlebih dahulu.", action: pe.jsx("button", { type: "button", className: "btn btn-inline", onClick: () => u(true), children: "Tambah Kelas" }) })');
entry = replaceOnce(entry, 'className: "task-item", onClick: () => V(P), role: "button", tabIndex: 0, children: pe.jsxs("div", { className: "task-info", children: [pe.jsx("h3", { children: P.name }), pe.jsxs("p", { children: [P.student_count, " siswa"] })] }) }', 'className: "task-item", onClick: () => V(P), onKeyDown: (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); V(P); } }, role: "button", tabIndex: 0, children: [pe.jsxs("div", { className: "task-info", children: [pe.jsx("h3", { title: P.name, children: P.name }), pe.jsxs("p", { className: "task-meta", children: [P.student_count, " siswa"] })] }), pe.jsx(Icon, { name: "chevronRight", size: 18, className: "task-chevron" })] }');
entry = replaceOnce(entry, 'className: "btn btn-outline btn-inline btn-sm", style: { color: "var(--error)" }, onClick: he, children: "Hapus kelas" }', 'className: "btn btn-danger-soft btn-inline btn-sm", onClick: he, children: [pe.jsx(Icon, { name: "trash", size: 16 }), "Hapus kelas"] }');
// Target kelas di form Buat Tugas.
entry = replaceOnce(entry, 'children: [pe.jsx("span", { className: "class-target-chip-name", children: p.name })', 'children: [y && pe.jsx(Icon, { name: "check", size: 14, strokeWidth: 2.5 }), pe.jsx("span", { className: "class-target-chip-name", title: p.name, children: p.name })');
// Detail tugas.
entry = replaceOnce(entry, 'children: [pe.jsx("button", { type: "button", className: "btn btn-inline", "aria-expanded": editingTask, onClick: () => setEditingTask(!editingTask), children: "Edit Tugas" }), pe.jsx("button", { type: "button", className: "btn btn-danger btn-inline"', 'children: [pe.jsxs(Ju, { to: "/dashboard", viewTransition: true, className: "link-back", children: [pe.jsx(Icon, { name: "back", size: 18 }), "Daftar Tugas"] }), pe.jsx("span", { style: { flex: 1 } }), pe.jsxs("button", { type: "button", className: "btn btn-outline btn-inline", "aria-expanded": editingTask, onClick: () => setEditingTask(!editingTask), children: [pe.jsx(Icon, { name: "edit", size: 18 }), "Edit Tugas"] }), pe.jsx("button", { type: "button", className: "btn btn-danger-soft btn-inline"');
entry = replaceOnce(entry, 'children: "Hapus" })] }), editingTask', 'children: [pe.jsx(Icon, { name: "trash", size: 18 }), "Hapus"] })] }), editingTask');
entry = replaceBetween(entry, 'pe.jsxs("div", { className: "card", children: [pe.jsx("h1", { children: f.title })', 'children: "QR" })] })] })] })', 'pe.jsx(TaskSummary, { task: f, link: se, onCopy: () => copyStudentLink(se, t), onQr: () => y(true) })', true);
entry = replaceOnce(entry, 'pe.jsxs("div", { className: "card mt-2", style: { padding: "14px 16px" }, children: [pe.jsx("h2", { style: { fontSize: 15, marginBottom: 12 }, children: "Info Pengumpulan" })', 'pe.jsxs("div", { className: "card mt-2 stats-card", children: [pe.jsx("h2", { children: "Info Pengumpulan" })');
entry = replaceBetween(entry, 'pe.jsxs("div", { className: "submission-stats-row", children: [', 'children: "Belum" })] })] })', 'pe.jsx(SubmissionStats, { total: Y.length, onTime: ae.length, late: he.length, missing: U.length ? P.length : null })', true);
entry = replaceOnce(entry, 'pe.jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }, className: "mt-2", children: [pe.jsx("h2", { style: { marginBottom: 0 }, children: "Pengumpulan" }), pe.jsxs("div", { style: { display: "flex", gap: 6 }, children: [pe.jsx("button", { type: "button", className: "btn btn-outline btn-inline", onClick: re, children: "Lihat Semua" }), pe.jsx("button", { type: "button", className: "btn btn-accent btn-inline", onClick: _, children: "Unduh Semua" })] })] })', 'pe.jsxs("div", { className: "section-head mt-2", children: [pe.jsx("h2", { children: "Pengumpulan" }), pe.jsxs("div", { className: "toolbar", children: [pe.jsxs("button", { type: "button", className: "btn btn-outline btn-inline", onClick: re, children: [pe.jsx(Icon, { name: "eye", size: 18 }), "Lihat Semua"] }), pe.jsxs("button", { type: "button", className: "btn btn-inline", onClick: _, children: [pe.jsx(Icon, { name: "download", size: 18 }), "Unduh Semua"] })] })] })');
// Tepat Waktu, Terlambat, dan Belum digabung menjadi satu tabel berkolom status (SubmissionTable di long-lists.jsx).
entry = replaceBetween(entry, 'pe.jsxs("div", { className: "submission-columns"', 'pe.jsx(xy, { rows: P, hasRoster: U.length > 0 })', 'pe.jsx(SubmissionTable, { onTime: ae, late: he, missing: P, hasRoster: U.length > 0, downloadIndex: L, onView: te, onDownload: W })', true);
entry = replaceOnce(entry, 'className: "link-back", children: "\\u2190 Kembali ke daftar tugas" })', 'className: "link-back", children: [pe.jsx(Icon, { name: "back", size: 18 }), "Kembali ke daftar tugas"] })');
entry = replaceOnce(entry, 'gy.toCanvas(s.current, r, { width: 360, margin: 2, color: { dark: "#3b5a30", light: "#fffef9" } })', 'gy.toCanvas(s.current, r, { width: 320, margin: 2, color: { dark: "#1c1a15", light: "#ffffff" } })');
// Beranda, kerangka guru, toast, dialog, dan overlay proses ditulis ulang.
entry = replaceBetween(entry, 'function Ny() {', '\nconst My = ', '');
for (const name of ['Ay', 'Jg', '$v', 'e3']) entry = replaceFunction(entry, name, '');
entry += '\n' + await compileJsx('scripts/frontend/icons.jsx', 'Ye.createElement', 'Ye.Fragment');
entry += '\n' + await compileJsx('scripts/frontend/teacher-ui.jsx', 'Ye.createElement', 'Ye.Fragment');
entry += '\nexport { Icon as Ic, BrandMark as Bm, StatusChip as Sc, TYPE_META as Tm };\n';
// Halaman siswa: fungsi tampilan dan logika form ditulis ulang di submit-page.jsx (redesign Kumpulin).
for (const name of ['de', 'Se', 'Re', 'Ce', 'Me', 'Te']) chunk = replaceFunction(chunk, name, '');
chunk = replaceBetween(chunk, 'function ze(', '\nexport {', '');
chunk = replaceOnce(chunk, 'p as we } from "./index-Ci25O57r.js";', 'p as we, Ic as Icon, Bm as BrandMark, Sc as StatusChip, Tm as TYPE_META } from "./index-Ci25O57r.js";');
chunk = replaceOnce(chunk, 'children: "\\u{1F3B5}" })', 'children: e.jsx(Icon, { name: "mic", size: 48 }) })');
chunk = replaceOnce(chunk, 'cursor: "pointer", zIndex: 10 }, children: "\\xD7" })', 'cursor: "pointer", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center" }, "aria-label": "Tutup", children: e.jsx(Icon, { name: "close", size: 22 }) })');
chunk = replaceOnce(chunk, '\nexport {', '\n' + await compileJsx('scripts/frontend/submit-page.jsx', 't.createElement', 't.Fragment') + '\nexport {');
const chunkCode = (await transform(chunk, { minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: false, legalComments: 'none' })).code;
const chunkName = `SubmitPage-${hash(chunkCode)}.js`;
await write(`public/assets/${chunkName}`, chunkCode);
entry = replaceOnce(entry, './SubmitPage-B4ZWda05.js', './' + chunkName);
const entryCode = (await transform(entry, { minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: false, legalComments: 'none' })).code;
const entryName = `index-${hash(entryCode)}.js`;
await write(`public/assets/${entryName}`, entryCode);
const css = await read('public/assets/index-Dv3Ww8pd.css') + '\n' + await read('scripts/frontend/overrides.css') + '\n' + await read('scripts/frontend/theme.css');
const cssName = `index-${hash(css)}.css`;
await write(`public/assets/${cssName}`, css);
const html = await read('public/index.html');
await write('public/index.html', html.replace(/src="\/assets\/index-[^"/]+\.js"/, `src="/assets/${entryName}"`).replace(/href="\/assets\/index-[^"/]+\.css"/, `href="/assets/${cssName}"`));
await write('public/assets/index-Ci25O57r.js', `export * from './${entryName}';\n`);
const worker = await read('worker.mjs');
await write('worker.mjs', worker.replace(/export \* from '\.\/index-[^']+\.js';/, `export * from './${entryName}';`));
await build({ entryPoints: [new URL(`public/assets/${entryName}`, root).pathname], bundle: true, write: false, platform: 'browser', logLevel: 'error' });
console.log(JSON.stringify({ entryName, chunkName, helperName, cssName }));
