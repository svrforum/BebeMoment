import { createBabyAction } from './actions'

export default function NewBabyPage() {
  return (
    <main style={{ maxWidth: 420, margin: '64px auto', padding: 24 }}>
      <a href="/babies">← 뒤로</a>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginTop: 12 }}>아기 추가</h1>
      <form
        action={createBabyAction}
        className="card"
        style={{ marginTop: 24, display: 'grid', gap: 12 }}
      >
        <label>
          <div style={{ fontSize: 13, marginBottom: 6 }}>이름</div>
          <input name="name" required />
        </label>
        <label>
          <div style={{ fontSize: 13, marginBottom: 6 }}>생년월일</div>
          <input name="birthDate" type="date" required />
        </label>
        <button type="submit">추가</button>
      </form>
    </main>
  )
}
