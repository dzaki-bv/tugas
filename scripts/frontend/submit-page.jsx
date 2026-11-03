// Halaman pengumpulan siswa versi redesign. Menggantikan de, Se, Re, Ce, Me, Te, dan ze di chunk SubmitPage.
// Nama impor chunk: t = React, xe = tips format, se = durasi, le = validasi berkas, X = maks. berkas,
// ve = useSearchParams, be = useToast, oe = basis API, re = URL media, ye = perangkat HP, ke = unggah, we = proses berkas.
// Jangan memakai nama variabel `t` di file ini: JSX dikompilasi menjadi t.createElement.
const MediaViewer = ce;
const MEDIA_COPY = {
  image: {
    section: 'Foto Tugas', capture: 'Ambil Foto', pick: 'Pilih dari galeri', item: 'Halaman',
    accept: 'image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp',
    hint: 'JPG, PNG, atau WebP · maks. 50 MB per gambar · maks. 20 berkas. Gambar dikompres otomatis sebelum dikirim. HEIC (iPhone) belum didukung, gunakan JPG.',
  },
  video: {
    section: 'Video Tugas', capture: 'Rekam Video', pick: 'Pilih dari galeri', item: 'Video',
    accept: 'video/*,.mov,.mp4,.webm,.3gp,.avi,.mkv',
    hint: 'MP4, MOV, WebM, atau 3GP · maks. 100 MB per video · maks. 20 berkas.',
  },
  audio: {
    section: 'Rekam Audio', item: 'Audio',
    accept: 'audio/*,.m4a,.mp3,.aac,.ogg,.wav,.flac,.webm',
    hint: 'MP3, M4A, AAC, WAV, atau OGG · maks. 100 MB per file.',
  },
};

function formatSize(bytes) {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('id-ID')} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString('id-ID', { maximumFractionDigits: 1 })} MB`;
}

function formatWib(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('id-ID', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta',
  }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.weekday}, ${parts.day} ${parts.month} ${parts.year} · ${parts.hour}.${parts.minute} WIB`;
}

function attachmentName(url) {
  try {
    const name = decodeURIComponent(String(url).split('?')[0].split('/').pop() || '');
    return name.replace(/^\d+_[a-z0-9]+_/i, '') || 'Lampiran soal';
  } catch {
    return 'Lampiran soal';
  }
}

function cssColor(name, fallback) {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  } catch {
    return fallback;
  }
}

function PageBrand() {
  return <div className="sp-brand"><BrandMark size={24} /><span>Kumpulin</span></div>;
}

function Banner({ tone, icon, title, children }) {
  return <div className={`banner banner-${tone}`} role={tone === 'late' || tone === 'danger' || tone === 'warm' ? 'alert' : undefined}>
    <Icon name={icon} size={20} className="banner-icon" />
    <div className="banner-body">{title && <p className="banner-title">{title}</p>}<p>{children}</p></div>
  </div>;
}

function de({ open, message, type, onClose }) {
  if (!open) return null;
  const tips = xe[type] || [];
  return <div className="sheet-scrim">
    <div className="sheet" role="alertdialog" aria-modal="true" aria-labelledby="formatTitle" aria-describedby="formatMessage">
      <div className="sheet-head">
        <span className="icon-tile icon-tile-danger"><Icon name="warning" size={22} /></span>
        <div><h2 id="formatTitle">Format tidak didukung</h2><p id="formatMessage">{message}</p></div>
      </div>
      {tips.length > 0 && <div className="tips"><p className="tips-title">Tips</p><ul>{tips.map(tip => <li key={tip}>{tip}</li>)}</ul></div>}
      <button type="button" className="btn btn-lg" onClick={onClose} autoFocus>Mengerti</button>
    </div>
  </div>;
}

