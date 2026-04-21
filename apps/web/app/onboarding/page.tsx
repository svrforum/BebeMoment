import { getAuth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { completeOnboarding } from './actions'

export default async function OnboardingPage() {
  const { user } = await getAuth()
  if (!user) redirect('/login')

  return (
    <main style={{ maxWidth: 420, margin: '64px auto', padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>가족 만들기</h1>
      <p style={{ color: 'var(--base-500)', marginTop: 8, fontSize: 14 }}>
        첫 가족과 아기를 등록하면 타임라인이 시작돼요.
      </p>
      <form
        action={completeOnboarding}
        className="card"
        style={{ marginTop: 24, display: 'grid', gap: 12 }}
      >
        <label>
          <div style={{ fontSize: 13, marginBottom: 6 }}>가족 이름</div>
          <input name="familyName" required placeholder="예: 김씨네 가족" />
        </label>
        <label>
          <div style={{ fontSize: 13, marginBottom: 6 }}>아기 이름</div>
          <input name="babyName" required placeholder="예: 예준" />
        </label>
        <label>
          <div style={{ fontSize: 13, marginBottom: 6 }}>생년월일</div>
          <input name="birthDate" type="date" required />
        </label>
        <button type="submit">시작하기</button>
      </form>
    </main>
  )
}
