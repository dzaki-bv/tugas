// Komponen untuk data yang panjang atau banyak. Disisipkan ke bundle oleh scripts/build-frontend.mjs.
const LIST_PAGE_SIZE = 50;
const LIST_SEARCH_MIN = 10;
const NOTE_PREVIEW_CHARS = 60;
const CLASS_CHIP_MAX = 8;
// Nilai sama dengan TEXT_LIMITS di api-shared.mjs.
const TEXT_LIMITS = { title: 200, subject: 100, description: 5000, className: 100, studentName: 100, studentNote: 1000 };

function useListWindow(items, fieldsOf) {
  const [query, setQuery] = Ye.useState('');
  const [limit, setLimit] = Ye.useState(LIST_PAGE_SIZE);
  const needle = query.trim().toLocaleLowerCase('id');
  const matched = Ye.useMemo(() => needle
    ? items.filter(item => fieldsOf(item).some(value => String(value ?? '').toLocaleLowerCase('id').includes(needle)))
    : items, [items, needle]);
  Ye.useEffect(() => setLimit(LIST_PAGE_SIZE), [needle]);
  return {
    query,
    setQuery,
    total: items.length,
    matched: matched.length,
    shown: matched.slice(0, limit),
    more: () => setLimit(value => value + LIST_PAGE_SIZE),
  };
}

function ListSearch({ list, label, placeholder }) {
  const id = Ye.useId();
  if (list.total < LIST_SEARCH_MIN) return null;
  return <div className="list-search">
    <label className="visually-hidden" htmlFor={id}>{label}</label>
    <Icon name="search" size={18} className="list-search-icon" />
    <input id={id} type="search" value={list.query} onChange={event => list.setQuery(event.target.value)} placeholder={placeholder} autoComplete="off" />
    <p className="list-count" aria-live="polite">{list.query.trim() ? `${list.matched} dari ${list.total} cocok` : `${list.total} total`}</p>
  </div>;
}

function ListMore({ list }) {
  if (list.query.trim() && !list.matched) return <p className="empty-state">Tidak ada yang cocok dengan pencarian.</p>;
  const remaining = list.matched - list.shown.length;
  if (remaining <= 0) return null;
  return <button type="button" className="btn btn-outline list-more" onClick={list.more}>
    Tampilkan {Math.min(remaining, LIST_PAGE_SIZE)} lagi (sisa {remaining})
  </button>;
}

function SubmissionNote({ note }) {
  if (note.length <= NOTE_PREVIEW_CHARS) return <div className="submission-note">{note}</div>;
  return <details className="submission-note">
    <summary>{note.slice(0, NOTE_PREVIEW_CHARS).trimEnd()}… <span className="note-toggle">lihat catatan</span></summary>
    <div className="submission-note-full">{note}</div>
  </details>;
}

function ClassFilter({ classes, value, onChange }) {
  if (classes.length > CLASS_CHIP_MAX) {
    return <div className="form-group class-filter-select">
      <label htmlFor="classFilterSelect">Filter kelas</label>
      <select id="classFilterSelect" value={value} onChange={event => onChange(event.target.value)}>
        <option value="all">Semua Kelas ({classes.length})</option>
        {classes.map(klass => <option key={klass.id} value={klass.id}>{klass.name}</option>)}
      </select>
    </div>;
  }
  return <div className="class-filter-bar">
    <button type="button" className={`class-filter-btn${value === 'all' ? ' active' : ''}`} aria-pressed={value === 'all'} onClick={() => onChange('all')}>Semua Kelas</button>
    {classes.map(klass => <button type="button" key={klass.id} className={`class-filter-btn${value === klass.id ? ' active' : ''}`} aria-pressed={value === klass.id} onClick={() => onChange(klass.id)}>{klass.name}</button>)}
  </div>;
}

// Pengganti tabel Tepat Waktu/Terlambat (Av) dan Belum (xy) dari bundle asal.
function Av({ rows, downloadIndex, onView, onDownload }) {
  const list = useListWindow(rows, row => [row.student_name, row.student_class]);
  const groups = Ye.useMemo(() => new Map(downloadIndex.map(entry => [entry.sub.id, entry.group])), [downloadIndex]);
  return <>
    <ListSearch list={list} label="Cari kiriman" placeholder="Cari nama atau kelas" />
    <div className="card" style={{ padding: 0 }}><div className="table-container"><table className="submission-table">
      <thead><tr><th>Nama</th><th>Kelas</th><th>Waktu</th><th>Aksi</th></tr></thead>
      <tbody>{list.shown.length > 0 ? list.shown.map(row => {
        const group = groups.get(row.id);
        return <tr key={row.id}>
          <td><div className="cell-clamp" title={row.student_name}>{row.student_name}</div>{row.student_note && <SubmissionNote note={row.student_note} />}</td>
          <td><div className="cell-clamp" title={row.student_class}>{row.student_class}</div></td>
          <td className="mono-cell">{wf(row.created_at)}</td>
          <td>{group ? <div className="row-actions">
            <button type="button" className="btn btn-outline btn-inline btn-sm" onClick={() => onView(group)} aria-label={`Lihat kiriman ${row.student_name}`}><Icon name="eye" size={16} />Lihat</button>
            <button type="button" className="btn btn-inline btn-sm" onClick={() => onDownload(group)} aria-label={`Unduh kiriman ${row.student_name}`}><Icon name="download" size={16} />Unduh</button>
          </div> : <span className="muted">—</span>}</td>
        </tr>;
      }) : <tr><td colSpan={4} className="text-center table-empty-cell">—</td></tr>}</tbody>
    </table></div></div>
    <ListMore list={list} />
  </>;
}

function xy({ rows, hasRoster }) {
  const list = useListWindow(rows, row => [row.name, row.className]);
  return <>
    <ListSearch list={list} label="Cari siswa belum mengumpulkan" placeholder="Cari nama atau kelas" />
    <div className="card" style={{ padding: 0 }}><div className="table-container"><table>
      <thead><tr><th>Nama</th><th>Kelas</th></tr></thead>
      <tbody>{list.shown.length > 0 ? list.shown.map(row => <tr key={`${row.className}-${row.name}`}><td>{row.name}</td><td>{row.className}</td></tr>)
        : <tr><td colSpan={2} className="text-center table-empty-cell">{hasRoster ? '—' : 'Tugas tanpa target kelas'}</td></tr>}</tbody>
    </table></div></div>
    <ListMore list={list} />
  </>;
}
