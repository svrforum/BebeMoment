import { ChevronDown, ExternalLink } from 'lucide-react'

/**
 * 관리자용 Firebase(FCM) 설정 단계 안내. 안드로이드 앱 푸시를 켜려면 두 가지가
 * 필요하다: (1) 서버가 발송에 쓰는 서비스 계정 JSON(비밀), (2) 앱이 토큰 발급에
 * 쓰는 firebaseConfig(공개). 콘솔에서 각각 어디서 받아 어디에 붙여넣는지 정리.
 * 콘솔 UI 변동에 견디도록 "어느 메뉴" 수준으로 기술.
 */

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-base-100 text-[11px] font-bold text-base-500 dark:bg-base-800 dark:text-base-300">
        {n}
      </span>
      <span className="flex-1 text-[13px] leading-relaxed text-base-700 dark:text-base-200">
        {children}
      </span>
    </li>
  )
}

function GroupTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 mb-2 text-[13px] font-semibold text-base-900 first:mt-0 dark:text-base-50">
      {children}
    </div>
  )
}

export function FirebaseSetupGuide() {
  return (
    <details className="group rounded-xl border border-base-200/70 bg-base-50/60 dark:border-base-800/70 dark:bg-base-800/30">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-3 text-[13.5px] font-medium text-base-800 dark:text-base-100">
        <ChevronDown
          className="h-4 w-4 text-base-400 transition-transform group-open:rotate-180"
          strokeWidth={2}
        />
        Firebase 설정 방법 (처음 한 번, 단계별 안내)
      </summary>

      <div className="border-t border-base-200/70 px-4 py-3.5 dark:border-base-800/70">
        <p className="mb-3 text-[12.5px] leading-relaxed text-base-500">
          안드로이드 앱으로 푸시를 보내려면 무료 Firebase 프로젝트가 필요해요. 아래 두 가지(서버용
          서비스 계정 + 앱용 설정값)를 콘솔에서 받아 이 페이지에 붙여넣으면 끝이에요.
        </p>

        <a
          href="https://console.firebase.google.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="mb-1 inline-flex items-center gap-1.5 rounded-lg bg-point-500/10 px-3 py-1.5 text-[13px] font-medium text-point-600 transition-colors hover:bg-point-500/15 dark:text-point-300"
        >
          Firebase 콘솔 열기
          <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
        </a>

        <GroupTitle>1. 프로젝트 만들기</GroupTitle>
        <ol className="space-y-2">
          <Step n={1}>
            Firebase 콘솔에서 <b>프로젝트 추가</b>를 눌러요. 이름은 자유(예: bebe).
          </Step>
          <Step n={2}>
            Google 애널리틱스는 꺼도 돼요. <b>프로젝트 만들기</b>를 눌러 완료해요.
          </Step>
        </ol>

        <GroupTitle>2. 서버용 — 서비스 계정 키 (비밀)</GroupTitle>
        <ol className="space-y-2">
          <Step n={1}>
            좌측 상단 톱니바퀴 ⚙️ → <b>프로젝트 설정</b> → <b>서비스 계정</b> 탭으로 가요.
          </Step>
          <Step n={2}>
            <b>새 비공개 키 생성</b> → <b>키 생성</b>을 누르면 JSON 파일이 다운로드돼요.
          </Step>
          <Step n={3}>
            그 JSON 파일을 열어 내용을 통째로 복사해, 위 <b>서비스 계정 JSON</b> 칸에 붙여넣고{' '}
            <b>저장</b>해요.
          </Step>
          <Step n={4}>
            <b>Cloud Messaging</b> 탭에서 <b>Firebase Cloud Messaging API (V1)</b>가 사용 설정인지
            확인해요(보통 기본 켜짐).
          </Step>
        </ol>
        <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[12px] leading-relaxed text-amber-700 dark:text-amber-300">
          ⚠️ 서비스 계정 JSON은 <b>비밀번호 같은 비밀</b>이에요. 채팅·메일로 공유하지 말고 여기에만
          붙여넣어요(서버에 암호화 저장돼요).
        </p>

        <GroupTitle>3. 앱용 — Firebase 설정값 (공개)</GroupTitle>
        <ol className="space-y-2">
          <Step n={1}>
            <b>프로젝트 설정</b> → <b>일반</b> 탭 → <b>내 앱</b>에서 <b>안드로이드 아이콘</b>을 눌러
            앱을 추가해요.
          </Step>
          <Step n={2}>
            <b>Android 패키지 이름</b>에 정확히{' '}
            <code className="rounded bg-base-100 px-1 dark:bg-base-800">im.bebe.app</code>를
            입력해요(닉네임 자유, SHA-1은 비워도 돼요) → <b>앱 등록</b>.
          </Step>
          <Step n={3}>
            <b>google-services.json</b> 파일을 다운로드해요. 메모장으로 열면 아래 네 값이 들어
            있어요:
            <ul className="mt-1.5 space-y-1 text-[12.5px]">
              <li>
                • <code className="rounded bg-base-100 px-1 dark:bg-base-800">apiKey</code> ={' '}
                <code className="text-[11px]">client[0].api_key[0].current_key</code>
              </li>
              <li>
                • <code className="rounded bg-base-100 px-1 dark:bg-base-800">appId</code> ={' '}
                <code className="text-[11px]">client[0].client_info.mobilesdk_app_id</code>{' '}
                (1:…:android:…)
              </li>
              <li>
                • <code className="rounded bg-base-100 px-1 dark:bg-base-800">projectId</code> ={' '}
                <code className="text-[11px]">project_info.project_id</code>
              </li>
              <li>
                •{' '}
                <code className="rounded bg-base-100 px-1 dark:bg-base-800">messagingSenderId</code>{' '}
                = <code className="text-[11px]">project_info.project_number</code>
              </li>
            </ul>
          </Step>
          <Step n={4}>
            위 <b>앱 Firebase 설정</b> 칸에 아래 형태로 네 값을 붙여넣고 <b>저장</b>해요:
            <pre className="mt-1.5 overflow-x-auto rounded-lg bg-base-900 px-3 py-2 text-[11px] leading-relaxed text-base-100 dark:bg-base-950">{`{
  "apiKey": "AIza…",
  "appId": "1:1234567890:android:abcd…",
  "projectId": "bebe-xxxxx",
  "messagingSenderId": "1234567890"
}`}</pre>
          </Step>
        </ol>

        <GroupTitle>4. 마무리</GroupTitle>
        <ol className="space-y-2">
          <Step n={1}>
            이 페이지에서 <b>안드로이드 앱 푸시(FCM)</b> 토글과 맨 위 <b>알림 마스터</b>를 켜요.
          </Step>
          <Step n={2}>
            가족 구성원은 앱 <b>설정 → 알림 → 푸시 알림</b>에서 알림을 켜고{' '}
            <b>테스트 알림 보내기</b>로 확인하면 돼요.
          </Step>
        </ol>
      </div>
    </details>
  )
}
