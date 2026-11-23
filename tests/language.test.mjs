import test from 'node:test'
import assert from 'node:assert/strict'
import { translate } from '../src/lib/language.mjs'

test('language selection translates staff and order controls without changing unknown data', () => {
  assert.equal(translate('zh-Hant', 'Select staff'), '選擇員工')
  assert.equal(translate('zh-Hant', 'Mark served'), '標記已出餐')
  assert.equal(translate('en', 'Select staff'), 'Select staff')
  assert.equal(translate('zh-Hant', 'Carson'), 'Carson')
})
