const Auth = (() => {
  let _tokenClient  = null;
  let _token        = null;
  let _profile      = null;
  let _onLogin      = null;
  let _refreshTimer = null;

  const LS_TOKEN   = 'festa_token';
  const LS_PROFILE = 'festa_profile';

  function _saveToken(t) {
    _token = t;
    localStorage.setItem(LS_TOKEN, t);
    sessionStorage.setItem(LS_TOKEN, t);
  }

  function _saveProfile(p) {
    _profile = p;
    localStorage.setItem(LS_PROFILE, JSON.stringify(p));
    sessionStorage.setItem(LS_PROFILE, JSON.stringify(p));
  }

  function _loadStored() {
    const t = localStorage.getItem(LS_TOKEN) || sessionStorage.getItem(LS_TOKEN);
    let p = null;
    try { p = JSON.parse(localStorage.getItem(LS_PROFILE) || sessionStorage.getItem(LS_PROFILE) || 'null'); } catch {}
    return { t, p };
  }

  // ── Init ──────────────────────────────────────
  function init(onLogin) {
    _onLogin = onLogin;

    if (typeof google === 'undefined') { setTimeout(() => init(onLogin), 200); return; }
    _initClient();

    const { t, p } = _loadStored();
    if (!t) return; // No hi ha sessió → mostrar login

    _token = t;

    if (p) {
      // Perfil en caché → mostrar app IMMEDIATAMENT
      _profile = p;
      onLogin && onLogin();
      // Refrescar token en segon pla
      _startSilentRefresh();
    } else {
      // Sense perfil → intentar carregar-lo amb el token existent
      _fetchProfile().then(() => {
        onLogin && onLogin();
        _startSilentRefresh();
      }).catch(() => {
        // Token probablement caducat → demanar re-login
        _clearSession();
      });
    }
  }

  function _initClient() {
    if (_tokenClient) return;
    _tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.CLIENT_ID,
      scope:     CONFIG.SCOPES,
      callback:  async (resp) => {
        if (resp.error || !resp.access_token) {
          _showReloginBanner();
          return;
        }
        _saveToken(resp.access_token);
        await _fetchProfile().catch(() => {});
        _onLogin && _onLogin();
        _startRefreshTimer();
      },
    });
  }

  async function _fetchProfile() {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { 'Authorization': 'Bearer ' + _token }
    });
    if (!res.ok) throw new Error('Token invàlid: ' + res.status);
    const p = await res.json();
    _saveProfile(p);
    return p;
  }

  // ── Silent refresh ────────────────────────────
  function _startSilentRefresh() {
    // Intent immediat de refresh silenciós
    refreshToken({ silent: true }).then(() => {
      _startRefreshTimer();
    }).catch(() => {
      // Refresh silenciós fallit: timer d'avís als 50min
      _startRefreshTimer();
    });
  }

  function _startRefreshTimer() {
    if (_refreshTimer) clearInterval(_refreshTimer);
    _refreshTimer = setInterval(async () => {
      try {
        await refreshToken({ silent: true });
      } catch {
        // Si el refresh silenciós falla, avisar l'usuari
        _showReloginBanner();
      }
    }, 50 * 60 * 1000);
  }

  // ── Banner re-login ───────────────────────────
  function _showReloginBanner() {
    if (document.getElementById('relogin-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'relogin-banner';
    banner.style.cssText = [
      'position:fixed;top:0;left:0;right:0;z-index:9999',
      'background:#ff9f0a;color:#000;padding:12px 16px',
      'display:flex;align-items:center;justify-content:space-between;gap:10px',
      'font-family:-apple-system,sans-serif;font-size:0.9rem;font-weight:600',
      'box-shadow:0 2px 12px rgba(0,0,0,0.2)',
    ].join(';');
    banner.innerHTML = `
      <span>⚠️ La sessió ha caducat. Cal tornar a entrar per pujar fotos.</span>
      <button onclick="Auth.login();document.getElementById('relogin-banner')?.remove()"
        style="background:#000;color:#fff;border:none;border-radius:8px;padding:7px 14px;cursor:pointer;font-weight:700;white-space:nowrap">
        Renovar sessió
      </button>
    `;
    document.body.prepend(banner);
  }

  // ── Login / Logout ────────────────────────────
  function login() {
    if (!_tokenClient) _initClient();
    _tokenClient.requestAccessToken({});
  }

  function _clearSession() {
    _token = null; _profile = null;
    localStorage.removeItem(LS_TOKEN); localStorage.removeItem(LS_PROFILE);
    sessionStorage.removeItem(LS_TOKEN); sessionStorage.removeItem(LS_PROFILE);
  }

  // ── Refresh token ─────────────────────────────
  function refreshToken({ silent = false } = {}) {
    return new Promise((resolve, reject) => {
      if (!_tokenClient) { _initClient(); }
      const orig = _tokenClient.callback;
      _tokenClient.callback = (resp) => {
        _tokenClient.callback = orig;
        if (resp.error || !resp.access_token) { reject(new Error(resp.error || 'refresh_failed')); return; }
        _saveToken(resp.access_token);
        resolve(resp.access_token);
      };
      _tokenClient.requestAccessToken({ prompt: silent ? '' : undefined });
    });
  }

  function getToken()   { return _token; }
  function getProfile() { return _profile; }
  function isLoggedIn() { return !!_token; }

  return { init, login, getToken, getProfile, isLoggedIn, refreshToken };
})();
