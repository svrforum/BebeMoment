'use client'
import Uppy from '@uppy/core'
import '@uppy/core/css/style.css'
import '@uppy/dashboard/css/style.css'
import Dashboard from '@uppy/react/dashboard'
import Tus from '@uppy/tus'
import { useEffect, useState } from 'react'
import { startUpload } from './actions'

type UppyFileMeta = { uploadToken?: string }

export function UploadDashboard({ onComplete }: { onComplete: () => void }) {
  const [uppy] = useState(() => {
    const u = new Uppy<UppyFileMeta, { xhr: XMLHttpRequest }>({
      restrictions: {
        maxFileSize: 2 * 1024 * 1024 * 1024,
        allowedFileTypes: ['image/*', 'video/*'],
      },
      autoProceed: true,
    }).use(Tus, {
      chunkSize: 8 * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000],
      headers: (file) => {
        const token = file.meta?.uploadToken
        return token ? { authorization: `Bearer ${token}` } : {}
      },
    })

    u.addPreProcessor(async (fileIDs) => {
      for (const id of fileIDs) {
        const file = u.getFile(id)
        if (!file) continue
        if (file.meta?.uploadToken) continue
        const init = await startUpload({
          mime: file.type ?? 'application/octet-stream',
          sizeBytes: file.size ?? 0,
          originalName: file.name ?? `upload-${id}`,
        })
        u.setFileMeta(id, { uploadToken: init.uploadToken })
        u.setFileState(id, {
          tus: { uploadUrl: init.tusUploadUrl },
        })
      }
    })

    return u
  })

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
