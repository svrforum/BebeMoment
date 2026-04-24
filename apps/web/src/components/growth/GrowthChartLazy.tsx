'use client'
import type { GrowthRecord } from '@bebe/db-public'
import dynamic from 'next/dynamic'

/**
 * recharts ships ~80KB gzipped. Defer it to after the route chunk
 * loads so the growth page is interactive sooner. ssr:false also
 * avoids ResponsiveContainer's hydration quirks.
 */
const GrowthChart = dynamic(() => import('./GrowthChart').then((m) => m.GrowthChart), {
  ssr: false,
  loading: () => (
    <div className="h-72 w-full animate-pulse rounded-2xl bg-base-100 dark:bg-base-800" />
  ),
})

export function GrowthChartLazy(props: { records: GrowthRecord[] }) {
  return <GrowthChart {...props} />
}
