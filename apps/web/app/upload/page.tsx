import { Uploader } from './uploader'

export default function UploadPage() {
  return (
    <main style={{ maxWidth: 720, margin: '24px auto', padding: 24 }}>
      <a href="/">← 홈</a>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginTop: 12 }}>업로드</h1>
      <p style={{ color: 'var(--base-500)', fontSize: 14 }}>
        사진과 영상을 올려주세요. 업로드가 끝나면 썸네일 생성이 백그라운드에서 진행돼요.
      </p>
      <div style={{ marginTop: 16 }}>
        <Uploader />
      </div>
    </main>
  )
}
