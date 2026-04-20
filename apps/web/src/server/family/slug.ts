const KOREAN = /[\u3131-\u318E\uAC00-\uD7A3]/

function rand(n = 6): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'
  let s = ''
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

export function toSlug(input: string): string {
  if (KOREAN.test(input)) {
    const stripped = input.replace(/[\u3131-\u318E\uAC00-\uD7A3\s]+/g, '').toLowerCase()
    const latin = stripped
      .replace(/['\u2018\u2019]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    return latin ? `${latin}-${rand(4)}` : `family-${rand()}`
  }
  const s = input
    .toLowerCase()
    .replace(/['\u2018\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s || `family-${rand()}`
}
