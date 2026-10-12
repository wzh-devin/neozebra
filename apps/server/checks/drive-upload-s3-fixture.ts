import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHash, randomUUID } from 'node:crypto'
import { promisify } from 'node:util'

type FixtureObject = {
  bytes: Buffer
  upload: string
  type: string
  etag: string
}
const escapeXml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('"', '&quot;')

/**
 * Synthetic/local mock S3协议服务，复用真实MinIO SDK，不连接用户网盘。
 *
 * @param 无参数
 * @returns 端点、合成对象、故障开关及关闭方法
 */
const createUploadS3Fixture = async () => {
  const bucket = 'synthetic-drive'
  const objects = new Map<string, FixtureObject>()
  const sessions = new Map<
    string,
    { key: string; upload: string; type: string; parts: Map<number, Buffer> }
  >()
  const partList: { key: string; part: number; uploadId: string }[] = []
  const contentRequests: {
    key: string
    range: string | null
    bytes: number
  }[] = []
  const controls = {
    failPart: 0,
    loseCompletion: false,
    delay: 0,
    expireOnce: false,
    transformedHead: false,
  }
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url!, 'http://synthetic.local')
      const key = decodeURIComponent(url.pathname).slice(
        ('/' + bucket + '/').length,
      )
      res.setHeader('Content-Type', 'application/xml')
      const fail = (status: number, code: string) => {
        res.statusCode = status
        res.end(
          '<Error><Code>' +
            code +
            '</Code><Message>Synthetic failure</Message></Error>',
        )
      }
      if (req.method === 'HEAD') {
        if (url.pathname === '/' + bucket) {
          res.end()
          return
        }
        const object = objects.get(key)
        if (!object) {
          fail(404, 'NoSuchKey')
          return
        }
        if (!controls.transformedHead || object.type !== 'text/html')
          res.setHeader('Content-Length', object.bytes.length)
        res.setHeader('Content-Type', object.type)
        if (!controls.transformedHead || object.type !== 'text/html')
          res.setHeader('ETag', '"' + object.etag + '"')
        res.setHeader('Last-Modified', 'Sun, 11 Oct 2026 00:00:00 GMT')
        res.setHeader('X-Amz-Meta-Neozebra-Upload', object.upload)
        res.end()
        return
      }
      if (req.method === 'GET' && url.pathname === '/' + bucket) {
        const prefix = url.searchParams.get('prefix') ?? ''
        const delimiter = url.searchParams.get('delimiter')
        const prefixSet = new Set<string>()
        const entries = [...objects].filter(([name]) => {
          if (!name.startsWith(prefix)) return false
          const rest = name.slice(prefix.length)
          if (delimiter && rest.includes(delimiter)) {
            prefixSet.add(prefix + rest.slice(0, rest.indexOf(delimiter) + 1))
            return false
          }
          return true
        })
        const contents = entries
          .map(
            ([name, object]) =>
              '<Contents><Key>' +
              escapeXml(name) +
              '</Key><LastModified>2026-10-11T00:00:00Z</LastModified><ETag>' +
              object.etag +
              '</ETag><Size>' +
              object.bytes.length +
              '</Size><StorageClass>STANDARD</StorageClass></Contents>',
          )
          .join('')
        const prefixes = [...prefixSet]
          .map(
            (name) =>
              '<CommonPrefixes><Prefix>' +
              escapeXml(name) +
              '</Prefix></CommonPrefixes>',
          )
          .join('')
        res.end(
          '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>' +
            bucket +
            '</Name><IsTruncated>false</IsTruncated>' +
            contents +
            prefixes +
            '</ListBucketResult>',
        )
        return
      }
      if (req.method === 'GET') {
        const object = objects.get(key)
        if (!object) {
          fail(404, 'NoSuchKey')
          return
        }
        res.setHeader('Content-Type', object.type)
        res.setHeader('Accept-Ranges', 'bytes')
        let bytes = object.bytes
        if (req.headers.range) {
          const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range)
          const start = Number(match?.[1])
          const end = Math.min(
            Number(match?.[2] || bytes.length - 1),
            bytes.length - 1,
          )
          if (!match || start > end || start >= bytes.length) {
            res.statusCode = 416
            res.setHeader('Content-Range', 'bytes */' + bytes.length)
            res.end()
            return
          }
          res.statusCode = 206
          res.setHeader(
            'Content-Range',
            'bytes ' + start + '-' + end + '/' + bytes.length,
          )
          bytes = bytes.subarray(start, end + 1)
        }
        res.setHeader('Content-Length', bytes.length)
        contentRequests.push({
          key,
          range: req.headers.range ?? null,
          bytes: bytes.length,
        })
        res.end(bytes)
        return
      }
      if (req.method === 'POST' && url.searchParams.has('uploads')) {
        const id = randomUUID()
        sessions.set(id, {
          key,
          upload: String(req.headers['x-amz-meta-neozebra-upload'] ?? ''),
          type: String(
            req.headers['content-type'] ?? 'application/octet-stream',
          ),
          parts: new Map(),
        })
        res.end(
          '<InitiateMultipartUploadResult><Bucket>' +
            bucket +
            '</Bucket><Key>' +
            escapeXml(key) +
            '</Key><UploadId>' +
            id +
            '</UploadId></InitiateMultipartUploadResult>',
        )
        return
      }
      const uploadId = url.searchParams.get('uploadId')
      if (req.method === 'DELETE' && uploadId) {
        sessions.delete(uploadId)
        res.statusCode = 204
        res.end()
        return
      }
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(Buffer.from(chunk))
      const bytes = Buffer.concat(chunks)
      if (req.method === 'PUT' && uploadId) {
        const session = sessions.get(uploadId)
        const part = Number(url.searchParams.get('partNumber'))
        if (controls.delay)
          await new Promise((resolve) => setTimeout(resolve, controls.delay))
        if (controls.expireOnce) {
          controls.expireOnce = false
          sessions.delete(uploadId)
          fail(404, 'NoSuchUpload')
          return
        }
        if (!session) {
          fail(404, 'NoSuchUpload')
          return
        }
        if (controls.failPart === part) {
          controls.failPart = 0
          fail(503, 'ServiceUnavailable')
          return
        }
        session.parts.set(part, bytes)
        partList.push({ key, part, uploadId })
        res.setHeader(
          'ETag',
          '"' + createHash('md5').update(bytes).digest('hex') + '"',
        )
        res.end()
        return
      }
      if (req.method === 'POST' && uploadId) {
        const session = sessions.get(uploadId)
        if (!session) {
          fail(404, 'NoSuchUpload')
          return
        }
        const numbers = [
          ...bytes.toString().matchAll(/<PartNumber>(\d+)<\/PartNumber>/g),
        ].map((match) => Number(match[1]))
        const content = Buffer.concat(
          numbers.map((part) => session.parts.get(part)!),
        )
        const etag = createHash('md5').update(content).digest('hex')
        objects.set(key, {
          bytes: content,
          upload: session.upload,
          type: session.type,
          etag,
        })
        sessions.delete(uploadId)
        if (controls.loseCompletion) {
          controls.loseCompletion = false
          res.destroy()
          return
        }
        res.end(
          '<CompleteMultipartUploadResult><Location>synthetic</Location><Bucket>' +
            bucket +
            '</Bucket><Key>' +
            escapeXml(key) +
            '</Key><ETag>' +
            etag +
            '</ETag></CompleteMultipartUploadResult>',
        )
        return
      }
      if (req.method === 'PUT') {
        const etag = createHash('md5').update(bytes).digest('hex')
        objects.set(key, {
          bytes,
          upload: String(req.headers['x-amz-meta-neozebra-upload'] ?? ''),
          type: String(
            req.headers['content-type'] ?? 'application/octet-stream',
          ),
          etag,
        })
        res.setHeader('ETag', '"' + etag + '"')
        res.end()
        return
      }
      fail(400, 'InvalidRequest')
    } catch {
      res.statusCode = 500
      res.end()
    }
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Fixture did not listen')
  return {
    bucket,
    endpoint: 'http://127.0.0.1:' + address.port,
    objects,
    sessions,
    partList,
    contentRequests,
    controls,
    close: () => promisify(server.close.bind(server))(),
  }
}

export { createUploadS3Fixture }
