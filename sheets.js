// Columnes FotosDia: A=id B=fileId C=url D=timestamp E=persones F=notes G=tipus
const Sheets = (() => {
  const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

  function _token() { return sessionStorage.getItem('festa_token'); }

  function _headers() {
    const h = { 'Content-Type': 'application/json' };
    const t = _token();
    if (t) h['Authorization'] = 'Bearer ' + t;
    return h;
  }

  function _readUrl(range) {
    const base = `${BASE}/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`;
    return _token() ? base : base + `&key=${CONFIG.SHEETS_API_KEY}`;
  }

  async function readAll() {
    const range = `'${CONFIG.SHEET_DIA}'!A2:G`;
    const res = await fetch(_readUrl(range), { headers: _headers() });
    if (!res.ok) throw new Error('Error llegint: ' + res.status);
    const data = await res.json();
    return (data.values || []).map(r => ({
      id:        r[0] || '',
      fileId:    r[1] || '',
      url:       r[2] || '',
      timestamp: r[3] || '',
      persones:  r[4] ? r[4].split(',').map(p => p.trim()).filter(Boolean) : [],
      notes:     r[5] || '',
      tipus:     r[6] || 'foto',
    })).filter(r => r.fileId);
  }

  async function appendRow(data, _isRetry) {
    const { id, fileId, url, timestamp, persones, notes, tipus } = data;
    const row = [id, fileId, url, timestamp,
      Array.isArray(persones) ? persones.join(', ') : '',
      notes || '', tipus || 'foto'];
    const range    = `'${CONFIG.SHEET_DIA}'!A:G`;
    const endpoint = `${BASE}/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
    const res = await fetch(endpoint, {
      method: 'POST', headers: _headers(),
      body: JSON.stringify({ values: [row] }),
    });
    if (res.status === 401 && !_isRetry) {
      await Auth.refreshToken();
      return appendRow(data, true);
    }
    if (!res.ok) throw new Error('Error Sheets: ' + res.status);
    return res.json();
  }

  return { readAll, appendRow };
})();