function Se({ files, onAddFile, showToast }) {
  const canvasRef = t.useRef(null), recorderRef = t.useRef(null), streamRef = t.useRef(null), chunksRef = t.useRef([]);
  const timerRef = t.useRef(null), frameRef = t.useRef(null), analyserRef = t.useRef(null), audioContextRef = t.useRef(null), secondsRef = t.useRef(0);
  const fileRef = t.useRef(null);
  const [recording, setRecording] = t.useState(false);
  const [seconds, setSeconds] = t.useState(0);
  const [statusText, setStatusText] = t.useState('Tekan tombol untuk mulai merekam');
  const [problem, setProblem] = t.useState(null);
  const [formatError, setFormatError] = t.useState(null);
  const drawIdle = t.useCallback(() => {
    const canvas = canvasRef.current, context = canvas && canvas.getContext('2d');
    if (!context) return;
    const { width, height } = canvas;
    context.clearRect(0, 0, width, height);
    context.strokeStyle = cssColor('--border-2', '#cfc5b0');
    context.lineWidth = 1.5;
    context.beginPath(); context.moveTo(0, height / 2); context.lineTo(width, height / 2); context.stroke();
  }, []);
  const drawLive = t.useCallback(() => {
    const analyser = analyserRef.current, canvas = canvasRef.current, context = canvas && canvas.getContext('2d');
    if (!analyser || !context) return;
    const { width, height } = canvas, data = new Uint8Array(analyser.frequencyBinCount);
    const line = cssColor('--primary', '#6b8f5e'), base = cssColor('--border', '#e0d8c8');
    const frame = () => {
      if (!analyserRef.current) return;
      frameRef.current = requestAnimationFrame(frame);
      analyser.getByteTimeDomainData(data);
      context.clearRect(0, 0, width, height);
      context.strokeStyle = base; context.lineWidth = 1;
      context.beginPath(); context.moveTo(0, height / 2); context.lineTo(width, height / 2); context.stroke();
      context.lineWidth = 2.5; context.strokeStyle = line; context.lineJoin = 'round'; context.beginPath();
      const step = width / data.length;
      for (let index = 0, x = 0; index < data.length; index++, x += step) {
        const y = data[index] / 128 * (height / 2);
        index === 0 ? context.moveTo(x, y) : context.lineTo(x, y);
      }
      context.lineTo(width, height / 2); context.stroke();
    };
    frame();
  }, []);
  const cleanup = t.useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (frameRef.current) { cancelAnimationFrame(frameRef.current); frameRef.current = null; }
    if (audioContextRef.current) { audioContextRef.current.close().catch(() => {}); audioContextRef.current = null; }
    analyserRef.current = null;
    drawIdle();
  }, [drawIdle]);
  t.useEffect(() => { drawIdle(); return () => cleanup(); }, [drawIdle, cleanup]);
  function stop() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    cleanup();
    setRecording(false);
  }
  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setProblem('unsupported');
      return;
    }
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 } });
    } catch (error) {
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') setProblem('denied');
      else showToast('Gagal mengakses mikrofon: ' + error.message, 'error');
      return;
    }
    setProblem(null);
    const mimeType = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'].find(type => MediaRecorder.isTypeSupported(type)) || '';
    chunksRef.current = []; secondsRef.current = 0; setSeconds(0);
    try {
      recorderRef.current = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : {});
    } catch (error) {
      showToast('Gagal membuat perekam: ' + (error instanceof Error ? error.message : ''), 'error');
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      return;
    }
    recorderRef.current.ondataavailable = event => { if (event.data?.size) chunksRef.current.push(event.data); };
    recorderRef.current.onstop = () => {
      const type = recorderRef.current?.mimeType || mimeType || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type });
      const ext = type.includes('mp4') || type.includes('m4a') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
      const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
      const file = new File([blob], `rekaman_${stamp}.${ext}`, { type });
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setRecording(false); setSeconds(0); cleanup();
      if (files.length >= X) {
        showToast(`Maksimal ${X} file per pengumpulan.`, 'error');
        setStatusText('Tekan tombol untuk mulai merekam');
        return;
      }
      onAddFile(file);
      showToast(`Rekaman tersimpan · ${se(secondsRef.current)} · ${formatSize(file.size)}`, 'success');
      setStatusText('Rekaman tersimpan. Tekan lagi untuk rekam tambahan.');
    };
    recorderRef.current.onerror = () => { showToast('Perekaman gagal. Coba lagi.', 'error'); stop(); };
    recorderRef.current.start(100);
    setRecording(true);
    setStatusText('Merekam… tekan lagi untuk berhenti');
    try {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContextRef.current.createMediaStreamSource(streamRef.current);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 512;
      source.connect(analyserRef.current);
      drawLive();
    } catch {
      drawIdle();
    }
    timerRef.current = setInterval(() => {
      secondsRef.current++;
      setSeconds(secondsRef.current);
      if (secondsRef.current >= 600) stop();
    }, 1000);
  }
  function pickFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const check = le(file, 'audio');
    if (!check.ok) { setFormatError(check.errorMsg); return; }
    if (files.length >= X) { showToast(`Maksimal ${X} file per pengumpulan.`, 'error'); return; }
    onAddFile(file);
  }
  return <>
    <div className={`recorder${problem ? ' recorder-off' : ''}`}>
      <canvas ref={canvasRef} width={600} height={56} className="recorder-wave" aria-hidden="true" />
      <span className={`recorder-icon${recording ? ' live' : ''}`} aria-hidden="true"><Icon name={problem ? 'micOff' : 'mic'} size={30} /></span>
      <span className={`recorder-time mono${recording ? ' live' : ''}`}>{se(seconds)}</span>
      <p className="recorder-status" aria-live="polite">{statusText}</p>
      <button type="button" className={`btn btn-pill${recording ? ' btn-danger' : ''}`} onClick={() => (recording ? stop() : start())} disabled={problem === 'unsupported'} aria-pressed={recording}>
        <span className={`rec-dot${recording ? ' square' : ''}`} aria-hidden="true" />{recording ? 'Berhenti' : 'Mulai rekam'}
      </button>
      <span className="field-hint">Maks. rekaman: 10 menit</span>
    </div>
    {problem === 'denied' && <Banner tone="warm" icon="warning" title="Akses mikrofon ditolak">Izinkan mikrofon di pengaturan browser, atau rekam dengan aplikasi perekam HP lalu unggah filenya di bawah.</Banner>}
    {problem === 'unsupported' && <Banner tone="warm" icon="warning" title="Perekam tidak tersedia">Browser Anda tidak mendukung perekaman langsung. Gunakan unggah file di bawah.</Banner>}
    <input ref={fileRef} type="file" accept={MEDIA_COPY.audio.accept} hidden onChange={pickFile} />
    <button type="button" className="pick-btn pick-btn-soft" onClick={() => fileRef.current?.click()}><Icon name="upload" size={22} />Atau unggah file audio</button>
    {formatError && <FormatDialog message={formatError} type="audio" onClose={() => setFormatError(null)} />}
  </>;
}

