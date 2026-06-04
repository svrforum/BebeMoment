'use client'
import { AppHeader } from '@/components/shell/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

type ThemeChoice = 'auto' | 'light' | 'dark'
const THEME_VALUES: ThemeChoice[] = ['auto', 'light', 'dark']

export default function GeneralSettingsPage() {
  const t = useTranslations('admin')
  const [familyName, setFamilyName] = useState('')
  const [defaultTheme, setDefaultTheme] = useState<ThemeChoice>('auto')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    void fetch('/api/admin/settings')
      .then((r) => r.json())
      .then((d) => {
        const t = d.appearance?.default_theme
        if (t === 'auto' || t === 'light' || t === 'dark') setDefaultTheme(t)
      })
    void fetch('/api/admin/family')
      .then((r) => r.json())
      .then((d) => setFamilyName(d.name ?? ''))
  }, [])

  async function save() {
    setSaving(true)
    setStatus(null)
    const results = await Promise.all([
      fetch('/api/admin/family', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: familyName }),
      }),
      fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'appearance.default_theme', value: defaultTheme }),
      }),
    ])
    setSaving(false)
    setStatus(results.every((r) => r.ok) ? t('general.saved') : t('general.failed'))
  }

  return (
    <>
      <AppHeader title={t('general.title')} />
      <div className="mx-auto max-w-3xl px-5 py-4 space-y-3">
        <Card>
          <CardBody className="space-y-4">
            <div>
              <Label htmlFor="familyName">{t('general.familyName')}</Label>
              <Input
                id="familyName"
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                placeholder={t('general.familyNamePlaceholder')}
              />
              <p className="mt-1.5 text-xs text-base-500">{t('general.familyNameHelp')}</p>
            </div>
            <div>
              <Label htmlFor="defaultTheme">{t('general.defaultTheme')}</Label>
              <select
                id="defaultTheme"
                value={defaultTheme}
                onChange={(e) => setDefaultTheme(e.target.value as ThemeChoice)}
                className="h-11 w-full rounded-xl border border-base-200 bg-base-0 px-4 text-base dark:border-base-800 dark:bg-base-900"
              >
                {THEME_VALUES.map((v) => (
                  <option key={v} value={v}>
                    {t(`general.theme.${v}`)}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-base-500">{t('general.defaultThemeHelp')}</p>
            </div>
            {status && <p className="text-sm text-base-500">{status}</p>}
            <Button onClick={save} disabled={saving}>
              {saving ? '...' : t('general.save')}
            </Button>
          </CardBody>
        </Card>
      </div>
    </>
  )
}
