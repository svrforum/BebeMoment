'use client'
import type { GrowthRecord } from '@bebe/db-public'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type Point = {
  date: string
  height: number | null
  weight: number | null
  head: number | null
}

function toPoints(records: GrowthRecord[]): Point[] {
  return records.map((r) => ({
    date: r.measuredAt.toISOString().slice(0, 10),
    height: r.heightCm != null ? Number(r.heightCm) : null,
    weight: r.weightKg != null ? Number(r.weightKg) : null,
    head: r.headCm != null ? Number(r.headCm) : null,
  }))
}

export function GrowthChart({ records }: { records: GrowthRecord[] }) {
  if (records.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-base-300 p-8 text-center text-sm text-base-500">
        첫 성장 기록을 남겨보세요.
      </div>
    )
  }
  const data = toPoints(records)
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
          <XAxis dataKey="date" fontSize={11} />
          <YAxis fontSize={11} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="height" name="키 (cm)" stroke="#2563eb" connectNulls />
          <Line type="monotone" dataKey="weight" name="몸무게 (kg)" stroke="#16a34a" connectNulls />
          <Line type="monotone" dataKey="head" name="머리둘레 (cm)" stroke="#dc2626" connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