function FormatDialog(props) {
  return de({ open: true, ...props });
}

function Re({ files, type, onRemove }) {
  const [viewer, setViewer] = t.useState(null);
  const urls = t.useMemo(() => new Map(files.map(file => [file, URL.createObjectURL(file)])), [files]);
  t.useEffect(() => () => urls.forEach(url => URL.revokeObjectURL(url)), [urls]);
  if (!files.length) return null;
  const copy = MEDIA_COPY[type];
  return <>
    <ul className={`media-grid media-grid-${type}`} aria-label="Berkas terpilih">
      {files.map((file, index) => {
        const url = urls.get(file), label = `${copy.item} ${index + 1}`;
        return <li key={`${file.name}-${index}`} className="media-tile">
          <button type="button" className="media-open" aria-label={`Lihat ${label}`} onClick={() => setViewer({ url, type, caption: `${label} dari ${files.length}` })}>
            {type === 'image' && <img src={url} alt="" />}
            {type === 'video' && <><video src={url} muted preload="metadata" /><span className="media-play"><Icon name="play" size={18} /></span></>}
            {type === 'audio' && <span className="media-audio"><Icon name="mic" size={24} /><span className="mono">{formatSize(file.size)}</span></span>}
          </button>
          <span className="media-num mono" aria-hidden="true">{index + 1}</span>
          <button type="button" className="media-remove" aria-label={`Hapus ${label}`} onClick={() => onRemove(index)}><span><Icon name="close" size={14} strokeWidth={2.5} /></span></button>
        </li>;
      })}
    </ul>
    {viewer && <MediaViewer open type={viewer.type} url={viewer.url} caption={viewer.caption} onClose={() => setViewer(null)} />}
  </>;
}

function Ce({ open, icon, title, subtitle }) {
  if (!open) return null;
  return <div className="sheet-scrim">
    <div className="sheet" role="status" aria-live="polite">
      <div className="sheet-head">
        <span className="icon-tile"><Icon name={icon} size={22} /></span>
        <div><h2>{title}</h2>{subtitle && <p className="mono-meta">{subtitle}</p>}</div>
      </div>
      <div className="bar bar-indeterminate" aria-hidden="true"><span /></div>
      <p className="field-hint">Mohon tunggu, jangan tutup halaman.</p>
    </div>
  </div>;
}

function highlight(name, query) {
  const needle = query.trim().toLowerCase();
  const at = needle ? name.toLowerCase().indexOf(needle) : -1;
  if (at < 0) return name;
  return <>{name.slice(0, at)}<strong>{name.slice(at, at + needle.length)}</strong>{name.slice(at + needle.length)}</>;
}

function Me({ students, value, disabled, placeholder, onChange, invalid, describedBy }) {
  const [picked, setPicked] = t.useState(false);
  const [open, setOpen] = t.useState(false);
  const [active, setActive] = t.useState(0);
  const listId = 'studentNameList';
  t.useEffect(() => { if (!value) setPicked(false); }, [value]);
  t.useEffect(() => { setPicked(false); }, [students]);
  const query = value.trim().toLowerCase();
  const matches = picked || !query ? [] : students.filter(name => name.toLowerCase().includes(query));
  const shown = matches.slice(0, 50);
  function choose(name) {
    onChange(name);
    setPicked(true);
    setOpen(false);
  }
  function onKeyDown(event) {
    if (!open || !shown.length) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(index => Math.min(index + 1, shown.length - 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(index - 1, 0)); }
    else if (event.key === 'Enter') { event.preventDefault(); choose(shown[active]); }
    else if (event.key === 'Escape') { setOpen(false); }
  }
  const expanded = open && !picked && query.length > 0;
  return <div className="combo" id="studentNameContainer">
    <Icon name="search" size={18} className="combo-search" />
    <input type="text" id="studentName" role="combobox" aria-expanded={expanded} aria-controls={listId} aria-autocomplete="list"
      aria-activedescendant={expanded && shown[active] ? `${listId}-${active}` : undefined} aria-invalid={invalid || undefined} aria-describedby={describedBy}
      value={value} placeholder={placeholder} autoComplete="off" disabled={disabled} maxLength={100} className={picked ? 'is-picked' : ''}
      onChange={event => { onChange(event.target.value); setPicked(false); setOpen(true); setActive(0); }}
      onFocus={() => { if (!picked) setOpen(true); }} onBlur={() => setTimeout(() => setOpen(false), 150)} onKeyDown={onKeyDown} />
    {picked && <Icon name="check" size={20} strokeWidth={2.25} className="combo-check" />}
    {expanded && <div className="combo-list" role="listbox" id={listId}>
      {shown.length === 0 ? <p className="combo-empty">Nama tidak ditemukan di kelas ini.</p>
        : shown.map((name, index) => <div key={name} id={`${listId}-${index}`} role="option" aria-selected={index === active}
          className={`combo-option${index === active ? ' active' : ''}`} onMouseDown={event => event.preventDefault()} onClick={() => choose(name)}>
          <span>{highlight(name, value)}</span>
        </div>)}
      <p className="combo-count">{matches.length} dari {students.length} nama</p>
    </div>}
  </div>;
}

