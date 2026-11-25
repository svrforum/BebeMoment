'use client'
import { useToast } from '@/lib/toast'
import { useTranslations } from 'next-intl'
import { useCallback, useRef } from 'react'
import {
  STORY_SUBMIT_NAMESPACE,
  type StorySubmitFlow,
  type StorySubmitJob,
  type StorySubmitResult,
  storySubmitFailureTitle,
  submitStory,
} from './story-submit'
import { useUploadManager } from './upload-manager'

/** `submitStory` 를 업로드 매니저에 묶고, 실패하면 토스트를 띄운다. */
export function useStorySubmit(
  flow: StorySubmitFlow,
): <T>(job: StorySubmitJob<T>) => Promise<StorySubmitResult<T>> {
  const t = useTranslations(STORY_SUBMIT_NAMESPACE[flow])
  const { files, startStagedUploads, abortUploads, pauseAutoDismiss } = useUploadManager()
  const toast = useToast()
  // assetId 를 기다리는 동안 닫힌 files 가 아니라 매 렌더의 목록을 읽게.
  const filesRef = useRef(files)
  filesRef.current = files

  return useCallback(
    async <T>(job: StorySubmitJob<T>): Promise<StorySubmitResult<T>> => {
      const r = await submitStory(
        { ...job, flow, notReadyMessage: t('uploadNotReady') },
        { readFiles: () => filesRef.current, startStagedUploads, abortUploads, pauseAutoDismiss },
      )
      if (!r.ok) toast({ title: storySubmitFailureTitle(r, t), variant: 'danger' })
      return r
    },
    [flow, t, toast, startStagedUploads, abortUploads, pauseAutoDismiss],
  )
}
