'use client'
import { Trash2, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Zoom } from 'swiper/modules'
import { Swiper, SwiperSlide } from 'swiper/react'
import 'swiper/css'
import 'swiper/css/zoom'
import type { FileRow } from './upload-manager'
import { nextViewerIndex } from './viewer-index'

// 앞뒤 한 장씩만 디코드해 둔다. 스테이징 사진은 원본 해상도라 30~50장을 한꺼번에
// 붙이면 모바일 WebView 의 이미지 메모리가 터진다. 드래그를 시작하면 이웃 슬라이드가
// 이미 보이므로 창은 최소 ±1 이어야 한다.
const PRELOAD = 1

const SLIDE_STYLE = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
} as const

type SwiperLike = {
  activeIndex: number
  slideTo: (index: number, speed?: number, runCallbacks?: boolean) => void
  zoom?: { out: () => void } | undefined
}

function PreviewSlide({
  file,
  isVideo,
  isCurrent,
  load,
}: {
  file: FileRow
  isVideo: boolean
  isCurrent: boolean
  load: boolean
}) {
  const [src, setSrc] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  // data 는 편집(replaceFileData)·자동 최적화로 같은 id 아래에서 통째로 교체된다 →
  // 의존성에 두어야 편집 결과가 반영된다.
  const data = file.data
  useEffect(() => {
    if (!load || !(data instanceof Blob)) return
    const url = URL.createObjectURL(data)
    setSrc(url)
    return () => {
      URL.revokeObjectURL(url)
      setSrc(null)
    }
  }, [data, load])

  // 이웃 슬라이드는 프리로드 창 안에 그대로 살아 있다 — 재생 중이던 영상에서 옆으로
  // 넘기면 화면엔 사진이, 소리는 계속 나는 상태가 된다. 벗어나면 멈춘다.
  useEffect(() => {
    if (!isCurrent) videoRef.current?.pause()
  }, [isCurrent])

  if (!src) return <div className="h-full w-full" />

  if (isVideo) {
    return (
      <video
        ref={videoRef}
        src={src}
        controls
        playsInline
        preload="metadata"
        className="max-h-full max-w-full"
        // 영상 기본 touch-action: auto 는 모바일 WebView 가 가로 터치를 자체 제스처로
        // 가져가 Swiper 까지 안 온다. pan-y 로 좁혀 가로는 Swiper 에 넘긴다.
        style={{ touchAction: 'pan-y' }}
      >
        <track kind="captions" />
      </video>
    )
  }

  // ⚠️ 줌 전용 bare <img> (§12 PictureImage 예외). Swiper Zoom 은 `.swiper-zoom-container`
  // 의 직접 자식 <img> 를 타겟·측정한다 — 래퍼를 끼우면 줌/팬이 어긋난다. 소스도 로컬
  // blob URL 이라 파생물 협상·next/image 자체가 무의미.
  return (
    // biome-ignore lint/performance/noImgElement: Swiper Zoom 직접자식 img 요구 — 위 주석 참조
    <img src={src} alt="" decoding="async" draggable={false} />
  )
}

/** 업로드 전 스테이징한 사진을 전체화면으로 크게 보는 뷰어. 핀치·더블탭 확대,
 *  좌우 스와이프, 그 자리에서 제거까지 — 여러 장 고를 때 쓴다. */