function Te({ open, phase, files, type, statusText, percent = 0 }) {
  if (!open) return null;
  const done = phase === 'complete';
  const shown = done ? 100 : phase === 'saving' ? 95 : Math.round(percent);
  const total = files.reduce((sum, file) => sum + file.size, 0);
  const sent = done || phase === 'saving' ? total : Math.min(total, total * percent / 94);
  let offset = 0;
  const rows = files.map((file, index) => {
    const start = offset;
    offset += file.size;
    const state = sent >= offset ? 'done' : sent > start ? 'active' : 'wait';
    const filePercent = state === 'active' ? Math.round((sent - start) / file.size * 100) : 0;
    return { index, state, filePercent };
  });
  const finished = rows.filter(row => row.state === 'done').length;
  const label = MEDIA_COPY[type].item;
  return <div className="sheet-scrim">
    <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="uploadTitle">
      <div className="upload-head">
        <h2 id="uploadTitle">{done ? 'Tugas terkirim' : phase === 'saving' ? 'Menyimpan…' : 'Mengirim tugas…'}</h2>
        <span className="upload-percent mono">{shown}%</span>
      </div>
      <div className="bar" role="progressbar" aria-valuenow={shown} aria-valuemin={0} aria-valuemax={100} aria-label="Kemajuan pengiriman"><span style={{ width: `${shown}%` }} /></div>
      <p className="mono-meta">{finished} / {files.length} file · {formatSize(sent)} dari {formatSize(total)}</p>
      {statusText && !done && <p className="upload-status" aria-live="polite">{statusText}</p>}
      <ul className="upload-rows">
        {rows.map(row => <li key={row.index}>
          <span className="mono upload-index">{row.index + 1}</span>
          <span className="upload-name">{label} {row.index + 1}</span>
          {row.state === 'done' && <span className="upload-done"><Icon name="check" size={18} strokeWidth={2.25} />Terkirim</span>}
          {row.state === 'active' && <span className="upload-active"><span className="spinner" aria-hidden="true" /><span className="mono">{row.filePercent}%</span></span>}
          {row.state === 'wait' && <span className="upload-wait">Menunggu</span>}
        </li>)}
      </ul>
      {!done && <Banner tone="info" icon="warning">Jangan tutup halaman ini selama proses upload berlangsung.</Banner>}
    </div>
  </div>;
}

function UploadErrorSheet({ message, onRetry, onClose }) {
  const offline = /koneksi|jaringan|network|waktu pengiriman/i.test(message);
  return <div className="sheet-scrim">
    <div className="sheet" role="alertdialog" aria-modal="true" aria-labelledby="uploadErrorTitle" aria-describedby="uploadErrorMessage">
      <div className="sheet-head">
        <span className="icon-tile icon-tile-danger"><Icon name={offline ? 'wifiOff' : 'warning'} size={22} /></span>
        <div><h2 id="uploadErrorTitle">{offline ? 'Koneksi terputus' : 'Pengiriman gagal'}</h2><p id="uploadErrorMessage">{message}</p></div>
      </div>
      <p className="field-hint">File Anda masih ada di halaman ini. Kirim ulang akan mengirim semua file dari awal.</p>
      <button type="button" className="btn btn-lg" onClick={onRetry} autoFocus>Kirim ulang</button>
      <button type="button" className="link-btn link-btn-block" onClick={onClose}>Kembali ke formulir</button>
    </div>
  </div>;
}

function validateSubmission({ studentName, studentClass, classes, studentsFailed, nameIsValid, files, type }) {
  const errors = {};
  if (!studentClass.trim()) errors.class = classes.length ? 'Pilih kelas Anda.' : 'Isi kelas Anda.';
  if (!studentName.trim()) errors.name = 'Isi nama lengkap Anda.';
  else if (classes.length && studentsFailed) errors.name = 'Gagal memuat daftar siswa. Pilih kelas lagi.';
  else if (classes.length && !nameIsValid(studentName)) errors.name = 'Nama tidak ada di daftar kelas ini.';
  if (!files.length) errors.files = `Tambahkan ${TYPE_META[type].noun} tugas terlebih dahulu.`;
  return errors;
}

