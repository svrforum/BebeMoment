import { redirect } from 'next/navigation'

// `/story/new` 는 이제 별도 페이지를 두지 않는다. 타임라인 상단 컴포저로
// 통합됐다. 해시(`#composer`)를 보고 컴포저가 자동 펼침 + 스크롤한다.
export default function NewStoryRedirect() {
  redirect('/timeline#composer')
}
