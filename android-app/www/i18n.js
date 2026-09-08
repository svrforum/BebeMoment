/* bebe Android shell — 로컬 번들 페이지(온보딩·가족 전환)의 문자열 테이블.

   이 두 페이지는 원격 서버가 아니라 앱 안에 들어 있어 웹앱의 next-intl 카탈로그를
   쓸 수 없다. 기기 언어가 영어면 영어, 그 외에는 한국어(기본)로 고른다 — 웹앱이
   ko/en 을 내보내는 것과 눈높이를 맞춘다. */
;(function () {
  var STRINGS = {
    ko: {
      'onboarding.title': '서버 연결',
      'onboarding.subtitle': '가족 서버 주소를 입력하세요',
      'onboarding.connect': '연결',
      'onboarding.connectAnyway': '그래도 연결',
      'onboarding.connecting': '연결 중…',
      'onboarding.loading': '불러오는 중…',
      'onboarding.checking': '서버 확인 중…',
      'onboarding.needUrl': '주소를 입력해주세요.',
      'onboarding.checkFailed': '서버 확인에 실패했어요. 주소가 맞다면 "그래도 연결"을 눌러보세요.',
      'onboarding.prevCheckFailed': '이전 서버 확인에 실패했어요.',
      'accounts.title': '가족 전환',
      'accounts.subtitle': '연결된 가족을 선택하거나 새로 추가하세요',
      'accounts.current': '현재',
      'accounts.add': '+ 가족 추가',
      'accounts.close': '닫기',
      'accounts.removeConfirm': '"{name}" 가족을 목록에서 제거할까요?',
      'accounts.addTitle': '가족 추가',
      'accounts.addSubtitle': '추가할 가족 서버 주소를 입력하세요',
      'accounts.connect': '연결',
      'accounts.cancel': '취소',
      'accounts.needUrl': '주소를 입력해주세요.',
      'accounts.checking': '서버 확인 중…',
      'accounts.checkFailed': '서버 확인 실패. 주소가 맞다면 "그래도 추가"를 눌러보세요.',
      'accounts.addAnyway': '그래도 추가',
    },
    en: {
      'onboarding.title': 'Connect to a server',
      'onboarding.subtitle': 'Enter your family server address',
      'onboarding.connect': 'Connect',
      'onboarding.connectAnyway': 'Connect anyway',
      'onboarding.connecting': 'Connecting…',
      'onboarding.loading': 'Loading…',
      'onboarding.checking': 'Checking the server…',
      'onboarding.needUrl': 'Please enter an address.',
      'onboarding.checkFailed':
        'Could not reach the server. If the address is right, tap "Connect anyway".',
      'onboarding.prevCheckFailed': 'Could not reach the previous server.',
      'accounts.title': 'Switch family',
      'accounts.subtitle': 'Pick a connected family, or add a new one',
      'accounts.current': 'Current',
      'accounts.add': '+ Add a family',
      'accounts.close': 'Close',
      'accounts.removeConfirm': 'Remove "{name}" from the list?',
      'accounts.addTitle': 'Add a family',
      'accounts.addSubtitle': 'Enter the server address of the family to add',
      'accounts.connect': 'Connect',
      'accounts.cancel': 'Cancel',
      'accounts.needUrl': 'Please enter an address.',
      'accounts.checking': 'Checking the server…',
      'accounts.checkFailed':
        'Could not reach the server. If the address is right, tap "Add anyway".',
      'accounts.addAnyway': 'Add anyway',
    },
  }

  function pickLang() {
    var langs = []
    try {
      if (navigator.languages && navigator.languages.length) langs = [].slice.call(navigator.languages)
      else if (navigator.language) langs = [navigator.language]
    } catch (e) {
      langs = []
    }
    for (var i = 0; i < langs.length; i++) {
      var l = String(langs[i] || '').toLowerCase()
      if (l.indexOf('ko') === 0) return 'ko'
      if (l.indexOf('en') === 0) return 'en'
    }
    return 'ko'
  }

  var lang = pickLang()
  try {
    document.documentElement.lang = lang
  } catch (e) {
    // lang 속성 못 붙여도 문자열 선택에는 영향 없다.
  }

  window.bebeI18n = {
    lang: lang,
    /** 없는 키는 한국어로, 그것도 없으면 키 자체를 돌려준다(화면이 비지 않게). */
    t: function (key, vars) {
      var s = STRINGS[lang][key]
      if (s === undefined) s = STRINGS.ko[key]
      if (s === undefined) return key
      if (vars) {
        Object.keys(vars).forEach(function (k) {
          s = s.split('{' + k + '}').join(vars[k])
        })
      }
      return s
    },
  }
})()
