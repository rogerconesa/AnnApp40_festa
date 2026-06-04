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
    // Restaurar tab de la sessió anterior
    const savedTab = sessionStorage.getItem('festa_tab') || 'foto';
    _setTab(savedTab);

    document.querySelectorAll('.nav-tab').forEach(btn => {
      btn.addEventListener('click', () => _setTab(btn.dataset.tab));
    });
  }

  function _setTab(tab) {
    _tab = tab;
    sessionStorage.setItem('festa_tab', tab);
    document.querySelectorAll('.nav-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.getElementById('panel-foto').classList.toggle('hidden', tab !== 'foto');
    document.getElementById('panel-veure').classList.toggle('hidden', tab !== 'veure');
    if (tab === 'veure') {
      // Mostrar loading i forçar càrrega
      _showFotosLoading(true);
      _loadFotos();
    }
  }

  // ── Càmera / Captura ─────────────────────────
  function _initCamera() {
    const inputFoto  = document.getElementById('camera-input-foto');
    const inputVideo = document.getElementById('camera-input-video');
    const preview    = document.getElementById('photo-preview');
    const tagsZone   = document.getElementById('tags-zone');
    const btnPujar   = document.getElementById('btn-pujar');

    document.getElementById('btn-open-foto').addEventListener('click', () => inputFoto.click());
    document.getElementById('btn-open-video').addEventListener('click', () => inputVideo.click());

    const handleFile = (file) => {
      if (!file) return;
      _capturedFile = file;
      const url = URL.createObjectURL(file);
      if (file.type.startsWith('video/')) {
        preview.innerHTML = `<video src="${url}" controls playsinline class="preview-media"></video>`;
      } else {
        preview.innerHTML = `<img src="${url}" class="preview-media" />`;
      }
      tagsZone.classList.remove('hidden');
      btnPujar.classList.remove('hidden');
      // Scroll fins al formulari
      tagsZone.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    inputFoto.addEventListener('change',  () => handleFile(inputFoto.files[0]));
    inputVideo.addEventListener('change', () => handleFile(inputVideo.files[0]));

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
      const persones   = _getSelectedPersones();
      const notes      = document.getElementById('tag-notes').value.trim();
      const now        = new Date();
      const tzOffset   = -now.getTimezoneOffset();
      const sign       = tzOffset >= 0 ? '+' : '-';
      const pad        = n => String(Math.floor(Math.abs(n))).padStart(2, '0');
      const timestamp  = now.getFullYear() + '-' +
        pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + 'T' +
        pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds()) +
        sign + pad(tzOffset / 60) + ':' + pad(tzOffset % 60);
      const tipus      = _capturedFile.type.startsWith('video/') ? 'video' : 'foto';
      const profile    = Auth.getProfile();
      const pujatNom   = profile?.name  || profile?.email?.split('@')[0] || 'Anònim';
      const pujatEmail = profile?.email || '';

      const result = await Drive.uploadFile(_capturedFile, (pct) => {
        progressBar.querySelector('.progress-fill').style.width = pct + '%';
      });

      const fileId = result.id;
      // thumbnail URL — funciona per embedding (uc?id= no funciona ja)
      const url    = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1200`;
      const id     = `festa_${Date.now()}`;

      await Sheets.appendRow({ id, fileId, url, timestamp, persones, notes, pujatNom, pujatEmail, tipus });

      // Reset
      document.getElementById('photo-preview').innerHTML = '';
      document.getElementById('tags-zone').classList.add('hidden');
      btn.classList.add('hidden');
      document.getElementById('camera-input-foto').value  = '';
      document.getElementById('camera-input-video').value = '';
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

  function _showFotosLoading(show) {
    const grid = document.getElementById('fotos-grid');
    if (!grid) return;
    if (show && _fotos.length === 0) {
      grid.innerHTML = '<p class="fotos-empty">Carregant fotos... ⏳</p>';
    } else if (show && _fotos.length > 0) {
      // Mostrar les que ja tenim mentre refresquem
      _renderFotos();
    }
  }

  async function _loadFotos() {
    try {
      const dades = await Sheets.readAll();
      _fotos = dades;
      _renderFotos();
    } catch(err) {
      console.error('Error carregant fotos:', err);
      _showToast('❌ Error llegint fotos: ' + err.message, 'error');
      // Renderitzar el que tenim (si hi ha alguna cosa)
      _renderFotos();
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
      const thumbUrl = `https://drive.google.com/thumbnail?id=${foto.fileId}&sz=w400`;

      card.innerHTML = `
        <div class="foto-card-img">
          <img src="${thumbUrl}" loading="lazy" onerror="this.style.background='var(--bg3)'" />
          ${foto.tipus === 'video' ? '<div class="foto-card-vid-badge">▶</div>' : ''}
        </div>
        <div class="foto-card-info">
          ${hora ? `<span class="foto-card-hora">${hora}</span>` : ''}
          ${foto.pujatNom ? `<span class="foto-card-autor">${foto.pujatNom}</span>` : ''}
          ${foto.persones.length ? `<span class="foto-card-persones">${foto.persones.slice(0,3).join(', ')}</span>` : ''}
          ${foto.notes ? `<span class="foto-card-notes">"${foto.notes}"</span>` : ''}
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
    // Usar thumbnail per al lightbox (uc?id= no funciona per embedding)
    document.getElementById('lb-img').src = `https://drive.google.com/thumbnail?id=${foto.fileId}&sz=w1600`;
    document.getElementById('lb-hora').textContent = hora ? `🕐 ${hora}` : '';
    document.getElementById('lb-autor').textContent = foto.pujatNom ? `📷 ${foto.pujatNom}` : '';
    document.getElementById('lb-persones').textContent = foto.persones.length ? `👥 ${foto.persones.join(', ')}` : '';
    document.getElementById('lb-notes').textContent = foto.notes ? `"${foto.notes}"` : '';
    document.getElementById('lb-counter').textContent = `${_lbIdx + 1} / ${_lbList.length}`;
    document.getElementById('lb-prev').disabled = _lbIdx === 0;
    document.getElementById('lb-next').disabled = _lbIdx === _lbList.length - 1;
  }

  function _renderLb() {
    const foto = _lbList[_lbIdx];
    if (!foto) return;
    const hora = foto.timestamp ? new Date(foto.timestamp).toLocaleTimeString('ca', { hour: '2-digit', minute: '2-digit' }) : '';
    document.getElementById('lb-img').src = `https://drive.google.com/thumbnail?id=${foto.fileId}&sz=w1600`;
    document.getElementById('lb-hora').textContent     = hora ? `🕐 ${hora}` : '';
    document.getElementById('lb-autor').textContent    = foto.pujatNom ? `📷 ${foto.pujatNom}` : '';
    document.getElementById('lb-persones').textContent = foto.persones.length ? `👥 ${foto.persones.join(', ')}` : '';
    document.getElementById('lb-notes').textContent    = foto.notes ? `"${foto.notes}"` : '';
    document.getElementById('lb-counter').textContent  = `${_lbIdx + 1} / ${_lbList.length}`;
    document.getElementById('lb-prev').disabled = _lbIdx === 0;
    document.getElementById('lb-next').disabled = _lbIdx === _lbList.length - 1;

    // Mostrar botó editar només si és la teva foto
    const editBtn = document.getElementById('lb-edit');
    const myEmail = Auth.getProfile()?.email;
    editBtn.classList.toggle('hidden', !myEmail || foto.pujatEmail !== myEmail);
    editBtn.onclick = () => _openEdit(foto);
  }

  // ── Editar foto ───────────────────────────────
  let _editingFoto = null;

  function _openEdit(foto) {
    _editingFoto = foto;
    // Chips persones
    const container = document.getElementById('edit-chips-persones');
    container.innerHTML = '';
    CONFIG.PERSONES.forEach(nom => {
      const btn = document.createElement('button');
      btn.className = 'chip' + (foto.persones.includes(nom) ? ' selected' : '');
      btn.dataset.value = nom;
      btn.textContent = nom;
      btn.addEventListener('click', () => btn.classList.toggle('selected'));
      container.appendChild(btn);
    });
    document.getElementById('edit-notes').value = foto.notes || '';
    document.getElementById('edit-modal').classList.remove('hidden');
    document.getElementById('lightbox').classList.add('hidden');
  }

  function _closeEdit() {
    document.getElementById('edit-modal').classList.add('hidden');
    _editingFoto = null;
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('lb-close').addEventListener('click', () => {
      document.getElementById('lightbox').classList.add('hidden');
    });
    document.getElementById('lb-prev').addEventListener('click', () => { if (_lbIdx > 0) { _lbIdx--; _renderLb(); } });
    document.getElementById('lb-next').addEventListener('click', () => { if (_lbIdx < _lbList.length - 1) { _lbIdx++; _renderLb(); } });

    // Swipe
    const lb = document.getElementById('lightbox');
    lb.addEventListener('touchstart', e => { _lbStartX = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - _lbStartX;
      if (Math.abs(dx) > 40) {
        if (dx < 0 && _lbIdx < _lbList.length - 1) { _lbIdx++; _renderLb(); }
        else if (dx > 0 && _lbIdx > 0) { _lbIdx--; _renderLb(); }
      }
    }, { passive: true });
    lb.addEventListener('click', e => { if (e.target === lb) lb.classList.add('hidden'); });

    // Editar — guardar
    document.getElementById('edit-save-btn').addEventListener('click', async () => {
      if (!_editingFoto) return;
      const persones = [...document.querySelectorAll('#edit-chips-persones .chip.selected')].map(c => c.dataset.value);
      const notes    = document.getElementById('edit-notes').value.trim();
      try {
        await Sheets.updateRow(_editingFoto.fileId, { persones, notes });
        _showToast('✅ Foto actualitzada', 'success');
        _closeEdit();
        await _loadFotos();
      } catch(err) { _showToast('❌ Error: ' + err.message, 'error'); }
    });

    // Editar — eliminar
    document.getElementById('edit-delete-btn').addEventListener('click', async () => {
      if (!_editingFoto) return;
      if (!confirm('Segur que vols eliminar aquesta foto?')) return;
      try {
        await Drive.deleteFile(_editingFoto.fileId);
        await Sheets.deleteRow(_editingFoto.fileId);
        _showToast('🗑️ Foto eliminada', 'success');
        _closeEdit();
        await _loadFotos();
      } catch(err) { _showToast('❌ Error: ' + err.message, 'error'); }
    });

    // Editar — cancel·lar
    document.getElementById('edit-cancel-btn').addEventListener('click', _closeEdit);
    document.getElementById('edit-modal').addEventListener('click', e => {
      if (e.target === document.getElementById('edit-modal')) _closeEdit();
    });
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
