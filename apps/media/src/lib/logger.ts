export const logger = {
  info: (obj: unknown, msg?: string) => console.log(msg ?? '', obj),
  warn: (obj: unknown, msg?: string) => console.warn(msg ?? '', obj),
  error: (obj: unknown, msg?: string) => console.error(msg ?? '', obj),
  fatal: (obj: unknown, msg?: string) => console.error(msg ?? '', obj),
} as const
