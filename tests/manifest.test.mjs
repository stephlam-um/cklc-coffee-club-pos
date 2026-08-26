import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('manifest configures a standalone Student Coffee POS web app', async () => {
  const manifest = JSON.parse(await readFile(new URL('../src/app/manifest.webmanifest', import.meta.url), 'utf8'))
  assert.equal(manifest.name, 'Student Coffee POS')
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.start_url, '/')
})
