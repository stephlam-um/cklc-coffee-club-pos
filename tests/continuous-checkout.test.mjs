import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const page = readFileSync(new URL('../src/app/page.jsx', import.meta.url), 'utf8')

test('a recorded checkout releases the counter without waiting for the order queue', () => {
  const checkout = page.split('async function checkout(')[1].split('async function closeShift(')[0]
  assert.match(checkout, /await posApi\.createTransaction\(transaction\)/)
  assert.match(checkout, /setCart\(\[\]\)/)
  assert.doesNotMatch(checkout, /setActiveView\(|await loadDashboard\(/)
})
