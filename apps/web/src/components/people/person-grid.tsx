import type { PersonSummary } from '@/server/people/list'
import { PersonCard } from './person-card'

export function PersonGrid({ people }: { people: PersonSummary[] }) {
  return (
    <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5">
      {people.map((p) => (
        <PersonCard key={p.id} person={p} />
      ))}
    </div>
  )
}
