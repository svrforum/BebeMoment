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

  function reachable(url) {
    return fetch(url + '/api/health', { method: 'GET' })
      .then(function (res) {
        return res.ok
      })
      .catch(function () {
        return false
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

  function renderForm(error, prefill) {
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
    var button = el(
      'button',
      {
        style:
          'margin-top:16px;width:100%;padding:15px;border:0;border-radius:999px;background:#111;color:#fff;font-size:16px;font-weight:600',
        onclick: function () {
          submit(input.value)
        },
      },
      [document.createTextNode('연결')],
    )
    app.append(
      el('h1', { style: 'font-size:24px;font-weight:800;margin:0 0 6px' }, [
        document.createTextNode('서버 연결'),
      ]),
      el('p', { style: 'color:#71717a;margin:0 0 24px;font-size:15px' }, [
        document.createTextNode('가족 서버 주소를 입력하세요'),
      ]),
    )
    if (error) {
      app.append(
        el('p', { style: 'color:#ef4444;margin:0 0 12px;font-size:14px' }, [
          document.createTextNode(error),
        ]),
      )
    }
    app.append(input, button)
    input.focus()
  }

  function renderConnecting(label) {
    clear()
    app.append(
      el('p', { style: 'color:#71717a;font-size:15px;text-align:center;margin-top:40px' }, [
        document.createTextNode(label || '연결 중…'),
      ]),
    )
  }

  function submit(raw) {
    var url = normalize(raw)
    if (!url) return renderForm('주소를 입력해주세요.', raw)
    renderConnecting('서버 확인 중…')
    reachable(url).then(function (ok) {
      if (!ok) return renderForm('서버에 연결할 수 없어요. 주소를 확인해주세요.', raw)
      setServerUrl(url).then(function () {
        window.location.href = url
      })
    })
  }

  function boot() {
    renderConnecting('불러오는 중…')
    getServerUrl().then(function (saved) {
      if (!saved) return renderForm()
      reachable(saved).then(function (ok) {
        if (ok) window.location.href = saved
        else renderForm('이전 서버에 연결할 수 없어요.', saved)
      })
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot)
  } else {
    boot()
  }
})()
