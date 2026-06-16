import { isMetaQuery, buildSearchQuery, SELF_NAMES } from '../../src/brain/query.js'

test('isMetaQuery flags Chinese availability checks', () => {
  expect(isMetaQuery('确认当前是否可用 mycelium 工具')).toBe(true)
  expect(isMetaQuery('看看这个工具能不能用')).toBe(true)
  expect(isMetaQuery('测试 mycelium 是否正常工作')).toBe(true)
})

test('isMetaQuery flags the "X 可用吗/能用吗" question form', () => {
  expect(isMetaQuery('mycelium 现在可用吗')).toBe(true)
  expect(isMetaQuery('这个工具现在能用吗？')).toBe(true)
  expect(isMetaQuery('服务还在线吗')).toBe(true)
  expect(isMetaQuery('mycelium 跑起来了没')).toBe(true)
})

test('isMetaQuery flags English availability checks', () => {
  expect(isMetaQuery('check if the mycelium tool is available')).toBe(true)
  expect(isMetaQuery('verify the server is working')).toBe(true)
  expect(isMetaQuery('smoke-test the integration')).toBe(true)
})

test('isMetaQuery does NOT flag real work', () => {
  expect(isMetaQuery('add usdt payment to billing')).toBe(false)
  expect(isMetaQuery('orchestrate kubernetes blue-green deploy')).toBe(false)
  expect(isMetaQuery('给前端加一个暗黑模式切换')).toBe(false)
})

test('buildSearchQuery strips self-names', () => {
  expect(buildSearchQuery('integrate mycelium with codex')).toBe('integrate with codex')
  expect(buildSearchQuery('MCEP protocol handshake design')).toBe('protocol handshake design')
})

test('buildSearchQuery returns empty when only self-names remain', () => {
  for (const name of SELF_NAMES) expect(buildSearchQuery(name)).toBe('')
  expect(buildSearchQuery('mycelium')).toBe('')
})

test('buildSearchQuery leaves clean queries untouched', () => {
  expect(buildSearchQuery('write a deploy plan')).toBe('write a deploy plan')
})
