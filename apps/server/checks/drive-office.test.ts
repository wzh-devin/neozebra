import assert from 'node:assert/strict'
import test from 'node:test'
import { createHmac } from 'node:crypto'
import {
  getOfficeType,
  getOfficeConfig,
  signOfficeConfig,
  signPreviewSource,
  isPreviewSourceAuthorized,
} from '../../../packages/assets/src/infrastructure/drive/drive-office.ts'
import type { AssetsDependencies } from '@neozebra/assets'

import { getDriveFilePreviewKind } from '../../web/src/features/drive/data/drive-file-preview.ts'

const key = 'synthetic-test-key-only'
test('Office source tickets reject tampering, wrong file, expiry and oversized lifetime', () => {
  const now = Math.floor(Date.now() / 1000)
  const ticket = signPreviewSource('snapshot-a', now + 900, key)
  assert.equal(isPreviewSourceAuthorized('snapshot-a', ticket, key), true)
  for (const [id, value] of [
    ['snapshot-b', ticket],
    ['snapshot-a', ticket + 'x'],
    ['snapshot-a', signPreviewSource('snapshot-a', now - 1, key)],
    ['snapshot-a', signPreviewSource('snapshot-a', now + 7200, key)],
    ['snapshot-a', '0.short'],
  ])
    assert.equal(isPreviewSourceAuthorized(id, value, key), false)
  assert.equal(
    isPreviewSourceAuthorized('snapshot-a', ticket, key + 'wrong'),
    false,
  )
})
test('Office config signs the full read-only JWT payload', () => {
  const payload = {
    document: { key: 'hash', permissions: { edit: false } },
    editorConfig: { mode: 'view' },
    exp: 123,
  }
  const [header, body, signature] = signOfficeConfig(payload, key).split('.')
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url').toString()), {
    alg: 'HS256',
    typ: 'JWT',
  })
  assert.deepEqual(
    JSON.parse(Buffer.from(body, 'base64url').toString()),
    payload,
  )
  assert.equal(
    signature,
    createHmac('sha256', key)
      .update(header + '.' + body)
      .digest('base64url'),
  )
})
test('Office type coverage includes old, templates, macros, ODF and excludes specialist formats', () => {
  for (const ext of 'doc docx docm dotx odt rtf'.split(' '))
    assert.equal(getOfficeType('sample.' + ext)?.documentType, 'word')
  for (const ext of 'xls xlsx xlsb xlsm xltm ods csv'.split(' '))
    assert.equal(getOfficeType('sample.' + ext)?.documentType, 'cell')
  for (const ext of 'ppt pptx pptm pps ppsx potx odp'.split(' '))
    assert.equal(getOfficeType('sample.' + ext)?.documentType, 'slide')
  for (const ext of 'html mdb accdb mpp one msg eml vsd exe'.split(' '))
    assert.equal(getOfficeType('sample.' + ext), null)
  assert.equal(getOfficeType('中文.PPTX')?.fileType, 'pptx')
})
test('Office engine configuration is lazy and rejects invalid credentials or URL schemes', () => {
  const dependencies = {
    getOfficeConfig: () => ({
      url: 'http://localhost:8088',
      sourceOrigin: 'http://host.docker.internal:3000',
      jwtSecret: 'x'.repeat(64),
    }),
  } as AssetsDependencies
  assert.equal(getOfficeConfig(dependencies).jwtSecret.length, 64)
  assert.throws(
    () => getOfficeConfig({} as AssetsDependencies),
    /not configured/,
  )
  assert.throws(
    () =>
      getOfficeConfig({
        ...dependencies,
        getOfficeConfig: () => ({
          url: 'javascript:alert(1)',
          sourceOrigin: 'http://localhost',
          jwtSecret: 'x'.repeat(64),
        }),
      }),
    /invalid/,
  )
})

test('前后端文档格式能力一致，PDF统一ONLYOFFICE且HTML保持纯文本', () => {
  const extensions =
    'doc docx docm dot dotx dotm odt ott rtf xls xlsx xlsm xlsb xlt xltx xltm ods ots csv ppt pptx pptm pps ppsx ppsm pot potx potm odp otp pdf'.split(
      ' ',
    )
  for (const extension of extensions) {
    assert.ok(getOfficeType('中文.' + extension))
    assert.equal(
      getDriveFilePreviewKind(new File([], '中文.' + extension)),
      'office',
    )
  }
  assert.equal(getDriveFilePreviewKind(new File([], 'original.pdf')), 'office')
  assert.equal(getDriveFilePreviewKind(new File([], 'safe.html')), 'text')
})

test('PDF扩展名与MIME统一路由，兼容缺失扩展名及generic MIME', () => {
  for (const [name, mimeType] of [
    ['report.PDF', 'application/octet-stream'],
    ['report', 'application/pdf; charset=binary'],
  ]) {
    assert.deepEqual(getOfficeType(name, mimeType), {
      fileType: 'pdf',
      documentType: 'pdf',
    })
    assert.equal(
      getDriveFilePreviewKind(new File([], name, { type: mimeType })),
      'office',
    )
  }
})
