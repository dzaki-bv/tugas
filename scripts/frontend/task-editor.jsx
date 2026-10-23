function TaskEditor({ task, onClose, onSaved }) {
  const [saving, setSaving] = Ye.useState(false);
  const [error, setError] = Ye.useState('');
  const deadline = new Date(new Date(task.deadline).getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 16);
  async function save(event) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setSaving(true);
    setError('');
    try {
      const result = await Ma(`/api/tasks/${task.id}`, {
        method: 'PUT',
        body: JSON.stringify(Object.fromEntries(fields)),
      });
      onSaved(result.task);
      onClose();
    } catch (err) {
      setError(err.message || 'Gagal menyimpan perubahan. Coba lagi.');
    } finally {
      setSaving(false);
    }
  }
  return <section className="card mt-2" aria-labelledby="edit-task-title">
    <h2 id="edit-task-title">Edit Tugas</h2>
    <form onSubmit={save}>
      <fieldset disabled={saving} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className="form-group"><label htmlFor="edit-title">Judul Tugas</label><input autoFocus id="edit-title" name="title" defaultValue={task.title} required /></div>
        <div className="form-group"><label htmlFor="edit-subject">Mata Pelajaran</label><input id="edit-subject" name="subject" defaultValue={task.subject} required /></div>
        <div className="form-group"><label htmlFor="edit-description">Petunjuk / Deskripsi</label><textarea id="edit-description" name="description" defaultValue={task.description || ''} rows={10} /></div>
        <div className="form-group"><label htmlFor="edit-deadline">Deadline (WIB)</label><input id="edit-deadline" name="deadline" type="datetime-local" defaultValue={deadline} required /></div>
        {error && <p role="alert" style={{ color: 'var(--error)' }}>{error}</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="submit" className="btn btn-inline">{saving ? 'Menyimpan...' : 'Simpan Perubahan'}</button>
          <button type="button" className="btn btn-outline btn-inline" onClick={onClose}>Batal</button>
        </div>
      </fieldset>
    </form>
  </section>;
}
