import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'

export function GrowthForm({
  action,
  defaults,
  submitLabel = '저장',
}: {
  action: (fd: FormData) => void
  defaults?: {
    measuredAt?: string
    heightCm?: number | null
    weightKg?: number | null
    headCm?: number | null
    note?: string | null
  }
  submitLabel?: string
}) {
  const d = defaults ?? {}
  return (
    <form action={action} className="space-y-3">
      <div>
        <Label htmlFor="measuredAt">측정일</Label>
        <Input
          id="measuredAt"
          name="measuredAt"
          type="date"
          defaultValue={d.measuredAt ?? new Date().toISOString().slice(0, 10)}
          required
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label htmlFor="heightCm">키 (cm)</Label>
          <Input
            id="heightCm"
            name="heightCm"
            type="number"
            step="0.1"
            min="0"
            max="200"
            defaultValue={d.heightCm ?? ''}
          />
        </div>
        <div>
          <Label htmlFor="weightKg">몸무게 (kg)</Label>
          <Input
            id="weightKg"
            name="weightKg"
            type="number"
            step="0.01"
            min="0"
            max="50"
            defaultValue={d.weightKg ?? ''}
          />
        </div>
        <div>
          <Label htmlFor="headCm">머리 (cm)</Label>
          <Input
            id="headCm"
            name="headCm"
            type="number"
            step="0.1"
            min="0"
            max="80"
            defaultValue={d.headCm ?? ''}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="note">메모 (선택)</Label>
        <Input id="note" name="note" type="text" defaultValue={d.note ?? ''} maxLength={500} />
      </div>
      <Button type="submit" className="w-full">
        {submitLabel}
      </Button>
    </form>
  )
}
