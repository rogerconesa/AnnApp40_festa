const Drive = (() => {
  const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
  const FILES_URL  = 'https://www.googleapis.com/drive/v3/files';

  function _token() { return sessionStorage.getItem('festa_token'); }

  // ── Pujar fitxer ──────────────────────────────
  async function uploadFile(file, onProgress, _isRetry) {
    const token = _token();
    const meta  = { name: file.name, parents: [CONFIG.DRIVE_FOLDER_ID] };
    const form  = new FormData();
    form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
    form.append('file', file);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round(e.loaded / e.total * 100));
      });
      xhr.addEventListener('load', async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const result = JSON.parse(xhr.responseText);
          // Fer públic (permet veure el thumbnail sense auth)
          try { await makePublic(result.id); } catch(e) { console.warn('makePublic falla:', e); }
          resolve(result);
        } else if (xhr.status === 401 && !_isRetry) {
          try {
            await Auth.refreshToken();
            resolve(await uploadFile(file, onProgress, true));
          } catch { reject(new Error('Sessió caducada. Torna a entrar.')); }
        } else {
          reject(new Error('Error pujant (' + xhr.status + ')'));
        }
      });
      xhr.addEventListener('error', () => reject(new Error('Error de xarxa')));
      xhr.open('POST', UPLOAD_URL);
      xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      xhr.send(form);
    });
  }

  // ── Fer fitxer públic ─────────────────────────
  async function makePublic(fileId) {
    const token = _token();
    if (!token) throw new Error('Sense token per makePublic');
    const res = await fetch(`${FILES_URL}/${fileId}/permissions`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });
    if (!res.ok) throw new Error('makePublic error ' + res.status);
  }

  // ── Eliminar fitxer ───────────────────────────
  async function deleteFile(fileId, _isRetry) {
    const token = _token();
    const res = await fetch(`${FILES_URL}/${fileId}`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token },
    });
    if (res.status === 401 && !_isRetry) {
      await Auth.refreshToken();
      return deleteFile(fileId, true);
    }
    // 204 = eliminat correctament, 404 = ja no existia
    if (res.status !== 204 && res.status !== 404) {
      throw new Error('Error eliminant fitxer: ' + res.status);
    }
  }

  return { uploadFile, makePublic, deleteFile };
})();
