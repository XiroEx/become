// Run with: npx tsx --test tests/unit/collapsibleSection.test.tsx
//
// Expand/collapse and "show more" reveals used to snap items in/out instantly;
// they now animate through Framer Motion (fade+height for the section,
// fade+slide for freshly revealed items). Covers the parts that are still
// pure logic after the animation wrap: nothing renders for an empty list, the
// preview count is respected, and "Show more" grows it by `step`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import CollapsibleSection from '../../components/CollapsibleSection'

const items = Array.from({ length: 10 }, (_, i) => `item-${i}`)

test('empty list renders nothing', () => {
  const html = renderToStaticMarkup(
    <CollapsibleSection
      title="Exercises"
      items={[]}
      renderItem={(item) => <span>{item}</span>}
      keyFor={(item) => item}
    />,
  )
  assert.equal(html, '')
})

test('shows only the preview count by default, with a "Show more" control', () => {
  const html = renderToStaticMarkup(
    <CollapsibleSection
      title="Exercises"
      items={items}
      renderItem={(item) => <span>{item}</span>}
      keyFor={(item) => item}
      previewCount={4}
      step={3}
    />,
  )
  for (let i = 0; i < 4; i++) assert.match(html, new RegExp(`>item-${i}<`))
  for (let i = 4; i < items.length; i++) assert.doesNotMatch(html, new RegExp(`>item-${i}<`))
  assert.match(html, /Show 3 more/)
  assert.match(html, /\(6 left\)/)
})

test('title shows the total item count', () => {
  const html = renderToStaticMarkup(
    <CollapsibleSection
      title="Exercises"
      items={items}
      renderItem={(item) => <span>{item}</span>}
      keyFor={(item) => item}
    />,
  )
  assert.match(html, /Exercises/)
  assert.match(html, /\(10\)/)
})
