import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'

import { createApp } from '../src/app.ts'

test('网关健康检查与 Assets 模块通过各自路由提供响应', async () => {
  const app = createApp()
  const responseList = await Promise.all([
    app.request('/api/health'),
    app.request('/api/assets/health'),
  ])

  assert.equal(responseList[0].status, 200)
  assert.match(responseList[0].headers.get('content-type') ?? '', /json/)
  assert.deepEqual(await responseList[0].json(), {
    status: 'ok',
    service: 'neozebra-server',
  })
  assert.equal(responseList[1].status, 200)
  assert.deepEqual(await responseList[1].json(), {
    status: 'ok',
    module: 'assets',
  })
})

test('未知路径和未实现业务不返回虚构的业务数据', async () => {
  const app = createApp()
  const pathList = [
    '/api/missing',
    '/health',
    '/assets/health',
    '/api/assets/drive',
    '/api/dashboard',
  ]

  for (const path of pathList) {
    const response = await app.request(path)
    assert.equal(response.status, 404, path)
    assert.deepEqual(await response.json(), {
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    })
  }

  const response = await app.request('/api/health', { method: 'POST' })
  assert.equal(response.status, 404)

  const headResponse = await app.request('/api/health', { method: 'HEAD' })
  assert.equal(headResponse.status, 200)
  assert.equal(await headResponse.text(), '')
})

test('未知异常返回安全的 JSON 500 并记录服务端错误', async (context) => {
  const app = createApp()
  const error = new Error('private upstream information')
  const errorLog = context.mock.method(console, 'error', () => {})

  const failureHandler = () => {
    throw error
  }

  const moduleRoutes = new Hono().get('/failure', failureHandler)
  app.route('/api/check-module', moduleRoutes)
  const response = await app.request('/api/check-module/failure')

  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), {
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    },
  })
  assert.equal(errorLog.mock.calls[0].arguments[0], error)
})

test('已知 HTTP 异常保留状态、模块 JSON 响应与必要响应头', async () => {
  const app = createApp()

  const unauthorizedHandler = () => {
    throw new HTTPException(401, {
      res: Response.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } },
      ),
    })
  }

  app.get('/api/check-auth', unauthorizedHandler)
  const response = await app.request('/api/check-auth')

  assert.equal(response.status, 401)
  assert.equal(response.headers.get('www-authenticate'), 'Bearer')
  assert.deepEqual(await response.json(), {
    error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
  })
})
