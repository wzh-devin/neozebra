import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// 使用随机 IV 和认证标签加密，数据库泄漏时不会直接暴露邮箱凭据。
const encryptCredentials = (value: unknown, key: string): string => {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv)
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64')
}

const decryptCredentials = <T>(value: string, key: string): T => {
  const data = Buffer.from(value, 'base64')
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(key, 'hex'),
    data.subarray(0, 12),
  )
  decipher.setAuthTag(data.subarray(12, 28))
  return JSON.parse(
    Buffer.concat([
      decipher.update(data.subarray(28)),
      decipher.final(),
    ]).toString('utf8'),
  ) as T
}

export { encryptCredentials, decryptCredentials }
