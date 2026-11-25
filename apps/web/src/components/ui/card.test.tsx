import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Card, CardBody } from './card'

describe('Card', () => {
  it('renders a static surface by default and adds press feedback only when interactive', () => {
    const plain = renderToStaticMarkup(
      <Card className="extra">
        <CardBody>body</CardBody>
      </Card>,
    )
    expect(plain).toContain('rounded-2xl')
    expect(plain).toContain('extra')
    expect(plain).toContain('<div class="p-5">body</div>')
    expect(plain).not.toContain('hover:-translate-y-0.5')

    expect(renderToStaticMarkup(<Card interactive />)).toContain('hover:-translate-y-0.5')
  })
})
