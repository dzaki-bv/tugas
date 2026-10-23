async function Ry(path, form, options = {}) {
  const attempts = options.maxRetries ?? 5;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const response = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let savingTimer;
      const finish = callback => value => { clearTimeout(savingTimer); callback(value); };
      const timeoutError = () => new Error('Waktu pengiriman habis. Periksa koneksi, lalu kirim ulang dengan nama dan kelas yang sama.');
      xhr.open('POST', `${tc}${path}`);
      xhr.timeout = options.timeoutMs ?? 300000;
      xhr.upload.onprogress = event => {
        if (event.lengthComputable) options.onProgress?.(Math.min(94, Math.round(event.loaded / event.total * 94)));
      };
      xhr.upload.onload = () => {
        options.onSaving?.();
        savingTimer = setTimeout(() => { reject(timeoutError()); xhr.abort(); }, options.savingTimeoutMs ?? 60000);
      };
      xhr.onload = finish(() => resolve({ status: xhr.status, text: xhr.responseText, retryAfter: xhr.getResponseHeader('Retry-After') }));
      xhr.onerror = finish(() => reject(new Error('Koneksi terputus. File tetap tersedia di halaman ini. Periksa koneksi lalu kirim ulang.')));
      xhr.ontimeout = finish(() => reject(timeoutError()));
      xhr.onabort = finish(() => reject(new Error('Pengiriman dibatalkan. Silakan kirim ulang.')));
      xhr.send(form);
    });
    if (response.status === 429 && attempt < attempts - 1) {
      const seconds = Number.parseInt(response.retryAfter || '', 10);
      const delay = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 60) : 15 + attempt * 5;
      options.onRetry?.(attempt + 1, delay);
      await Kg(delay * 1000);
      continue;
    }
    let data;
    try { data = JSON.parse(response.text); }
    catch { throw new _o(`Respons tidak valid (HTTP ${response.status}). Silakan coba lagi.`, response.status); }
    if (response.status < 200 || response.status >= 300) throw new _o(data.error || 'Pengiriman gagal. Silakan coba lagi.', response.status);
    return data;
  }
  throw new _o('Server masih sibuk. Coba kirim lagi dalam beberapa menit.', 429);
}
