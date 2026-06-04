const Drive = (() => {
  const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
  const FILES_URL  = 'https://www.googleapis.com/drive/v3/files';

  function _token() { return sessionStorage.getItem('festa_token'); }

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
          await makePublic(result.id).catch(() => {});
          resolve(result);
        } else if (xhr.status === 401 && !_isRetry) {
          try {
            await Auth.refreshToken();
            resolve(await uploadFile(file, onProgress, true));
          } catch { reject(new Error('Sessió caducada')); }
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

  async function makePublic(fileId) {
    const token = _token();
    await fetch(`${FILES_URL}/${fileId}/permissions`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });
  }

  return { uploadFile };
})();

// Afegir deleteFile al mòdul Drive
const _driveDeleteFile = async (fileId, _isRetry) => {
  const token = Drive._token ? Drive._token() : sessionStorage.getItem('festa_token');
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + token }
  });
  if (res.status === 401 && !_isRetry) {
    await Auth.refreshToken();
    return _driveDeleteFile(fileId, true);
  }
  // 204 = OK sense cos
};
Drive.deleteFile = _driveDeleteFile;
