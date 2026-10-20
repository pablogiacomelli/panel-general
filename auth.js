/* MAHRA · login único de los paneles de Pablo (Panel General y los paneles que embebe).
   Todos viven en pablogiacomelli.github.io, así que la sesión se comparte por localStorage:
   entrás una vez y sirve para todas las pestañas durante 30 días.

   Uso: poner como PRIMER script del <head> de cada panel
     <script src="https://pablogiacomelli.github.io/panel-general/auth.js"></script>
   y nada más. Este archivo:
   - si no hay sesión, tapa la página con el ingreso (POST /webhook/panel-acceso) y, al entrar, la recarga;
   - agrega el header x-mahra-token a todos los fetch a https://n8n.mahra-ai.online/webhook/...;
   - si un flujo responde 401 (sin sesión o usuario no autorizado), vuelve a pedir el ingreso.
   Los flujos validan el token contra panel_sesiones y solo aceptan el usuario pablo.
*/
(function () {
  if (window.MahraAuth) return;
  var LOGIN = 'https://n8n.mahra-ai.online/webhook/panel-acceso';
  var N8N = 'https://n8n.mahra-ai.online/webhook/';
  var KEY = 'mahra_sesion_pablo';
  var sesion = null, overlay = null;

  function valida(s) { return !!(s && s.token && s.vence && Date.parse(s.vence) > Date.now()); }
  function leer() { try { var s = JSON.parse(localStorage.getItem(KEY) || 'null'); return valida(s) ? s : null; } catch (e) { return null; } }
  function guardar(s) { sesion = s; try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch (e) {} }
  sesion = leer();

  // si en otra pestaña o iframe se entra, esta página se recarga con la sesión nueva
  window.addEventListener('storage', function (e) {
    if (e.key !== KEY) return;
    var antes = !!sesion; sesion = leer();
    if (sesion && (!antes || (overlay && !overlay.hidden))) location.reload();
  });

  // fetch con la sesión para los webhooks de n8n
  var fetchOriginal = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf(N8N) !== 0 || url.indexOf(LOGIN) === 0) return fetchOriginal(input, init);
    init = init || {};
    var h = new Headers(init.headers || (typeof input !== 'string' && input.headers) || {});
    h.set('x-mahra-token', sesion ? sesion.token : '');
    init.headers = h;
    return fetchOriginal(input, init).then(function (r) {
      if (r.status === 401) pedir('La sesión venció o no tiene permiso: volvé a entrar.');
      return r;
    });
  };

  function css() {
    if (document.getElementById('mahraAuthCss')) return;
    var st = document.createElement('style'); st.id = 'mahraAuthCss';
    st.textContent =
      '#mahraAuth{position:fixed;inset:0;z-index:2147483000;background:#0f0f0d;display:flex;align-items:center;justify-content:center;padding:16px;font-family:"DM Sans",-apple-system,"Segoe UI",Roboto,sans-serif}' +
      '#mahraAuth[hidden]{display:none}' +
      '#mahraAuth form{background:#171714;border:1px solid rgba(255,255,255,.12);padding:26px;width:min(360px,100%);color:#f0ede8;box-sizing:border-box}' +
      '#mahraAuth h2{margin:0 0 4px;font-family:Fraunces,Georgia,serif;font-weight:300;font-size:22px}' +
      '#mahraAuth h2 em{color:#d4a853;font-style:italic}' +
      '#mahraAuth p{color:#9a9690;font-size:12.5px;margin:0 0 14px;line-height:1.5}' +
      '#mahraAuth label{display:block;font-size:11px;color:#9a9690;margin:12px 0 5px;letter-spacing:.08em;text-transform:uppercase}' +
      '#mahraAuth input{width:100%;box-sizing:border-box;background:#1e1e1a;color:#f0ede8;border:1px solid rgba(255,255,255,.12);padding:10px;font-size:14px;outline:none}' +
      '#mahraAuth input:focus{border-color:#d4a853}' +
      '#mahraAuth button{margin-top:18px;width:100%;background:#d4a853;color:#000;border:none;padding:11px;font-size:13px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer}' +
      '#mahraAuth button:disabled{opacity:.5;cursor:default}' +
      '#mahraAuth .err{color:#e07060;font-size:12.5px;margin-top:10px}';
    (document.head || document.documentElement).appendChild(st);
  }

  function armar() {
    if (overlay) return overlay;
    css();
    overlay = document.createElement('div'); overlay.id = 'mahraAuth'; overlay.hidden = true;
    overlay.innerHTML =
      '<form autocomplete="on"><h2>MAHRA · <em>Paneles</em></h2>' +
      '<p>Entrá con tu usuario de los paneles. Queda abierto 30 días en este equipo y sirve para todas las pestañas.</p>' +
      '<label for="mahraAuthU">Usuario</label><input id="mahraAuthU" name="username" autocomplete="username" autocapitalize="none" spellcheck="false">' +
      '<label for="mahraAuthC">Contraseña</label><input id="mahraAuthC" name="password" type="password" autocomplete="current-password">' +
      '<div class="err" hidden></div><button type="submit">Entrar</button></form>';
    document.body.appendChild(overlay);
    var form = overlay.querySelector('form'), err = overlay.querySelector('.err'), btn = overlay.querySelector('button');
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      btn.disabled = true; btn.textContent = 'Entrando…'; err.hidden = true;
      fetchOriginal(LOGIN, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ usuario: document.getElementById('mahraAuthU').value.trim(), clave: document.getElementById('mahraAuthC').value }) })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (!res || !res.ok) throw new Error((res && res.error) || 'Usuario o contraseña incorrectos');
          guardar({ token: res.token, usuario: res.usuario, vence: res.vence });
          location.reload();
        })
        .catch(function (e) { err.textContent = e.message; err.hidden = false; btn.disabled = false; btn.textContent = 'Entrar'; });
    });
    return overlay;
  }

  function pedir(aviso) {
    guardar(null);
    var go = function () {
      var o = armar(), err = o.querySelector('.err');
      err.hidden = !aviso; err.textContent = aviso || '';
      o.hidden = false;
      setTimeout(function () { var u = document.getElementById('mahraAuthU'); if (u) (u.value ? document.getElementById('mahraAuthC') : u).focus(); }, 50);
    };
    if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
  }

  if (!sesion) pedir();

  window.MahraAuth = {
    token: function () { return sesion ? sesion.token : ''; },
    usuario: function () { return sesion ? sesion.usuario : ''; },
    salir: function () { pedir(); }
  };
})();
