/* bebe Android shell — server URL onboarding.
   Pure vanilla JS using the global Capacitor bridge (no bundler). */
;(function () {
  var KEY = 'serverUrl'
  var app = document.getElementById('app')

  function prefs() {
    return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Preferences
  }

  function getServerUrl() {
    var p = prefs()
    if (!p) return Promise.resolve(null)
    return p.get({ key: KEY }).then(function (r) {
      return r && r.value ? r.value : null
    })
  }

  function setServerUrl(url) {
    var p = prefs()
    if (!p) return Promise.resolve()
    return p.set({ key: KEY, value: url })
  }

  function normalize(raw) {
    var u = (raw || '').trim()
    if (!u) return ''
    if (!/^https?:\/\//.test(u)) u = 'https://' + u
    return u.replace(/\/+$/, '')
  }

  // Health check from the app's https://localhost page is cross-origin, so a
  // normal fetch would be blocked by CORS even when the server is reachable
  // (a browser visit is a top-level navigation, not CORS-gated). Use no-cors:
  // the request still goes out, and if it *resolves* (opaque response) the
  // server answered → reachable. Only a network error rejects.
  function reachable(url) {
    var ctrl = new AbortController()
    var timer = setTimeout(function () {
      ctrl.abort()
    }, 6000)
    return fetch(url + '/api/health', { method: 'GET', mode: 'no-cors', signal: ctrl.signal })
      .then(function () {
        return true
      })
      .catch(function () {
        return false
      })
      .then(function (ok) {
        clearTimeout(timer)
        return ok
      })
  }

  function el(tag, props, children) {
    var node = document.createElement(tag)
    if (props) {
      Object.keys(props).forEach(function (k) {
        if (k === 'style') node.setAttribute('style', props[k])
        else if (k === 'onclick') node.addEventListener('click', props[k])
        else node[k] = props[k]
      })
    }
    ;(children || []).forEach(function (c) {
      node.append(c)
    })
    return node
  }

  function clear() {
    while (app.firstChild) app.removeChild(app.firstChild)
  }

  var PRIMARY_BTN =
    'margin-top:16px;width:100%;padding:15px;border:0;border-radius:999px;background:#111;color:#fff;font-size:16px;font-weight:600'
  var GHOST_BTN =
    'margin-top:10px;width:100%;padding:13px;border:1px solid #3f3f46;border-radius:999px;background:transparent;color:inherit;font-size:15px;font-weight:500'

  // forceUrl: when set, shows a "connect anyway" button (for false-negative checks).
  function renderForm(error, prefill, forceUrl) {
    clear()
    var input = el('input', {
      id: 'url',
      type: 'url',
      inputMode: 'url',
      autocapitalize: 'off',
      autocorrect: 'off',
      spellcheck: false,
      value: prefill || '',
      placeholder: 'bebe.example.com',
      style:
        'width:100%;padding:14px 16px;border:1px solid #d4d4d8;border-radius:14px;font-size:16px;background:transparent;color:inherit',
    })
    var connectBtn = el('button', {
      style: PRIMARY_BTN,
      textContent: '연결',
      onclick: function () {
        submit(input.value)
      },
    })
    app.append(
      el('h1', { style: 'font-size:24px;font-weight:800;margin:0 0 6px', textContent: '서버 연결' }),
      el('p', {
        style: 'color:#71717a;margin:0 0 24px;font-size:15px',
        textContent: '가족 서버 주소를 입력하세요',
      }),
    )
    if (error) {
      app.append(el('p', { style: 'color:#ef4444;margin:0 0 12px;font-size:14px', textContent: error }))
    }
    app.append(input, connectBtn)
    if (forceUrl) {
      app.append(
        el('button', {
          style: GHOST_BTN,
          textContent: '그래도 연결',
          onclick: function () {
            navigateTo(forceUrl)
          },
        }),
      )
    }
    input.focus()
  }

  function renderConnecting(label) {
    clear()
    app.append(
      el('p', {
        style: 'color:#71717a;font-size:15px;text-align:center;margin-top:40px',
        textContent: label || '연결 중…',
      }),
    )
  }

  function navigateTo(url) {
    renderConnecting('연결 중…')
    setServerUrl(url).then(function () {
      window.location.href = url
    })
  }

  function submit(raw) {
    var url = normalize(raw)
    if (!url) return renderForm('주소를 입력해주세요.', raw)
    renderConnecting('서버 확인 중…')
    reachable(url).then(function (ok) {
      if (ok) return navigateTo(url)
      renderForm('서버 확인에 실패했어요. 주소가 맞다면 "그래도 연결"을 눌러보세요.', raw, url)
    })
  }

  function boot() {
    renderConnecting('불러오는 중…')
    getServerUrl().then(function (saved) {
      if (!saved) return renderForm()
      reachable(saved).then(function (ok) {
        if (ok) navigateTo(saved)
        else renderForm('이전 서버 확인에 실패했어요.', saved, saved)
      })
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot)
  } else {
    boot()
  }
})()
