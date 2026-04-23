type User = { id: string; displayName: string; avatarPath: string | null }

export function LikerAvatars({ users }: { users: User[] }) {
  if (users.length === 0) return null
  const shown = users.slice(0, 5)
  const rest = users.length - shown.length
  const names = users.map((u) => u.displayName)

  const labelText =
    names.length <= 2
      ? `${names.join(', ')} 님이 좋아함`
      : `${names.slice(0, 2).join(', ')} 외 ${names.length - 2}명이 좋아함`

  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {shown.map((u) => (
          <div
            key={u.id}
            title={u.displayName}
            className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-base-0 bg-base-200 text-xs font-medium text-base-700 dark:border-base-900 dark:bg-base-800 dark:text-base-300"
          >
            {u.avatarPath ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/media/${u.avatarPath}`}
                alt=""
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              u.displayName.slice(0, 1)
            )}
          </div>
        ))}
        {rest > 0 && (
          <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-base-0 bg-base-100 text-xs dark:border-base-900 dark:bg-base-800">
            +{rest}
          </div>
        )}
      </div>
      <span className="text-xs text-base-500">{labelText}</span>
    </div>
  )
}
