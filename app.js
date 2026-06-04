(() => {
  // ── Estat ────────────────────────────────────
  let _tab         = 'foto';
  let _fotos       = [];
  let _refreshTimer= null;
  let _autoRefresh = true;
  let _capturedFile= null;
  let _uploading   = false;

  // ── Init ─────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    Auth.init(() => {
      document.getElementById('screen-login').classList.remove('active');
      document.getElementById('screen-login').classList.add('hidden');
      document.getElementById('screen-app').classList.remove('hidden');
      _initApp();
    });

    document.getElementById('btn-login').addEventListener('click', () => Auth.login());
  });

  function _initApp() {
    _renderPersonaChips();
    _initCamera();
    _initTabs();
    _initVeure();
    _loadFotos();
  }

  // ── Tabs ─────────────────────────────────────
  function _initTabs() {
    document.querySelectorAll('.nav-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        _tab = btn.dataset.tab;
        document.querySelectorAll('.nav-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === _tab));
        document.getElementById('panel-foto').classList.toggle('hidden', _tab !== 'foto');
        document.getElementById('panel-veure').classList.toggle('hidden', _tab !== 'veure');
        if (_tab === 'veure') _renderFotos();
      });
    });
  }

  // ── Càmera / Captura ─────────────────────────
  function _initCamera() {
    const input   = document.getElementById('camera-input');
    const preview = document.getElementById('photo-preview');
    const btnCam  = document.getElementById('btn-open-camera');
    const tagsZone= document.getElementById('tags-zone');
    const btnPujar= document.getElementById('btn-pujar');

    btnCam.addEventListener('click', () => input.click());

    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      _capturedFile = file;
      const url = URL.createObjectURL(file);
      if (file.type.startsWith('video/')) {
        preview.innerHTML = `<video src="${url}" controls class="preview-media"></video>`;
      } else {
        preview.innerHTML = `<img src="${url}" class="preview-media" />`;
      }
      tagsZone.classList.remove('hidden');
      btnPujar.classList.remove('hidden');
    });

    btnPujar.addEventListener('click', _uploadPhoto);
  }

  // ── Persones chips ────────────────────────────
  function _renderPersonaChips() {
    const container = document.getElementById('chips-persones');
    container.innerHTML = '';
    CONFIG.PERSONES.forEach(nom => {
      const btn = document.createElement('button');
      btn.className = 'chip';
      btn.dataset.value = nom;
      btn.textContent = nom;
      btn.addEventListener('click', () => btn.classList.toggle('selected'));
      container.appendChild(btn);
    });
  }

  function _getSelectedPersones() {
    return [...document.querySelectorAll('#chips-persones .chip.selected')].map(c => c.dataset.value);
  }

  // ── Upload ────────────────────────────────────
  async function _uploadPhoto() {
    if (_uploading || !_capturedFile) return;
    _uploading = true;

    const btn = document.getElementById('btn-pujar');
    const progressBar = document.getElementById('upload-progress');
    btn.disabled = true;
    btn.textContent = 'Pujant...';
    progressBar.classList.remove('hidden');

    try {
      const persones = _getSelectedPersones();
      const notes    = document.getElementById('tag-notes').value.trim();
      const now = new Date();
      // Guardem en hora local (GMT+2 a Barcelona) com a ISO amb offset
      const tzOffset = -now.getTimezoneOffset(); // minuts, positiu per GMT+2
      const sign = tzOffset >= 0 ? '+' : '-';
      const pad  = n => String(Math.floor(Math.abs(n))).padStart(2, '0');
      const timestamp = now.getFullYear() + '-' +
        pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + 'T' +
        pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds()) +
        sign + pad(tzOffset / 60) + ':' + pad(tzOffset % 60);
      const tipus    = _capturedFile.type.startsWith('video/') ? 'video' : 'foto';

      const result = await Drive.uploadFile(_capturedFile, (pct) => {
        progressBar.querySelector('.progress-fill').style.width = pct + '%';
      });

      const fileId = result.id;
      const url    = `https://drive.google.com/uc?id=${fileId}`;
      const id     = `festa_${Date.now()}`;

      await Sheets.appendRow({ id, fileId, url, timestamp, persones, notes, tipus });

      // Reset
      document.getElementById('photo-preview').innerHTML = '';
      document.getElementById('tags-zone').classList.add('hidden');
      btn.classList.add('hidden');
      document.getElementById('camera-input').value = '';
      document.getElementById('tag-notes').value = '';
      _renderPersonaChips();
      _capturedFile = null;
      _showToast('✅ Foto pujada!', 'success');
      _loadFotos();
    } catch(err) {
      _showToast('❌ Error: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '📤 Pujar foto';
      progressBar.classList.add('hidden');
      progressBar.querySelector('.progress-fill').style.width = '0%';
      _uploading = false;
    }
  }

  // ── Veure fotos ───────────────────────────────
  function _initVeure() {
    // Refresh manual
    document.getElementById('btn-refresh').addEventListener('click', () => _loadFotos());

    // Toggle auto-refresh
    document.getElementById('btn-auto-refresh').addEventListener('click', function() {
      _autoRefresh = !_autoRefresh;
      this.classList.toggle('active', _autoRefresh);
      this.textContent = _autoRefresh ? '⏸ Auto' : '▶ Auto';
      if (_autoRefresh) _scheduleRefresh(); else clearTimeout(_refreshTimer);
    });

    // Filtre persones
    _renderFilterChips();

    // Slider hores
    const sliderMin = document.getElementById('hour-min');
    const sliderMax = document.getElementById('hour-max');
    const updateSlider = () => {
      _renderFotos();
      const lbl = document.getElementById('hour-range-label');
      lbl.textContent = `${sliderMin.value}h – ${sliderMax.value}h`;
    };
    sliderMin.addEventListener('input', () => {
      if (parseInt(sliderMin.value) > parseInt(sliderMax.value)) sliderMin.value = sliderMax.value;
      updateSlider();
    });
    sliderMax.addEventListener('input', () => {
      if (parseInt(sliderMax.value) < parseInt(sliderMin.value)) sliderMax.value = sliderMin.value;
      updateSlider();
    });
  }

  function _renderFilterChips() {
    const container = document.getElementById('filter-persones');
    container.innerHTML = '';
    // Botó "Totes"
    const all = document.createElement('button');
    all.className = 'chip selected';
    all.dataset.value = '';
    all.textContent = 'Totes';
    all.addEventListener('click', () => {
      container.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
      all.classList.add('selected');
      _renderFotos();
    });
    container.appendChild(all);

    CONFIG.PERSONES.forEach(nom => {
      const btn = document.createElement('button');
      btn.className = 'chip';
      btn.dataset.value = nom;
      btn.textContent = nom;
      btn.addEventListener('click', () => {
        all.classList.remove('selected');
        btn.classList.toggle('selected');
        if (!container.querySelector('.chip.selected')) all.classList.add('selected');
        _renderFotos();
      });
      container.appendChild(btn);
    });
  }

  function _getFilterPersones() {
    return [...document.querySelectorAll('#filter-persones .chip.selected')]
      .map(c => c.dataset.value).filter(Boolean);
  }

  async function _loadFotos() {
    try {
      _fotos = await Sheets.readAll();
      if (_tab === 'veure') _renderFotos();
    } catch(err) {
      console.error('Error carregant fotos:', err);
    }
    _scheduleRefresh();
  }

  function _scheduleRefresh() {
    clearTimeout(_refreshTimer);
    if (_autoRefresh) _refreshTimer = setTimeout(_loadFotos, CONFIG.REFRESH_INTERVAL);
  }

  function _renderFotos() {
    const grid        = document.getElementById('fotos-grid');
    const countEl     = document.getElementById('fotos-count');
    const sliderMin   = document.getElementById('hour-min');
    const sliderMax   = document.getElementById('hour-max');
    const filterPersones = _getFilterPersones();
    const hMin = parseInt(sliderMin.value);
    const hMax = parseInt(sliderMax.value);

    let filtered = _fotos.filter(f => {
      // Filtre persones
      if (filterPersones.length > 0 && !filterPersones.some(p => f.persones.includes(p))) return false;
      // Filtre hora — new Date() parseja ISO amb offset correctament,
      // i getHours() retorna hora local del navegador (GMT+2 a Barcelona)
      if (f.timestamp) {
        const h = new Date(f.timestamp).getHours();
        if (h < hMin || h > hMax) return false;
      }
      return true;
    });

    // Ordenar per timestamp més recent primer
    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    countEl.textContent = `${filtered.length} foto${filtered.length !== 1 ? 's' : ''}`;
    grid.innerHTML = '';

    if (filtered.length === 0) {
      grid.innerHTML = '<p class="fotos-empty">Encara no hi ha fotos. Fes la primera! 📷</p>';
      return;
    }

    filtered.forEach(foto => {
      const card = document.createElement('div');
      card.className = 'foto-card';
      const hora = foto.timestamp ? new Date(foto.timestamp).toLocaleTimeString('ca', { hour: '2-digit', minute: '2-digit' }) : '';
      const thumbUrl = foto.tipus === 'video'
        ? `https://drive.google.com/thumbnail?id=${foto.fileId}&sz=w400`
        : `https://drive.google.com/thumbnail?id=${foto.fileId}&sz=w400`;

      card.innerHTML = `
        <div class="foto-card-img">
          <img src="${thumbUrl}" loading="lazy" onerror="this.style.display='none'" />
          ${foto.tipus === 'video' ? '<div class="foto-card-vid-badge">▶</div>' : ''}
        </div>
        <div class="foto-card-info">
          ${hora ? `<span class="foto-card-hora">${hora}</span>` : ''}
          ${foto.persones.length ? `<span class="foto-card-persones">${foto.persones.slice(0,3).join(', ')}</span>` : ''}
          ${foto.notes ? `<span class="foto-card-notes">${foto.notes}</span>` : ''}
        </div>
      `;
      card.addEventListener('click', () => _openLightbox(foto, filtered));
      grid.appendChild(card);
    });
  }

  // ── Lightbox ──────────────────────────────────
  let _lbList = [], _lbIdx = 0, _lbStartX = 0;

  function _openLightbox(foto, list) {
    _lbList = list;
    _lbIdx  = list.findIndex(f => f.fileId === foto.fileId);
    _renderLb();
    document.getElementById('lightbox').classList.remove('hidden');
  }

  function _renderLb() {
    const foto = _lbList[_lbIdx];
    if (!foto) return;
    const hora = foto.timestamp ? new Date(foto.timestamp).toLocaleTimeString('ca', { hour: '2-digit', minute: '2-digit' }) : '';
    document.getElementById('lb-img').src = foto.url || `https://drive.google.com/uc?id=${foto.fileId}`;
    document.getElementById('lb-hora').textContent = hora;
    document.getElementById('lb-persones').textContent = foto.persones.join(', ');
    document.getElementById('lb-notes').textContent = foto.notes;
    document.getElementById('lb-counter').textContent = `${_lbIdx + 1} / ${_lbList.length}`;
    document.getElementById('lb-prev').disabled = _lbIdx === 0;
    document.getElementById('lb-next').disabled = _lbIdx === _lbList.length - 1;
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('lb-close').addEventListener('click', () => document.getElementById('lightbox').classList.add('hidden'));
    document.getElementById('lb-prev').addEventListener('click', () => { if (_lbIdx > 0) { _lbIdx--; _renderLb(); } });
    document.getElementById('lb-next').addEventListener('click', () => { if (_lbIdx < _lbList.length - 1) { _lbIdx++; _renderLb(); } });

    // Swipe
    const lb = document.getElementById('lightbox');
    lb.addEventListener('touchstart', e => { _lbStartX = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - _lbStartX;
      if (Math.abs(dx) > 40) { if (dx < 0) { if (_lbIdx < _lbList.length-1) { _lbIdx++; _renderLb(); } } else { if (_lbIdx > 0) { _lbIdx--; _renderLb(); } } }
    }, { passive: true });
    lb.addEventListener('click', e => { if (e.target === lb) lb.classList.add('hidden'); });
  });

  // ── Toast ─────────────────────────────────────
  function _showToast(msg, type = '') {
    const t = document.createElement('div');
    t.className = 'toast' + (type ? ' ' + type : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }
})();
