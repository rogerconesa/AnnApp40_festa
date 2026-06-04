const Auth = (() => {
  let _tokenClient = null;
  let _token       = null;
  let _profile     = null;
  let _onLogin     = null;

  function init(onLogin) {
    _onLogin = onLogin;
    const saved = sessionStorage.getItem('festa_token');
    if (saved) {
      _token = saved;
      try { _profile = JSON.parse(sessionStorage.getItem('festa_profile') || 'null'); } catch {}
      if (_profile) {
        onLogin && onLogin();
      } else {
        // Token existent però perfil no guardat → carregar perfil i després cridar onLogin
        fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { 'Authorization': 'Bearer ' + _token }
        }).then(r => r.ok ? r.json() : null).then(p => {
          if (p) {
            _profile = p;
            sessionStorage.setItem('festa_profile', JSON.stringify(_profile));
          }
          onLogin && onLogin();
        }).catch(() => onLogin && onLogin());
      }
      return;
    }
    if (typeof google === 'undefined') { setTimeout(() => init(onLogin), 200); return; }
    _initClient();
  }

  function _initClient() {
    _tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.CLIENT_ID,
      scope:     CONFIG.SCOPES,
      callback:  async (resp) => {
        if (resp.error || !resp.access_token) return;
        _token = resp.access_token;
        sessionStorage.setItem('festa_token', _token);
        // Carregar perfil
        try {
          const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { 'Authorization': 'Bearer ' + _token }
          });
          _profile = await res.json();
          sessionStorage.setItem('festa_profile', JSON.stringify(_profile));
        } catch {}
        _onLogin && _onLogin();
      },
    });
  }

  function login() {
    if (!_tokenClient) _initClient();
    _tokenClient.requestAccessToken({});
  }

  function refreshToken() {
    return new Promise((resolve, reject) => {
      if (!_tokenClient) { reject(new Error('No client')); return; }
      const orig = _tokenClient.callback;
      _tokenClient.callback = (resp) => {
        _tokenClient.callback = orig;
        if (resp.error || !resp.access_token) { reject(new Error(resp.error)); return; }
        _token = resp.access_token;
        sessionStorage.setItem('festa_token', _token);
        resolve(_token);
      };
      _tokenClient.requestAccessToken({ prompt: '' });
    });
  }

  function getToken()   { return _token; }
  function getProfile() { return _profile; }
  function isLoggedIn() { return !!_token; }

  return { init, login, getToken, getProfile, isLoggedIn, refreshToken };
})();
