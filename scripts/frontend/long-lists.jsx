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
  const [open, setOpen] = Ye.useState(false);
  if (note.length <= NOTE_PREVIEW_CHARS) return <div className="submission-note">{note}</div>;
  return <div className="submission-note">
    <span className={open ? 'submission-note-text' : undefined}>{open ? note : `${note.slice(0, NOTE_PREVIEW_CHARS).trimEnd()}…`}</span>{' '}
    <button type="button" className="note-toggle" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? 'sembunyikan catatan' : 'lihat catatan'}</button>
  </div>;
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

// Pengganti tiga section Tepat Waktu/Terlambat/Belum dari bundle asal: satu tabel dengan kolom status dan filter.
const STATUS_ORDER = ['ontime', 'late', 'missing'];
const WIB_DATE = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit' });
const WIB_TIME = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false });

// Waktu kiriman. Desktop: tanggal lengkap (status di kolom sendiri). Mobile: 21/10 di atas 22.00 (WIB) dengan status di bawahnya.
function SubmissionTime({ time, status }) {
  const date = time && new Date(time);
  return <>
    <span className="time-full">{date ? wf(time) : <span className="muted">—</span>}</span>
    <div className="time-compact">
      {date && <span className="time-short mono" title={wf(time)}>
        <span>{WIB_DATE.format(date)}</span>
        <span>{WIB_TIME.format(date).replace(':', '.')}</span>
      </span>}
      <StatusChip status={status} />
    </div>
  </>;
}

function SubmissionTable({ onTime, late, missing, hasRoster, downloadIndex, onView, onDownload }) {
  const [status, setStatus] = Ye.useState('all');
  const groups = Ye.useMemo(() => new Map(downloadIndex.map(entry => [entry.sub.id, entry.group])), [downloadIndex]);
  const byStatus = Ye.useMemo(() => {
    const submitted = sub => ({ key: sub.id, name: sub.student_name, className: sub.student_class, note: sub.student_note, time: sub.created_at, sub });
    return {
      ontime: onTime.map(sub => ({ ...submitted(sub), status: 'ontime' })),
      late: late.map(sub => ({ ...submitted(sub), status: 'late' })),
      missing: missing.map(row => ({ key: `missing-${row.className}-${row.name}`, name: row.name, className: row.className, status: 'missing' })),
    };
  }, [onTime, late, missing]);
  const rows = Ye.useMemo(() => {
    if (status !== 'all') return byStatus[status];
    const sent = [...byStatus.ontime, ...byStatus.late].sort((a, b) => new Date(b.time) - new Date(a.time));
    return [...sent, ...byStatus.missing];
  }, [byStatus, status]);
  const list = useListWindow(rows, row => [row.name, row.className]);
  const filters = [['all', 'Semua', byStatus.ontime.length + byStatus.late.length + byStatus.missing.length], ...STATUS_ORDER
    .filter(key => key !== 'missing' || hasRoster)
    .map(key => [key, STATUS_META[key].label, byStatus[key].length])];
  const emptyText = status === 'missing' && !hasRoster ? 'Tugas tanpa target kelas' : '—';
  return <>
    <div className="class-filter-bar status-filter" role="group" aria-label="Filter status">
      {filters.map(([key, label, count]) => <button type="button" key={key} className={`class-filter-btn${status === key ? ' active' : ''}`} aria-pressed={status === key} onClick={() => setStatus(key)}>
        {label} <span className="status-filter-count mono">{count}</span>
      </button>)}
    </div>
    <ListSearch list={list} label="Cari siswa" placeholder="Cari nama atau kelas" />
    <div className="card" style={{ padding: 0 }}><div className="table-container"><table className="submission-table">
      <thead><tr><th className="col-name">Nama</th><th className="col-class">Kelas</th><th className="col-status">Status</th><th className="col-time">Waktu</th><th className="col-actions">Aksi</th></tr></thead>
      <tbody>{list.shown.length > 0 ? list.shown.map(row => {
        const group = row.sub && groups.get(row.sub.id);
        return <tr key={row.key}>
          <td><div className="cell-clamp" title={row.name}>{row.name}</div>{row.note && <SubmissionNote note={row.note} />}</td>
          <td><div className="cell-clamp" title={row.className}>{row.className}</div></td>
          <td className="col-status"><StatusChip status={row.status} /></td>
          <td className="mono-cell"><SubmissionTime time={row.time} status={row.status} /></td>
          <td>{group ? <div className="row-actions">
            <button type="button" className="row-action" onClick={() => onView(group)} aria-label={`Lihat kiriman ${row.name}`}><Icon name="eye" size={16} />Lihat</button>
            <button type="button" className="row-action row-action-primary" onClick={() => onDownload(group)} aria-label={`Unduh kiriman ${row.name}`}><Icon name="download" size={16} />Unduh</button>
          </div> : <span className="muted">—</span>}</td>
        </tr>;
      }) : <tr><td colSpan={5} className="text-center table-empty-cell">{emptyText}</td></tr>}</tbody>
    </table></div></div>
    <ListMore list={list} />
  </>;
}
