import { describe, expect, it } from 'vitest'

describe('mailer module', () => {
  it('exports loadMailerConfig and sendMail', async () => {
    const mod = await import('./mailer')
    expect(mod.loadMailerConfig).toBeDefined()
    expect(mod.sendMail).toBeDefined()
    expect(mod.makeTransporter).toBeDefined()
  })
})
