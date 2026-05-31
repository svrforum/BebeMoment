/* bebe Android shell — 다중 계정(여러 가족) 관리·전환.
   로컬 번들 페이지라 Capacitor 브리지(Preferences)가 동작한다. 원격 서버 페이지의
   "가족 이름" 탭이 /__bebe/switch 로 가면 네이티브가 이 페이지를 띄운다. */
;(function () {
  var ACTIVE_KEY = 'serverUrl'
  var ACCOUNTS_KEY = 'bebeAccounts'
  var app = document.getElementById('app')

  function prefs() {
    return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Preferences
  }
  function pget(key) {
    var p = prefs()
    if (!p) return Promise.resolve(null)
    return p.get({ key: key }).then(function (r) {
      return r && r.value ? r.value : null
    })
  }
  function pset(key, value) {
    var p = prefs()
    if (!p) return Promise.resolve()
    return p.set({ key: key, value: value })
  }

  function getAccounts() {
    return pget(ACCOUNTS_KEY).then(function (raw) {
      if (!raw) return []
      try {
        var list = JSON.parse(raw)
        return Array.isArray(list) ? list.filter(function (a) { return a && a.url }) : []
      } catch (e) {
        return []
      }
    })
  }
  function setAccounts(list) {
    return pset(ACCOUNTS_KEY, JSON.stringify(list))
  }

  function normalize(raw) {
    var u = (raw || '').trim()
    if (!u) return ''
    if (!/^https?:\/\//.test(u)) u = 'https://' + u
    return u.replace(/\/+$/, '')
  }
  function domainOf(url) {
    try {
      return new URL(url).host
    } catch (e) {
      return (url || '').replace(/^https?:\/\//, '').replace(/\/+$/, '')
    }
  }
  function reachable(url) {
    var ctrl = new AbortController()
    var timer = setTimeout(function () {
      ctrl.abort()
    }, 6000)
    return fetch(url + '/api/health', { method: 'GET', mode: 'no-cors', signal: ctrl.signal })
      .then(function () { return true })
      .catch(function () { return false })
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

  var GHOST_BTN =
    'margin-top:10px;width:100%;padding:13px;border:1px solid #3f3f46;border-radius:999px;background:transparent;color:inherit;font-size:15px;font-weight:500'

  function goTo(url) {
    pset(ACTIVE_KEY, url).then(function () {
      window.location.href = url
    })
  }

  function render() {
    Promise.all([getAccounts(), pget(ACTIVE_KEY)]).then(function (res) {
      var list = res[0]
      var active = res[1]
      clear()
      app.append(
        el('h1', { style: 'font-size:24px;font-weight:800;margin:0 0 4px', textContent: '가족 전환' }),
        el('p', {
          style: 'color:#71717a;margin:0 0 22px;font-size:14px',
          textContent: '연결된 가족을 선택하거나 새로 추가하세요',
        }),
      )

      list.forEach(function (acc) {
        var isActive = active && acc.url === active
        var title = acc.name && acc.name.trim() ? acc.name : domainOf(acc.url)
        var row = el('div', {
          style:
            'display:flex;align-items:center;gap:12px;padding:14px 16px;margin-bottom:10px;border-radius:16px;' +
            'border:1px solid ' + (isActive ? '#6b8afd' : '#3f3f4633') + ';' +
            'background:' + (isActive ? '#6b8afd14' : 'transparent') + ';',
        })
        var info = el('div', { style: 'flex:1;min-width:0', onclick: function () { goTo(acc.url) } }, [
          el('div', {
            style: 'font-size:16px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis',
            textContent: title,
          }),
          el('div', {
            style: 'font-size:12px;color:#9a9aa0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis',
            textContent: domainOf(acc.url),
          }),
        ])
        row.append(info)
        if (isActive) {
          row.append(el('span', { style: 'color:#6b8afd;font-size:13px;font-weight:700', textContent: '현재' }))
        }
        row.append(
          el('button', {
            style:
              'flex:none;width:30px;height:30px;border:0;border-radius:999px;background:transparent;' +
              'color:#9a9aa0;font-size:18px;line-height:1',
            textContent: '×',
            onclick: function (e) {
              e.stopPropagation()
              confirmRemove(acc)
            },
          }),
        )
        app.append(row)
      })

      app.append(
        el('button', {
          style: GHOST_BTN,
          textContent: '+ 가족 추가',
          onclick: addFlow,
        }),
      )
      if (active) {
        app.append(
          el('button', {
            style: GHOST_BTN + ';margin-top:18px;border:0;color:#71717a',
            textContent: '닫기',
            onclick: function () { window.location.href = active },
          }),
        )
      }
    })
  }

  function confirmRemove(acc) {
    var label = acc.name && acc.name.trim() ? acc.name : domainOf(acc.url)
    if (!window.confirm('"' + label + '" 가족을 목록에서 제거할까요?')) return
    Promise.all([getAccounts(), pget(ACTIVE_KEY)]).then(function (res) {
      var list = res[0].filter(function (a) { return a.url !== acc.url })
      var active = res[1]
      setAccounts(list).then(function () {
        if (active === acc.url) {
          if (list.length > 0) goTo(list[0].url)
          else pset(ACTIVE_KEY, '').then(function () { window.location.href = 'index.html?reset=1' })
        } else {
          render()
        }
      })
    })
  }

  function addFlow() {
    clear()
    var input = el('input', {
      type: 'url',
      inputMode: 'url',
      autocapitalize: 'off',
      autocorrect: 'off',
      spellcheck: false,
      placeholder: 'bebe.example.com',
      style:
        'width:100%;padding:14px 16px;border:1px solid #d4d4d8;border-radius:14px;font-size:16px;background:transparent;color:inherit',
    })
    var msg = el('p', { style: 'color:#ef4444;margin:10px 0 0;font-size:14px;min-height:1px', textContent: '' })
    function submit(force) {
      var url = normalize(input.value)
      if (!url) { msg.textContent = '주소를 입력해주세요.'; return }
      msg.textContent = ''
      var doAdd = function () {
        getAccounts().then(function (list) {
          if (!list.some(function (a) { return a.url === url })) list.push({ url: url, name: '' })
          setAccounts(list).then(function () { goTo(url) })
        })
      }
      if (force) return doAdd()
      msg.style.color = '#71717a'
      msg.textContent = '서버 확인 중…'
      reachable(url).then(function (ok) {
        if (ok) return doAdd()
        msg.style.color = '#ef4444'
        msg.textContent = '서버 확인 실패. 주소가 맞다면 "그래도 추가"를 눌러보세요.'
        if (!document.getElementById('force')) {
          app.append(el('button', { id: 'force', style: GHOST_BTN, textContent: '그래도 추가', onclick: function () { submit(true) } }))
        }
      })
    }
    app.append(
      el('h1', { style: 'font-size:22px;font-weight:800;margin:0 0 6px', textContent: '가족 추가' }),
      el('p', { style: 'color:#71717a;margin:0 0 20px;font-size:14px', textContent: '추가할 가족 서버 주소를 입력하세요' }),
      input,
      el('button', {
        style: 'margin-top:16px;width:100%;padding:15px;border:0;border-radius:999px;background:#6b8afd;color:#fff;font-size:16px;font-weight:600',
        textContent: '연결',
        onclick: function () { submit(false) },
      }),
      el('button', { style: GHOST_BTN, textContent: '취소', onclick: render }),
      msg,
    )
    input.focus()
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render)
  else render()
})()
