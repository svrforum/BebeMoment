import { afterEach, describe, expect, it, vi } from 'vitest'
import { backupDir } from './config'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('backupDir', () => {
  it('defaults to /backups, also when compose passes an empty value', () => {
    vi.stubEnv('BACKUP_DIR', undefined)
    expect(backupDir()).toBe('/backups')
    vi.stubEnv('BACKUP_DIR', '')
    expect(backupDir()).toBe('/backups')
  })

  it('reads BACKUP_DIR', () => {
    vi.stubEnv('BACKUP_DIR', '/srv/backups')
    expect(backupDir()).toBe('/srv/backups')
  })

  it('still answers when another key would fail boot — the restore CLI runs on a fresh .env', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SECRET_KEY', 'change-me')
    vi.stubEnv('BACKUP_DIR', '/srv/backups')
    expect(backupDir()).toBe('/srv/backups')
  })
})