function createSubmitHandler(deps) {
  return async event => {
    event?.preventDefault?.();
    const { task, submitting, code, studentName, studentClass, classes, note, files } = deps;
    if (!task || submitting) return;
    const errors = deps.validate();
    deps.setFieldErrors(errors);
    if (Object.keys(errors).length) {
      deps.toast(Object.values(errors)[0], 'error');
      return;
    }
    deps.setSubmitting(true);
    deps.setUploadError('');
    deps.setUploadOpen(true);
    deps.setPhase('progress');
    deps.setStatusText('Mengunggah file...');
    deps.setUploadPercent(0);
    const form = new FormData();
    form.append('task_code', code);
    form.append('task_id', task.id);
    form.append('student_name', studentName.trim());
    form.append('student_class', studentClass.trim());
    form.append('class_id', classes.find(klass => klass.name === studentClass)?.id || '');
    if (note.trim()) form.append('student_note', note.trim());
    files.forEach((file, index) => form.append(`file_${index}`, file));
    try {
      const result = await deps.upload('/api/submissions', form, {
        onProgress: deps.setUploadPercent,
        onSaving: () => { deps.setPhase('saving'); deps.setStatusText('Menyimpan ke server...'); },
        onRetry: (attempt, seconds) => {
          deps.setUploadPercent(0);
          deps.setPhase('progress');
          deps.setStatusText(`Banyak siswa sedang mengirim bersamaan. Menunggu giliran (${attempt}), coba lagi ~${seconds} detik...`);
        },
      });
      deps.setPhase('complete');
      await new Promise(resolve => setTimeout(resolve, deps.completeDelay ?? 900));
      deps.setUploadOpen(false);
      deps.onDone(result);
    } catch (error) {
      deps.setUploadOpen(false);
      deps.setUploadError(error instanceof Error ? error.message : 'Gagal mengirim tugas.');
      deps.setSubmitting(false);
    }
  };
}

function StatusScreen({ icon, tone, title, children, action }) {
  return <main className="sp sp-status">
    <PageBrand />
    <div className="status-body">
      <span className={`icon-tile icon-tile-xl icon-tile-${tone}`}><Icon name={icon} size={28} /></span>
      <h1>{title}</h1>
      <p>{children}</p>
      {action}
    </div>
  </main>;
}

function Receipt({ task, receipt, type }) {
  const [viewer, setViewer] = t.useState(null);
  const deadline = new Date(taskDeadlineTimestamp(task.deadline)).getTime();
  const late = receipt.sentAt > deadline;
  const label = MEDIA_COPY[type].item;
  const count = receipt.fileUrls.length;
  return <main className="sp sp-receipt">
    <div className="receipt-head">
      <span className="receipt-check"><Icon name="check" size={38} strokeWidth={2.25} /></span>
      <h1>Tugas Terkirim</h1>
      <p>Simpan atau screenshot halaman ini sebagai bukti.</p>
    </div>
    {receipt.replaced && <Banner tone="info" icon="info">Pengumpulan sebelumnya dengan nama dan kelas yang sama telah diganti dengan yang baru.</Banner>}
    <article className="receipt-card">
      <div className="receipt-top">
        <div><span className="meta-label">Dikirim</span><span className="mono receipt-time">{formatWib(receipt.sentAt)}</span></div>
        <StatusChip status={late ? 'late' : 'ontime'} />
      </div>
      <dl className="receipt-list">
        <dt>Tugas</dt><dd className="strong">{task.title}</dd>
        <dt>Nama</dt><dd className="strong">{receipt.studentName}</dd>
        <dt>Kelas</dt><dd className="strong">{receipt.studentClass}</dd>
        {receipt.studentNote && <><dt>Catatan</dt><dd>{receipt.studentNote}</dd></>}
        <dt>Berkas</dt><dd className="mono">{count} {TYPE_META[type].noun} · {formatSize(receipt.totalBytes)}</dd>
      </dl>
    </article>
    <section className="sp-section">
      <h2 className="section-label">Berkas yang diterima guru</h2>
      <div className={type === 'image' ? 'receipt-grid' : 'receipt-stack'}>
        {receipt.fileUrls.map((fileUrl, index) => {
          const url = re(fileUrl);
          if (!url) return null;
          const caption = `${label} ${index + 1} dari ${count}`;
          if (type === 'image') return <figure key={fileUrl}>
            <button type="button" className="receipt-thumb" onClick={() => setViewer({ url, caption })} aria-label={`Lihat ${caption}`}><img src={url} alt="" loading="lazy" /></button>
            <figcaption className="mono">{caption}</figcaption>
          </figure>;
          return <figure key={fileUrl} className="receipt-media">
            {type === 'video' ? <video src={url} controls preload="metadata" /> : <audio src={url} controls preload="metadata" />}
            <figcaption className="mono">{caption}</figcaption>
          </figure>;
        })}
      </div>
    </section>
    <a href="/" className="btn btn-outline btn-lg">Kembali ke Beranda</a>
    {viewer && <MediaViewer open type="image" url={viewer.url} caption={viewer.caption} onClose={() => setViewer(null)} />}
  </main>;
}

