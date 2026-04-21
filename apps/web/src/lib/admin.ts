export function isInstanceAdmin(email: string | null, adminEmails: readonly string[]): boolean {
  if (!email) return false
  const normalized = email.toLowerCase()
  return adminEmails.some((a) => a.toLowerCase() === normalized)
}

export function isInstanceAdminUser(
  user: { email: string | null; emailVerified: boolean } | null,
  adminEmails: readonly string[],
): boolean {
  if (!user) return false
  if (!user.emailVerified) return false
  return isInstanceAdmin(user.email, adminEmails)
}