export function UploadPreviewViewer({
  files,
  startId,
  onRemove,
  onClose,
}: {
  files: FileRow[]
  startId: string
  onRemove: (id: string) => void
  onClose: () => void
}) {
  const t = useTranslations('upload')
  const [index, setIndex] = useState(() => {
    const i = files.findIndex((f) => f.id === startId)
    return i < 0 ? 0 : i
  })
  const swiperRef = useRef<SwiperLike | null>(null)

  const total = files.length

  useEffect(() => {
    if (total === 0) onClose()
  }, [total, onClose])

  // Escape 는 여기서 삼킨다. 뷰어를 품은 시트도 window/document 에서 Escape 를 듣고
  // 닫히는데(sheet-shells.tsx 의 데스크톱 모달), 시트가 닫히면 clearStaged 가 스테이징한
  // 사진을 전부 버린다 — 크게 보다가 Escape 한 번에 선택이 통째로 날아간다.
  // capture 단계로 등록해 bubble 단계의 시트 핸들러보다 먼저 잡고 전파를 끊는다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  // 제거로 슬라이드가 줄면 Swiper 의 activeIndex 가 범위를 벗어난 채 남는다.
  // duration 0 + 이벤트 미발행으로 조용히 맞춘다(스와이프로 온 변경은 이미 일치 → no-op).
  // total 은 본문에서 안 읽지만 의도적 트리거 — 슬라이드 제거 후 Swiper 가 translate 로
  // activeIndex 를 다시 계산하는 내부 동작에 기대지 않고 우리가 명시적으로 맞춘다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: total 은 위 사유로 의도적 트리거.
  useEffect(() => {
    const s = swiperRef.current
    if (s && s.activeIndex !== index) s.slideTo(index, 0, false)
  }, [index, total])

  const removeCurrent = useCallback(() => {
    const target = files[index]
    if (!target) return
    const next = nextViewerIndex(total - 1, index)
    // 슬라이드를 떼기 전에 줌을 되돌린다. 제거만으로는 transitionEnd 가 안 나서
    // (같은 슬롯이면 slideTo 가 reset 분기로 조기 반환) Swiper Zoom 이 삭제된 노드를
    // 계속 타겟으로 붙들고, 다음 사진에서 핀치가 먹지 않는다.
    swiperRef.current?.zoom?.out()
    onRemove(target.id)
    if (next === null) onClose()
    else setIndex(next)
  }, [files, index, total, onRemove, onClose])

  // 마지막 한 장을 지운 프레임 — 위 effect 가 onClose 를 부를 때까지 빈 껍데기를 그리지 않는다.
  if (total === 0) return null
  if (typeof document === 'undefined') return null

  // 업로드 시트(vaul/framer)는 transform 으로 애니메이션해 `position:fixed` 의 컨테이닝
  // 블록이 된다 — 시트 안에 그리면 뷰어가 시트 크기에 갇힌다. body 로 포털하고,
  // 시트가 modal 이라 body 에 걸어둔 pointer-events:none 를 여기서 되살린다(§17.19).
  return createPortal(
    <div
      className="fixed inset-x-0 top-0 z-[60] flex flex-col bg-black pointer-events-auto"
      style={{
        height: '100dvh',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="flex shrink-0 items-center justify-between p-4 text-white">
        <button type="button" onClick={onClose} aria-label={t('viewer.close')} className="p-2">
          <X size={22} />
        </button>
        <span className="text-sm font-medium tabular-nums">
          {index + 1} / {total}
        </span>
        <button type="button" onClick={removeCurrent} aria-label={t('remove')} className="p-2">
          <Trash2 size={22} />
        </button>
      </div>

      <div className="min-h-0 flex-1">
        <Swiper
          modules={[Zoom]}
          initialSlide={index}
          slidesPerView={1}
          spaceBetween={0}
          speed={300}
          resistance={true}
          resistanceRatio={0.5}
          threshold={5}
          // Swiper 기본 focusableElements 에 'video' 가 있어 Capacitor WebView 에서
          // 영상이 포커스되면 touchmove 가 short-circuit 돼 스와이프가 죽는다.
          focusableElements="input, select, option, textarea, button, label"
          zoom={{ maxRatio: 4, minRatio: 1, toggle: true }}
          onSwiper={(s) => {
            swiperRef.current = s
          }}
          // transitionEnd 가 아니라 slideChange — 이웃 프리로드 창이 전환 시작과 함께
          // 움직여야 다음 사진이 제때 디코드된다. 여기선 재중앙화를 하지 않아 안전.
          onSlideChange={(s) => setIndex(s.activeIndex)}
          className="h-full w-full"
          style={{ height: '100%', width: '100%' }}
        >
          {files.map((f, i) => {
            const isVideo = f.type.startsWith('video/')
            return (
              <SwiperSlide
                key={f.id}
                // 영상 슬라이드엔 zoom 컨테이너를 만들지 않는다(줌 대상은 <img> 뿐).
                {...(isVideo ? {} : { zoom: true })}
                style={SLIDE_STYLE}
              >
                <PreviewSlide
                  file={f}
                  isVideo={isVideo}
                  isCurrent={i === index}
                  load={Math.abs(i - index) <= PRELOAD}
                />
              </SwiperSlide>
            )
          })}
        </Swiper>
      </div>
    </div>,
    document.body,
  )
}