function ze() {
  const [params] = ve();
  const code = params.get('code') || '';
  const { showToast } = be();
  const [task, setTask] = t.useState(null);
  const [loading, setLoading] = t.useState(true);
  const [loadError, setLoadError] = t.useState('');
  const [receipt, setReceipt] = t.useState(null);
  const [studentName, setStudentName] = t.useState('');
  const [studentClass, setStudentClass] = t.useState('');
  const [note, setNote] = t.useState('');
  const [files, setFiles] = t.useState([]);
  const [classes, setClasses] = t.useState([]);
  const [students, setStudents] = t.useState([]);
  const [studentsFailed, setStudentsFailed] = t.useState(false);
  const [studentsLoading, setStudentsLoading] = t.useState(false);
  const [submitting, setSubmitting] = t.useState(false);
  const [processing, setProcessing] = t.useState(null);
  const [formatError, setFormatError] = t.useState(null);
  const [uploadOpen, setUploadOpen] = t.useState(false);
  const [phase, setPhase] = t.useState('progress');
  const [statusText, setStatusText] = t.useState('');
  const [uploadPercent, setUploadPercent] = t.useState(0);
  const [uploadError, setUploadError] = t.useState('');
  const [fieldErrors, setFieldErrors] = t.useState({});
  const [descriptionOpen, setDescriptionOpen] = t.useState(false);
  const captureRef = t.useRef(null), galleryRef = t.useRef(null);
  const type = task?.submission_type || 'image';
  const copy = MEDIA_COPY[type];

  t.useEffect(() => {
    if (!code) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`${oe}/api/tasks/code/${code}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.task) throw Object.assign(new Error(data.error || 'Tugas tidak ditemukan'), { notFound: true });
        if (cancelled) return;
        setTask(data.task);
        setClasses(data.task.classes || []);
      } catch (error) {
        if (!cancelled) setLoadError(error.notFound ? 'notfound' : 'network');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  const loadStudents = t.useMemo(() => studentListLoader({
    begin: () => { setStudentsLoading(true); setStudentsFailed(false); setStudents([]); setStudentName(''); },
    load: async classId => {
      const response = await fetch(oe + '/api/tasks/code/' + code + '/classes/' + classId + '/students');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Gagal memuat siswa');
      return (data.students || []).map(student => student.name);
    },
    success: setStudents,
    failure: () => { setStudentsFailed(true); setStudents([]); },
    end: () => setStudentsLoading(false),
  }), [code]);
  t.useEffect(() => () => loadStudents.cancel(), [loadStudents]);
  t.useEffect(() => {
    setStudentClass(''); setStudents([]); setStudentName('');
    if (classes.length === 1) { setStudentClass(classes[0].name); loadStudents(classes[0].id); }
  }, [classes, loadStudents]);

  function nameIsValid(name) {
    if (!classes.length) return true;
    if (studentsFailed || !students.length) return false;
    const needle = name.trim().toLowerCase();
    return students.some(student => student.trim().toLowerCase() === needle);
  }

  async function addFile(file) {
    const check = le(file, type);
    if (!check.ok) { setFormatError({ message: check.errorMsg, type }); return false; }
    const originalSize = formatSize(file.size);
    const format = (file.type || file.name.split('.').pop() || type).replace(`${type}/`, '').toUpperCase();
    const noun = TYPE_META[type].noun;
    setProcessing(type === 'image'
      ? { icon: 'camera', title: 'Mengompresi foto…', subtitle: `${originalSize} · ${format}` }
      : type === 'video'
        ? { icon: 'video', title: file.size >= 5 * 1024 * 1024 ? 'Mengompresi video…' : 'Memproses video…', subtitle: `${originalSize} · ${format}` }
        : { icon: 'mic', title: 'Mengonversi ke MP3…', subtitle: `${originalSize} · ${format}` });
    try {
      const processed = await we(file, type);
      setProcessing(null);
      setFiles(list => [...list, processed]);
      setFieldErrors(errors => ({ ...errors, files: undefined }));
      if (processed !== file && processed.size < file.size) {
        showToast(`${TYPE_META[type].label} ditambahkan · ${originalSize} → ${formatSize(processed.size)}`, 'success');
      } else {
        showToast(`${TYPE_META[type].label} ditambahkan.`, 'success');
      }
      return true;
    } catch (error) {
      setProcessing(null);
      const message = error instanceof Error ? error.message : 'Error tidak diketahui';
      if (message.includes('decode')) setFormatError({ message: `Format ${noun} tidak dapat dibaca. Coba format lain (${type === 'video' ? 'MP4, MOV' : 'JPG, PNG, WebP'}).`, type });
      else showToast(`Gagal memproses ${noun}: ${message}`, 'error');
      return false;
    }
  }

  async function pickFiles(event) {
    const picked = Array.from(event.target.files || []);
    event.target.value = '';
    let count = files.length;
    for (const file of picked) {
      if (count >= X) { showToast(`Maksimal ${X} file per pengumpulan.`, 'error'); break; }
      if (!(await addFile(file))) break;
      count++;
    }
  }

  function addRecording(file) {
    setFiles(list => [...list, file]);
    setFieldErrors(errors => ({ ...errors, files: undefined }));
  }

  const submitTask = createSubmitHandler({
    task, submitting, code, studentName, studentClass, classes, note, files,
    validate: () => validateSubmission({ studentName, studentClass, classes, studentsFailed, nameIsValid, files, type }),
    upload: ke, toast: showToast,
    setFieldErrors, setSubmitting, setUploadError, setUploadOpen, setPhase, setStatusText, setUploadPercent,
    onDone: result => {
      setReceipt({
        studentName: studentName.trim(), studentClass: studentClass.trim(), studentNote: note.trim(),
        fileUrls: result.file_urls || [], replaced: !!result.replaced, sentAt: Date.now(),
        totalBytes: files.reduce((sum, file) => sum + file.size, 0),
      });
      window.scrollTo(0, 0);
    },
  });

  if (!code) return <StatusScreen icon="linkOff" tone="warm" title="Link Tidak Valid"
    action={<a href="/" className="btn btn-lg">Masukkan kode</a>}>
    Link ini tidak berisi kode tugas. Periksa lagi link dari guru Anda, atau masukkan kode 6 digit secara manual.
  </StatusScreen>;
  if (loading) return <main className="sp"><PageBrand /><div className="sp-loading" role="status"><span className="spinner spinner-lg" aria-hidden="true" /><span>Memuat tugas…</span></div></main>;
  if (!task && loadError === 'network') return <StatusScreen icon="wifiOff" tone="danger" title="Tidak dapat terhubung"
    action={<button type="button" className="btn btn-lg" onClick={() => window.location.reload()}>Coba lagi</button>}>
    Tugas belum dapat dimuat. Periksa koneksi internet Anda, lalu coba lagi.
  </StatusScreen>;
  if (!task) return <StatusScreen icon="linkOff" tone="warm" title="Tugas Tidak Ditemukan"
    action={<a href="/" className="btn btn-lg">Masukkan kode</a>}>
    Kode pada link ini tidak dikenali atau tugas telah dihapus. Periksa lagi link dari guru Anda, atau masukkan kode 6 digit secara manual.
  </StatusScreen>;
  if (receipt) return <Receipt task={task} receipt={receipt} type={type} />;

  const late = Date.now() > new Date(taskDeadlineTimestamp(task.deadline)).getTime();
  const fileUrl = task.file_url && re(task.file_url);
  const longDescription = !!task.description && (task.description.length > 240 || task.description.split('\n').length > 4);
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const singleClass = classes.length === 1;
  let namePlaceholder = 'Nama lengkap', nameDisabled = false, nameHint = '';
  if (classes.length) {
    if (studentsFailed) namePlaceholder = 'Gagal memuat siswa';
    else if (studentsLoading) namePlaceholder = 'Memuat daftar siswa...';
    else if (!studentClass) namePlaceholder = 'Pilih kelas dulu';
    else if (!students.length) namePlaceholder = 'Tidak ada siswa di kelas ini';
    else { namePlaceholder = 'Ketik untuk mencari nama'; nameHint = `Ketik untuk mencari dari ${students.length} nama di ${studentClass}.`; }
    nameDisabled = !studentClass || studentsLoading || studentsFailed || !students.length;
  }
  return <main className="sp">
    <PageBrand />
    <div className="sp-intro">
      <h1>Pengumpulan Tugas</h1>
      <p>Isi form di bawah untuk mengirim tugas.</p>
    </div>
    <article className="task-card">
      <div className="task-card-body">
        <span className="eyebrow">{task.subject}</span>
        <h2>{task.title}</h2>
        {task.description && <p className={`task-description${longDescription && !descriptionOpen ? ' clamped' : ''}`}>{task.description}</p>}
        {longDescription && <button type="button" className="link-btn" aria-expanded={descriptionOpen} onClick={() => setDescriptionOpen(!descriptionOpen)}>
          {descriptionOpen ? 'Tutup' : 'Selengkapnya'}<Icon name="chevronDown" size={16} strokeWidth={2} className={descriptionOpen ? 'flip' : ''} />
        </button>}
      </div>
      {fileUrl && <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="attachment-row">
        <Icon name="file" size={22} />
        <span className="attachment-text"><span>{attachmentName(task.file_url)}</span><span className="meta">Lampiran soal</span></span>
        <Icon name="download" size={20} />
      </a>}
      <div className="deadline-row">
        <Icon name="clock" size={20} className={late ? 'tone-late' : ''} />
        <span>Batas Waktu: <strong>{formatWib(taskDeadlineTimestamp(task.deadline))}</strong></span>
      </div>
    </article>
    {late && <Banner tone="late" icon="clock">Batas waktu pengumpulan telah lewat. Anda masih dapat mengirim tugas, namun akan tercatat sebagai terlambat.</Banner>}
    {!ye() && <Banner tone="info" icon="phone">Disarankan menggunakan HP agar dapat langsung mengambil foto, video, atau audio dari kamera.</Banner>}
    <form id="submitForm" className="sp-form" onSubmit={submitTask} noValidate>
      <section className="sp-section">
        <h2 className="section-label">1 · Data diri</h2>
        <div className="field" id="studentClassGroup">
          <label htmlFor="studentClass">Kelas</label>
          {singleClass ? <p id="studentClass" className="static-field">{classes[0].name}</p>
            : classes.length > 1 ? <div className="select-wrap">
              <select id="studentClass" required value={studentClass} aria-invalid={!!fieldErrors.class || undefined} onChange={event => {
                const option = event.target.selectedOptions[0];
                setStudentClass(option.value);
                setFieldErrors(errors => ({ ...errors, class: undefined, name: undefined }));
                loadStudents(option.dataset.classId || null);
              }}>
                <option value="" disabled>Pilih kelas...</option>
                {classes.map(klass => <option key={klass.id} value={klass.name} data-class-id={klass.id}>{klass.name}</option>)}
              </select>
            </div>
            : <input type="text" id="studentClass" required maxLength={100} placeholder="Contoh: XII IPA 1" value={studentClass} aria-invalid={!!fieldErrors.class || undefined}
              onChange={event => { setStudentClass(event.target.value); setFieldErrors(errors => ({ ...errors, class: undefined })); }} />}
          {fieldErrors.class && <p className="field-error" role="alert"><Icon name="warning" size={16} />{fieldErrors.class}</p>}
        </div>
        <div className="field" id="studentNameGroup">
          <label htmlFor="studentName">Nama Lengkap</label>
          {classes.length ? <Me students={students} value={studentName} disabled={nameDisabled} placeholder={namePlaceholder} invalid={!!fieldErrors.name}
            describedBy={fieldErrors.name ? 'studentNameError' : nameHint ? 'studentNameHint' : undefined}
            onChange={value => { setStudentName(value); setFieldErrors(errors => ({ ...errors, name: undefined })); }} />
            : <input type="text" id="studentName" required maxLength={100} placeholder="Nama lengkap" autoComplete="name" value={studentName} aria-invalid={!!fieldErrors.name || undefined}
              onChange={event => { setStudentName(event.target.value); setFieldErrors(errors => ({ ...errors, name: undefined })); }} />}
          {fieldErrors.name ? <p id="studentNameError" className="field-error" role="alert"><Icon name="warning" size={16} />{fieldErrors.name}</p>
            : nameHint && <p id="studentNameHint" className="field-hint">{nameHint}</p>}
        </div>
      </section>
      <section className="sp-section" id="mediaInputGroup">
        <div className="section-row">
          <h2 className="section-label">2 · {copy.section}</h2>
          <span className="mono section-count">{files.length} / {X} berkas</span>
        </div>
        {type === 'audio' ? <Se files={files} onAddFile={addRecording} showToast={showToast} /> : <>
          <input ref={captureRef} type="file" accept={copy.accept} capture="environment" hidden onChange={pickFiles} />
          <input ref={galleryRef} type="file" accept={copy.accept} multiple hidden onChange={pickFiles} />
          <div className="pick-grid">
            <button type="button" id="mediaCaptureBtn" className="pick-btn pick-btn-primary" onClick={() => captureRef.current?.click()} disabled={files.length >= X}><Icon name={type === 'video' ? 'video' : 'camera'} size={26} />{copy.capture}</button>
            <button type="button" className="pick-btn" onClick={() => galleryRef.current?.click()} disabled={files.length >= X}><Icon name="upload" size={26} />{copy.pick}</button>
          </div>
        </>}
        <p className="field-hint" id="mediaHint">{copy.hint}</p>
        {fieldErrors.files && <p className="field-error" role="alert"><Icon name="warning" size={16} />{fieldErrors.files}</p>}
        <Re files={files} type={type} onRemove={index => setFiles(list => list.filter((_, position) => position !== index))} />
      </section>
      <section className="sp-section field">
        <label htmlFor="studentNote">Catatan untuk Guru <span className="optional">(opsional)</span></label>
        <textarea id="studentNote" rows={3} maxLength={1000} placeholder="Misalnya: foto ke-3 adalah revisi." value={note} onChange={event => setNote(event.target.value)} />
        {note.length > 800 ? <p className={`field-hint mono${note.length > 950 ? ' tone-warm' : ''}`}>{note.length} / 1000</p> : <p className="field-hint">Maks. 1000 karakter.</p>}
      </section>
      <div className="submit-bar">
        <div className="submit-summary"><span>{files.length ? `${files.length} ${TYPE_META[type].noun} siap` : 'Belum ada berkas'}</span><span className="mono">{formatSize(totalBytes)}</span></div>
        <button type="submit" className="btn btn-lg" id="btnSubmit" disabled={submitting}>
          {submitting ? <><span className="spinner" aria-hidden="true" />Mengirim...</> : <><Icon name="upload" size={20} />Kirim Tugas</>}
        </button>
      </div>
    </form>
    <Ce open={!!processing} icon={processing?.icon || 'upload'} title={processing?.title || ''} subtitle={processing?.subtitle} />
    {formatError && <FormatDialog message={formatError.message} type={formatError.type} onClose={() => setFormatError(null)} />}
    <Te open={uploadOpen} phase={phase} files={files} type={type} statusText={statusText} percent={uploadPercent} />
    {uploadError && <UploadErrorSheet message={uploadError} onRetry={() => submitTask()} onClose={() => setUploadError('')} />}
  </main>;
}
