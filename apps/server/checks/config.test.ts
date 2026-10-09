import assert from 'node:assert/strict'
import { test } from 'node:test'

import { getServerConfig } from '../src/infrastructure/config/server-config.ts'

test('默认监听本机且支持环境变量覆盖', () => {
  assert.deepEqual(getServerConfig({}), {
    hostname: '127.0.0.1',
    port: 3000,
  })
  assert.deepEqual(getServerConfig({ HOST: '0.0.0.0', PORT: '4000' }), {
    hostname: '0.0.0.0',
    port: 4000,
  })
  assert.equal(getServerConfig({ PORT: '1' }).port, 1)
  assert.equal(getServerConfig({ PORT: '65535' }).port, 65535)
})

test('监听前拒绝非法或超范围端口', () => {
  const portList = ['', '0', '65536', '-1', '3000.5', 'NaN', '1e3', ' 3000 ']

  for (const port of portList) {
    assert.throws(
      () => getServerConfig({ PORT: port }),
      /PORT must be an integer between 1 and 65535/,
      port,
    )
  }
})

test('拒绝空监听地址，避免 Node 将空地址解释为所有网络接口', () => {
  assert.throws(() => getServerConfig({ HOST: '' }), /non-empty hostname/)
  assert.throws(() => getServerConfig({ HOST: ' ' }), /non-empty hostname/)
})
