export function isInstanceAdmin(email: string | null, adminEmails: readonly string[]): boolean {
  if (!email) return false
  const normalized = email.toLowerCase()
  return adminEmails.some((a) => a.toLowerCase() === normalized)
}
