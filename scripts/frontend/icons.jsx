// Ikon garis 24 px (stroke 1.75) dan logo Kumpulin dari design system "Redesign Kumpulin".
// Disisipkan ke entry oleh scripts/build-frontend.mjs dan diekspor ke chunk SubmitPage.
const ICON_PATHS = {
  camera: 'M3 8h3.5l1.5-2.5h8L17.5 8H21v11H3zM12 10a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7',
  video: 'M3 6.5h12v11H3zM15 10.5l6-3.5v10l-6-3.5',
  mic: 'M9 6a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0zM5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.5 21h7',
  micOff: 'M9 6a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0zM5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.5 21h7M3 3l18 18',
  upload: 'M12 15V4M7.5 8.5L12 4l4.5 4.5M4 15v5h16v-5',
  download: 'M12 4v11M7.5 10.5L12 15l4.5-4.5M4 15v5h16v-5',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M19 12H5M11 6l-6 6 6 6',
  forward: 'M5 12h14M13 6l6 6-6 6',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14M16 16l4.5 4.5',
  warning: 'M12 3.5L2.5 20h19zM12 10v4.5M12 17.2v.3',
  clock: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7.5V12l3 2',
  note: 'M5 3h10l4 4v14H5zM15 3v4h4M8.5 12h7M8.5 16h5',
  file: 'M6 3h8l5 5v13H6zM14 3v5h5',
  users: 'M9 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 1 0 0 7M2.5 20c.5-3.5 3.2-5.5 6.5-5.5s6 2 6.5 5.5M16 4.3a3.3 3.3 0 0 1 0 6.4M18 14.8c2 .7 3.2 2.5 3.5 5.2',
  logout: 'M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10',
  chat: 'M4 5h16v11H9l-5 4zM8 9.5h8M8 12.5h5',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  phone: 'M7 2.5h10v19H7zM11 18.5h2',
  play: 'M8 5v14l11-7z',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  menu: 'M4 7h16M4 12h16M4 17h16',
  chevronDown: 'M6 9l6 6 6-6',
  chevronRight: 'M9 6l6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6',
  info: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 11v5M12 7.6v.4',
  linkOff: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1M4 4l16 16',
  wifiOff: 'M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0M12 19h.01M3 3l18 18',
  pending: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18',
};

function Icon({ name, size = 20, strokeWidth = 1.75, className, style, label }) {
  const labelled = !!label;
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
    strokeLinecap="round" strokeLinejoin="round" className={className ? `icon ${className}` : 'icon'} style={style}
    aria-hidden={labelled ? undefined : 'true'} role={labelled ? 'img' : undefined} aria-label={label} focusable="false">
    <path d={ICON_PATHS[name] || ''} strokeDasharray={name === 'pending' ? '3 3' : undefined} />
  </svg>;
}

function BrandMark({ size = 28 }) {
  return <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false" className="brand-mark">
    <path d="M5 27C5 14 13.5 5.5 27 5c.5 13.5-8 22-22 22z" fill="var(--primary-strong)" />
    <path d="M5 27L19 13M12 20h5.5M12 20v-5" fill="none" stroke="var(--bg)" strokeWidth="2" strokeLinecap="round" />
  </svg>;
}

const TYPE_META = {
  image: { icon: 'camera', label: 'Foto', noun: 'foto' },
  video: { icon: 'video', label: 'Video', noun: 'video' },
  audio: { icon: 'mic', label: 'Audio', noun: 'audio' },
};

const STATUS_META = {
  ontime: { icon: 'check', label: 'Tepat Waktu' },
  late: { icon: 'clock', label: 'Terlambat' },
  missing: { icon: 'pending', label: 'Belum' },
  past: { icon: null, label: 'Lewat deadline' },
};

function StatusChip({ status, children }) {
  const meta = STATUS_META[status];
  return <span className={`chip chip-${status}`}>
    {meta.icon && <Icon name={meta.icon} size={14} strokeWidth={2.25} />}
    {children ?? meta.label}
  </span>;
}

function TypeLabel({ type }) {
  const meta = TYPE_META[type] || TYPE_META.image;
  return <><Icon name={meta.icon} size={18} />{meta.label}</>;
}

function EmptyState({ icon, text, action }) {
  return <div className="empty-panel">
    <span className="icon-tile"><Icon name={icon} size={24} /></span>
    <p>{text}</p>
    {action}
  </div>;
}
