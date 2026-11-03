// Beranda, kerangka halaman guru, toast, dialog, dan potongan detail tugas versi redesign.
// Fungsi Ny, Ay, Jg, $v, dan e3 menggantikan fungsi bernama sama di bundle asal (lihat build-frontend.mjs).
const ADMIN_WHATSAPP_URL = 'https://wa.me/6281364254694?text=Halo%20admin%2C%20saya%20ingin%20membuat%20akun.';

function CodeInput({ value, onChange, invalid, describedBy }) {
  const [focused, setFocused] = Ye.useState(false);
  const digits = value.split('');
  const full = value.length === 6;
  return <div className="code-cells">
    {[0, 1, 2, 3, 4, 5].map(index => {
      const active = focused && !full && index === value.length;
      const state = invalid ? ' error' : active ? ' active' : full && focused ? ' active' : digits[index] ? ' filled' : '';
      return <div key={index} className={`code-cell mono${state}`} aria-hidden="true">{digits[index] || ''}</div>;
    })}
    <input id="taskCode" className="code-input" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
      pattern="[0-9]{6}" value={value} aria-invalid={invalid || undefined} aria-describedby={describedBy}
      onChange={event => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
  </div>;
}

function Ny() {
  const navigate = r0();
  const [code, setCode] = Ye.useState('');
  const [codeError, setCodeError] = Ye.useState('');
  const [email, setEmail] = Ye.useState('');
  const [password, setPassword] = Ye.useState('');
  const [loginError, setLoginError] = Ye.useState('');
  const [teacherOpen, setTeacherOpen] = Ye.useState(false);
  const [busy, setBusy] = Ye.useState('');
  const emailRef = Ye.useRef(null), studentPanelRef = Ye.useRef(null), teacherPanelRef = Ye.useRef(null);
  Ye.useEffect(() => {
    if (studentPanelRef.current) studentPanelRef.current.inert = teacherOpen;
    if (teacherPanelRef.current) teacherPanelRef.current.inert = !teacherOpen;
  }, [teacherOpen]);
  const firstRender = Ye.useRef(true);
  Ye.useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    const target = teacherOpen ? emailRef.current : document.getElementById('taskCode');
    const timer = setTimeout(() => target?.focus({ preventScroll: true }), 120);
    return () => clearTimeout(timer);
  }, [teacherOpen]);
  Ye.useEffect(() => {
    K0() && Ma('/api/auth/check', { skipSessionReset: true }).then(() => Hu(true)).catch(() => { W0(); });
  }, []);
  async function findTask(event) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setCodeError('Masukkan kode 6 digit yang valid.');
      return;
    }
    setBusy('code');
    setCodeError('');
    try {
      const response = await fetch(`${tc}/api/tasks/code/${code}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.task) {
        setCodeError('Kode tugas tidak ditemukan. Periksa lagi kode dari guru Anda.');
        return;
      }
      navigate(`/kumpul?code=${code}`);
    } catch {
      setCodeError('Gagal menghubungi server. Periksa koneksi, lalu coba lagi.');
    } finally {
      setBusy('');
    }
  }
  async function login(event) {
    event.preventDefault();
    if (!email.trim() || !password) {
      setLoginError('Email dan password wajib diisi.');
      return;
    }
    setBusy('login');
    setLoginError('');
    try {
      const data = await Ma('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: email.trim(), password }) });
      Zg(data.token);
      localStorage.setItem('teacher_id', data.teacher_id);
      qg(email.trim(), password);
      Hu(true);
      _f();
      vf();
      navigate('/dashboard');
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Login gagal.');
    } finally {
      setBusy('');
    }
  }
  const codeReady = code.length === 6;
  return <main className="home">
    <div className="home-brand"><BrandMark size={30} /><span>Kumpulin</span></div>
    <h1 className="home-title">Kumpulkan tugas dengan mudah</h1>
    <div className={`home-stage${teacherOpen ? ' is-teacher' : ''}`}>
      <form className="panel home-panel home-panel-student" onSubmit={findTask} noValidate ref={studentPanelRef} aria-hidden={teacherOpen || undefined}>
        <div className="panel-head">
          <h2>Kumpulkan Tugas</h2>
          <p>Masukkan kode 6 digit dari guru Anda.</p>
        </div>
        <div className="field">
          <label htmlFor="taskCode">Kode tugas</label>
          <CodeInput value={code} onChange={value => { setCode(value); setCodeError(''); }} invalid={!!codeError} describedBy={codeError ? 'taskCodeError' : undefined} />
          {codeError && <p id="taskCodeError" className="field-error" role="alert"><Icon name="warning" size={16} />{codeError}</p>}
        </div>
        <button type="submit" className={`btn btn-lg${codeReady ? '' : ' btn-quiet'}`} disabled={busy === 'code'}>
          {busy === 'code' ? <><span className="spinner" aria-hidden="true" />Mencari...</> : <>Lanjut<Icon name="forward" size={18} strokeWidth={2} /></>}
        </button>
      </form>
      <form className="panel home-panel home-panel-teacher" onSubmit={login} noValidate ref={teacherPanelRef} aria-hidden={!teacherOpen || undefined}>
        <div className="panel-head panel-head-row">
          <div className="panel-head">
            <h2>Login Guru</h2>
            <p>Masuk untuk mengelola tugas dan kelas.</p>
          </div>
          <button type="button" className="icon-btn" aria-label="Tutup login guru" onClick={() => setTeacherOpen(false)}><Icon name="close" /></button>
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input ref={emailRef} id="email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="guru@sekolah.sch.id" aria-invalid={!!loginError || undefined} required />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Masukkan password" aria-invalid={!!loginError || undefined} aria-describedby={loginError ? 'loginError' : undefined} required />
          {loginError && <p id="loginError" className="field-error" role="alert"><Icon name="warning" size={16} />{loginError}</p>}
        </div>
        <button type="submit" className="btn btn-lg" disabled={busy === 'login'}>
          {busy === 'login' ? <><span className="spinner" aria-hidden="true" />Memproses...</> : 'Masuk'}
        </button>
        <p className="home-contact">Belum memiliki akun? <a href={ADMIN_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">Hubungi admin via WhatsApp</a></p>
      </form>
    </div>
    <div className="home-spacer" />
    <div className="home-teacher">
      <button type="button" className="link-btn" aria-expanded={teacherOpen} onClick={() => setTeacherOpen(!teacherOpen)}>
        {teacherOpen ? <><Icon name="back" size={16} strokeWidth={2} />Saya siswa · Kumpulkan tugas</> : <>Saya guru · Masuk<Icon name="forward" size={16} strokeWidth={2} /></>}
      </button>
    </div>
  </main>;
}

function Ay() {
  const { pathname } = Ti();
  const NavLink = y2;
  const isDashboard = pathname === '/dashboard', isClasses = pathname === '/kelas', isDetail = pathname.startsWith('/detail/');
  const detailId = isDetail ? pathname.split('/')[2] : '';
  const [menuOpen, setMenuOpen] = Ye.useState(false);
  Ye.useEffect(() => { _f(); }, []);
  Ye.useEffect(() => { setMenuOpen(false); }, [pathname]);
  Ye.useEffect(() => {
    if (!menuOpen) return;
    const onKey = event => { if (event.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);
  const tasksActive = isDashboard || isDetail;
  return <div className="app-layout">
    <header className="teacher-topbar">
      <button type="button" className="icon-btn" aria-label="Buka menu" aria-expanded={menuOpen} aria-controls="teacherSidebar" onClick={() => setMenuOpen(true)}><Icon name="menu" size={22} /></button>
      <span className="topbar-brand"><BrandMark size={24} />Kumpulin</span>
    </header>
    <div className={`sidebar-backdrop${menuOpen ? ' visible' : ''}`} onClick={() => setMenuOpen(false)} aria-hidden="true" />
    <aside className={`sidebar${menuOpen ? ' open' : ''}`} id="teacherSidebar">
      <div className="sidebar-brand">
        <BrandMark size={28} />
        <span className="sidebar-title">Kumpulin</span>
        <button type="button" className="icon-btn sidebar-close" aria-label="Tutup menu" onClick={() => setMenuOpen(false)}><Icon name="close" /></button>
      </div>
      <nav className="sidebar-nav" aria-label="Menu guru">
        <NavLink to="/dashboard" viewTransition className={`sidebar-link${tasksActive ? ' active' : ''}`} aria-current={tasksActive ? 'page' : undefined} onMouseEnter={vf} onFocus={vf}><Icon name="list" />Daftar Tugas</NavLink>
        <NavLink to="/kelas" viewTransition className={`sidebar-link${isClasses ? ' active' : ''}`} onMouseEnter={S2} onFocus={S2}><Icon name="users" />Kelas</NavLink>
      </nav>
      <div className="sidebar-footer">
        <a href={Yg()} target="_blank" rel="noopener noreferrer" className="sidebar-link"><Icon name="chat" />Hubungi Admin</a>
        <button type="button" className="sidebar-link sidebar-logout" onClick={() => { W0(); Xv(); Gv(); window.location.href = '/'; }}><Icon name="logout" />Keluar</button>
      </div>
    </aside>
    <main className="main-content">
      <div className="container">
        <div className="teacher-page-stack">
          <div className="teacher-page-layer" hidden={!isDashboard} aria-hidden={!isDashboard}><Z6 /></div>
          <div className="teacher-page-layer" hidden={!isClasses} aria-hidden={!isClasses}><$g /></div>
          {isDetail && detailId && <div className="teacher-page-layer teacher-page-layer-detail"><Sy key={detailId} /></div>}
        </div>
      </div>
    </main>
  </div>;
}

function Jg({ children }) {
  const [toasts, setToasts] = Ye.useState([]);
  const showToast = Ye.useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(list => [...list, { id, message, type }]);
    setTimeout(() => setToasts(list => list.filter(toast => toast.id !== id)), type === 'error' ? 5000 : 3000);
  }, []);
  return <Wv.Provider value={{ showToast }}>
    {children}
    <div id="toast-container" role="status" aria-live="polite">
      {toasts.map(toast => <div key={toast.id} className={`toast show ${toast.type}`}>
        <Icon name={toast.type === 'success' ? 'check' : toast.type === 'error' ? 'warning' : 'info'} size={18} strokeWidth={2} />
        <span>{toast.message}</span>
      </div>)}
    </div>
  </Wv.Provider>;
}

function $v({ open, title, message, onConfirm, onCancel }) {
  if (!open) return null;
  const danger = /hapus/i.test(title);
  return <div className="modal active" onClick={event => { if (event.target === event.currentTarget) onCancel(); }}>
    <div className="modal-content dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirmTitle" aria-describedby="confirmMessage">
      <h2 id="confirmTitle">{title}?</h2>
      <p id="confirmMessage">{message}</p>
      <div className="dialog-actions">
        <button type="button" className="btn btn-outline btn-inline" onClick={onCancel} autoFocus>Batal</button>
        <button type="button" className={`btn btn-inline${danger ? ' btn-danger' : ''}`} onClick={onConfirm}>{title}</button>
      </div>
    </div>
  </div>;
}

function e3({ open, text }) {
  if (!open) return null;
  return <div className="modal active busy-overlay" role="status" aria-live="polite">
    <div className="busy-card">
      <span className="spinner spinner-lg" aria-hidden="true" />
      <div><h2>Memproses...</h2><p>{text}</p></div>
    </div>
  </div>;
}

function taskIsPastDeadline(task) {
  const time = new Date(task.deadline).getTime();
  return Number.isFinite(time) && Date.now() > time;
}

function TaskRowContent({ task }) {
  const type = TYPE_META[task.submission_type] || TYPE_META.image;
  return <>
    <div className="task-info">
      <h3 title={task.title}>{task.title}</h3>
      <p className="task-meta">
        <span className="task-meta-subject">{task.subject}</span>
        <span aria-hidden="true">·</span>
        <span>{type.label}</span>
        <span aria-hidden="true">·</span>
        <span>{wf(task.deadline)}</span>
        {taskIsPastDeadline(task) && <StatusChip status="past" />}
      </p>
    </div>
    <span className="task-code mono"><span className="visually-hidden">Kode </span>{task.task_code}</span>
    <Icon name="chevronRight" size={18} className="task-chevron" />
  </>;
}

function TaskSummary({ task, link, onCopy, onQr }) {
  const type = TYPE_META[task.submission_type] || TYPE_META.image;
  const fileUrl = task.file_url && $u(task.file_url);
  return <section className="card task-summary" aria-labelledby="taskSummaryTitle">
    <span className="eyebrow">{task.subject}</span>
    <h1 id="taskSummaryTitle">{task.title}</h1>
    <div className="code-panel">
      <div className="code-panel-value">
        <span className="meta-label">Kode Tugas</span>
        <span className="task-code-lg mono">{task.task_code}</span>
      </div>
      <div className="code-panel-actions">
        <button type="button" className="btn btn-inline" onClick={onCopy}><Icon name="copy" size={18} />Salin link</button>
        <button type="button" className="btn btn-outline btn-inline" onClick={onQr}><Icon name="qr" size={18} />QR</button>
      </div>
    </div>
    <div className="field">
      <label htmlFor="studentLink">Link untuk siswa</label>
      <input id="studentLink" type="text" readOnly value={link} onFocus={event => event.target.select()} />
    </div>
    <dl className="meta-list">
      <div><dt>Jenis kiriman</dt><dd><span className="type-badge"><Icon name={type.icon} size={14} strokeWidth={2} />{type.label}</span></dd></div>
      <div><dt>Deadline</dt><dd><span>{wf(task.deadline)}</span>{taskIsPastDeadline(task) && <StatusChip status="past" />}</dd></div>
      <div><dt>Dibuat</dt><dd>{wf(task.created_at)}</dd></div>
      <div><dt>Target kelas</dt><dd className="chip-row">{task.classes && task.classes.length
        ? task.classes.map(klass => <span key={klass.id} className="type-badge" title={klass.name}>{klass.name}</span>)
        : <span className="muted">Semua kelas (input bebas)</span>}</dd></div>
    </dl>
    {task.description && <p className="task-description">{task.description}</p>}
    {fileUrl && <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="attachment-row">
      <Icon name="file" size={22} />
      <span className="attachment-text"><span>Unduh file soal</span><span className="meta">Lampiran soal</span></span>
      <Icon name="download" size={20} />
    </a>}
  </section>;
}

function SubmissionStats({ total, onTime, late, missing }) {
  const roster = missing == null ? 0 : total + missing;
  const percent = value => roster ? `${Math.min(100, value / roster * 100)}%` : '0%';
  return <div className="stats-panel">
    <div className="stat"><span className="stat-label">Total</span><span className="stat-value mono">{total}</span></div>
    <div className="stat stat-ontime"><span className="stat-label">Tepat Waktu</span><span className="stat-value mono">{onTime}</span></div>
    <div className="stat stat-late"><span className="stat-label">Terlambat</span><span className="stat-value mono">{late}</span></div>
    <div className="stat stat-missing"><span className="stat-label">Belum</span><span className="stat-value mono">{missing == null ? '—' : missing}</span></div>
    {roster > 0 && <div className="stats-progress">
      <div className="stats-bar" aria-hidden="true"><span className="bar-ontime" style={{ width: percent(onTime) }} /><span className="bar-late" style={{ width: percent(late) }} /></div>
      <span>{total} dari {roster} siswa sudah mengumpulkan</span>
    </div>}
  </div>;
}

async function copyStudentLink(link, showToast) {
  try {
    await navigator.clipboard.writeText(link);
    showToast('Link disalin.', 'success');
  } catch {
    showToast('Link tidak dapat disalin otomatis. Salin dari kotak link.', 'error');
  }
}
