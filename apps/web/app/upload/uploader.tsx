'use client'
import Uppy from '@uppy/core'
import Dashboard from '@uppy/react/dashboard'
import Tus from '@uppy/tus'
import { useEffect, useState } from 'react'
import '@uppy/core/css/style.css'
import '@uppy/dashboard/css/style.css'

export function Uploader() {
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
    return () => {
      uppy.destroy()
    }
  }, [uppy])

  return <Dashboard uppy={uppy} proudlyDisplayPoweredByUppy={false} height={420} />
}
