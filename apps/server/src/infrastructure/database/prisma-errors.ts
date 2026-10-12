import { Prisma } from '@neozebra/database'

// 条件更新未匹配表示记录已删除或版本已改变；其他数据库错误继续交给调用方。
const ignoreMissingRecord = (error: unknown): null => {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  )
    return null
  throw error
}

export { ignoreMissingRecord }
