// Columnes FotosDia (A-O) = format compatible amb anna40/readDia:
// A=id B=fileId C=url D=any(hora) E=lloc F=persones G=categoria H=notes
// I=pujatNom J=pujatEmail K=data L=lat M=lng N=tipus O=preferida
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
    const range = `'${CONFIG.SHEET_DIA}'!A2:O`;
    const res = await fetch(_readUrl(range), { headers: _headers() });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.values || []).map(r => ({
      id:        r[0]  || '',
      fileId:    r[1]  || '',
      url:       r[2]  || '',
      timestamp: r[10] || r[3] || '',   // K=data ISO, o D=hora com a fallback
      persones:  r[5]  ? String(r[5]).split(', ').filter(Boolean) : [],
      notes:     r[7]  || '',
      pujatNom:  r[8]  || 'Anònim',
      tipus:     r[13] || 'foto',
    })).filter(r => r.fileId);
  }

  async function appendRow(data, _isRetry) {
    const { id, fileId, url, timestamp, persones, notes, pujatNom, pujatEmail, tipus } = data;
    // Hora llegible (HH:MM) per al camp D (any/hora)
    const hora = timestamp ? new Date(timestamp).toLocaleTimeString('ca', { hour: '2-digit', minute: '2-digit' }) : '';
    // Row A-O
    const row = [
      id,                                           // A id
      fileId,                                       // B fileId
      url,                                          // C url
      hora,                                         // D any → hora llegible
      '',                                           // E lloc (buit)
      Array.isArray(persones) ? persones.join(', ') : '', // F persones
      'Festa',                                      // G categoria
      notes || '',                                  // H notes
      pujatNom || 'Anònim',                        // I pujatNom
      pujatEmail || '',                             // J pujatEmail
      timestamp || '',                              // K data (ISO complet)
      '',                                           // L lat
      '',                                           // M lng
      tipus || 'foto',                              // N tipus
      'false',                                      // O preferida
    ];
    const range    = `'${CONFIG.SHEET_DIA}'!A:O`;
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

// ── Actualitzar fila per fileId ───────────────
async function updateRow(fileId, updates, _isRetry) {
  // 1. Trobar el número de fila
  const range = `'${CONFIG.SHEET_DIA}'!A2:O`;
  const res   = await fetch(_readUrl(range), { headers: _headers() });
  if (!res.ok) throw new Error('Error llegint per actualitzar');
  const data  = await res.json();
  const rows  = data.values || [];
  const idx   = rows.findIndex(r => r[1] === fileId);
  if (idx === -1) throw new Error('Fila no trobada');
  const rowNum = idx + 2; // +2 perquè starts at row 2

  // 2. Actualitzar persones (F) i notes (H)
  const batch = {
    valueInputOption: 'RAW',
    data: [
      { range: `'${CONFIG.SHEET_DIA}'!F${rowNum}`, values: [[updates.persones?.join(', ') ?? rows[idx][5] ?? '']] },
      { range: `'${CONFIG.SHEET_DIA}'!H${rowNum}`, values: [[updates.notes ?? rows[idx][7] ?? '']] },
    ]
  };
  const ep  = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values:batchUpdate`;
  const res2 = await fetch(ep, { method: 'POST', headers: _headers(), body: JSON.stringify(batch) });
  if (res2.status === 401 && !_isRetry) { await Auth.refreshToken(); return updateRow(fileId, updates, true); }
  if (!res2.ok) throw new Error('Error actualitzant');
  return res2.json();
}

// ── Eliminar fila per fileId ──────────────────
async function deleteRow(fileId, _isRetry) {
  // Trobar sheetId de FotosDia
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}?fields=sheets.properties`,
    { headers: _headers() }
  );
  const meta   = await metaRes.json();
  const sheet  = meta.sheets?.find(s => s.properties.title === CONFIG.SHEET_DIA);
  const sheetId = sheet?.properties?.sheetId ?? 0;

  // Trobar número de fila
  const range = `'${CONFIG.SHEET_DIA}'!A2:O`;
  const res   = await fetch(_readUrl(range), { headers: _headers() });
  const data  = await res.json();
  const rows  = data.values || [];
  const idx   = rows.findIndex(r => r[1] === fileId);
  if (idx === -1) throw new Error('Fila no trobada');
  const rowNum = idx + 1; // 0-indexed per a batchUpdate

  const body = {
    requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: rowNum + 1, endIndex: rowNum + 2 } } }]
  };
  const ep  = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}:batchUpdate`;
  const res2 = await fetch(ep, { method: 'POST', headers: _headers(), body: JSON.stringify(body) });
  if (res2.status === 401 && !_isRetry) { await Auth.refreshToken(); return deleteRow(fileId, true); }
  if (!res2.ok) throw new Error('Error eliminant fila');
}

Sheets.updateRow = updateRow;
Sheets.deleteRow = deleteRow;
