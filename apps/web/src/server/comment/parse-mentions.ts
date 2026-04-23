export function parseMentions(
  body: string,
  familyMembers: { id: string; displayName: string }[],
): string[] {
  const ids = new Set<string>()
  const pattern = /@([^\s@]{1,20})/g
  for (const match of body.matchAll(pattern)) {
    const name = match[1]
    const member = familyMembers.find((u) => u.displayName === name)
    if (member) ids.add(member.id)
  }
  return Array.from(ids)
}
