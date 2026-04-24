'use client'
import Uppy from '@uppy/core'
import '@uppy/core/css/style.css'
import '@uppy/dashboard/css/style.css'
import Dashboard from '@uppy/react/dashboard'
import Tus from '@uppy/tus'
import { useEffect, useState } from 'react'

export function UploadDashboard({ onComplete }: { onComplete: () => void }) {
  const [uppy] = useState(() =>
    new Uppy({
      restrictions: {
        maxFileSize: 2 * 1024 * 1024 * 1024,
        allowedFileTypes: ['image/*', 'video/*'],
      },
      autoProceed: true,
    }).use(Tus, {
      endpoint: '/api/upload',
      chunkSize: 8 * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000],
    }),
  )

  useEffect(() => {
    uppy.on('complete', onComplete)
    if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
      ;(window as unknown as { __uppy?: typeof uppy }).__uppy = uppy
    }
    return () => {
      uppy.off('complete', onComplete)
    }
  }, [uppy, onComplete])

  return <Dashboard uppy={uppy} proudlyDisplayPoweredByUppy={false} height={380} />
}
