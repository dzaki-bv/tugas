function storageUsage(value) {
  return value && Number.isFinite(value.used_bytes) && value.used_bytes >= 0 ? { used_bytes: value.used_bytes } : null;
}
function readDashboardStorage(key) {
  if (!key) return null;
  try { return storageUsage(JSON.parse(localStorage.getItem(key))); } catch { return null; }
}
function useDashboardStorage(dashboard, pathname) {
  const teacherId = localStorage.getItem('teacher_id');
  const key = teacherId ? 'tugas:storage:' + teacherId : null;
  const [cached, setCached] = Ye.useState(() => ({ key, value: readDashboardStorage(key) }));
  Ye.useEffect(() => {
    if (!dashboard || pathname !== '/dashboard') return;
    let cancelled = false;
    Ma('/api/storage/usage').then(response => {
      const next = storageUsage(response);
      if (cancelled || !next) return;
      const text = JSON.stringify(next);
      if (key && localStorage.getItem(key) !== text) {
        try { localStorage.setItem(key, text); } catch { /* The current value still works when browser storage is full. */ }
      }
      setCached(previous => previous.key === key && previous.value?.used_bytes === next.used_bytes ? previous : { key, value: next });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [dashboard, pathname, key]);
  return cached.key === key ? cached.value : readDashboardStorage(key);
}
