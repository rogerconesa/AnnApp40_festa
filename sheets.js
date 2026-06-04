// Columnes FotosDia (A-O) — compatible amb anna40/readDia:
// A=id  B=fileId  C=url  D=hora  E=lloc  F=persones  G=categoria  H=notes
// I=pujatNom  J=pujatEmail  K=timestamp ISO  L=lat  M=lng  N=tipus  O=preferida

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

  // ── Llegir totes les fotos ────────────────────
  async function readAll() {
    // A1 (no A2) per no perdre la fila 1 si no hi ha capçalera
    const range = `'${CONFIG.SHEET_DIA}'!A1:O`;
    const res   = await fetch(_readUrl(range), { headers: _headers() });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Sheets ${res.status}: ${body.slice(0, 120)}`);
    }
    const data = await res.json();
    return (data.values || []).map(r => ({
      id:         r[0]  || '',
      fileId:     r[1]  || '',
      url:        r[2]  || '',
      timestamp:  r[10] || r[3] || '',
      persones:   r[5]  ? String(r[5]).split(',').map(p => p.trim()).filter(Boolean) : [],
      notes:      r[7]  || '',
      pujatNom:   r[8]  || 'Anònim',
      pujatEmail: r[9]  || '',
      tipus:      r[13] || 'foto',
    })).filter(r => r.fileId && r.fileId.length > 10 && r.fileId !== 'fileId');
  }

  // ── Afegir nova fila ──────────────────────────
  async function appendRow(data, _isRetry) {
    const { id, fileId, url, timestamp, persones, notes, pujatNom, pujatEmail, tipus } = data;
    const hora = timestamp
      ? new Date(timestamp).toLocaleTimeString('ca', { hour: '2-digit', minute: '2-digit' })
      : '';
    const row = [
      id, fileId, url, hora, '',
      Array.isArray(persones) ? persones.join(', ') : '',
      'Festa', notes || '', pujatNom || 'Anònim', pujatEmail || '',
      timestamp || '', '', '', tipus || 'foto', 'false',
    ];
    const range    = `'${CONFIG.SHEET_DIA}'!A:O`;
    const endpoint = `${BASE}/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
    const res = await fetch(endpoint, {
      method: 'POST', headers: _headers(),
      body: JSON.stringify({ values: [row] }),
    });
    if (res.status === 401 && !_isRetry) { await Auth.refreshToken(); return appendRow(data, true); }
    if (!res.ok) throw new Error('Error Sheets: ' + res.status);
    return res.json();
  }

  // ── Actualitzar fila per fileId ───────────────
  async function updateRow(fileId, updates, _isRetry) {
    const range = `'${CONFIG.SHEET_DIA}'!A1:O`;
    const res   = await fetch(_readUrl(range), { headers: _headers() });
    if (!res.ok) throw new Error('Error llegint per actualitzar');
    const data  = await res.json();
    const rows  = data.values || [];
    const idx   = rows.findIndex(r => r[1] === fileId);
    if (idx === -1) throw new Error('Fila no trobada');
    const rowNum = idx + 1; // 1-indexed per a Sheets API

    const batch = {
      valueInputOption: 'RAW',
      data: [
        { range: `'${CONFIG.SHEET_DIA}'!F${rowNum}`, values: [[updates.persones?.join(', ') ?? rows[idx][5] ?? '']] },
        { range: `'${CONFIG.SHEET_DIA}'!H${rowNum}`, values: [[updates.notes ?? rows[idx][7] ?? '']] },
      ],
    };
    const ep   = `${BASE}/${CONFIG.SPREADSHEET_ID}/values:batchUpdate`;
    const res2 = await fetch(ep, { method: 'POST', headers: _headers(), body: JSON.stringify(batch) });
    if (res2.status === 401 && !_isRetry) { await Auth.refreshToken(); return updateRow(fileId, updates, true); }
    if (!res2.ok) throw new Error('Error actualitzant: ' + res2.status);
    return res2.json();
  }

  // ── Eliminar fila per fileId ──────────────────
  async function deleteRow(fileId, _isRetry) {
    // 1. Obtenir sheetId de FotosDia
    const metaRes = await fetch(
      `${BASE}/${CONFIG.SPREADSHEET_ID}?fields=sheets.properties`,
      { headers: _headers() }
    );
    if (!metaRes.ok) throw new Error('Error obtenint metadades');
    const meta    = await metaRes.json();
    const sheet   = meta.sheets?.find(s => s.properties.title === CONFIG.SHEET_DIA);
    const sheetId = sheet?.properties?.sheetId ?? 0;

    // 2. Trobar número de fila
    const range = `'${CONFIG.SHEET_DIA}'!A1:O`;
    const res   = await fetch(_readUrl(range), { headers: _headers() });
    const data  = await res.json();
    const rows  = data.values || [];
    const idx   = rows.findIndex(r => r[1] === fileId);
    if (idx === -1) throw new Error('Fila no trobada');

    // 3. Eliminar (idx és 0-based, startIndex per batchUpdate és 0-based)
    const body = {
      requests: [{
        deleteDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex: idx, endIndex: idx + 1 },
        },
      }],
    };
    const ep   = `${BASE}/${CONFIG.SPREADSHEET_ID}:batchUpdate`;
    const res2 = await fetch(ep, { method: 'POST', headers: _headers(), body: JSON.stringify(body) });
    if (res2.status === 401 && !_isRetry) { await Auth.refreshToken(); return deleteRow(fileId, true); }
    if (!res2.ok) throw new Error('Error eliminant fila: ' + res2.status);
  }

  return { readAll, appendRow, updateRow, deleteRow };
})();
