'use client'
import { type MergeTarget, PersonMergeButton } from './person-merge-button'
import { PersonNameEditor } from './person-name-editor'
import { useState } from 'react'

/** 인물 상세 헤더의 오른쪽 액션. 이름을 고치는 동안에는 합치기 버튼을 숨긴다 —
 *  헤더 오른쪽은 줄어들지 않아서, 둘이 나란히 있으면 좁은 화면에서 저장·취소 버튼이
 *  화면 밖으로 밀려난다. */
export function PersonHeaderActions({
  personId,
  initialName,
  mergeTargets,
}: {
  personId: string
  initialName: string | null
  mergeTargets: MergeTarget[]
}) {
  const [editing, setEditing] = useState(false)
  return (
    <div className="flex min-w-0 items-center gap-2">
      {!editing && <PersonMergeButton sourceId={personId} targets={mergeTargets} />}
      <PersonNameEditor
        personId={personId}
        initialName={initialName}
        onEditingChange={setEditing}
      />
    </div>
  )
}
