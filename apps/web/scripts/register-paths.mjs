import { registerHooks } from 'node:module'
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

// 让原生 Node 测试使用与 Vite 相同的 @/ 别名，不增加运行时依赖。
const sourceDirectory = fileURLToPath(new URL('../src/', import.meta.url))
registerHooks({
  resolve: (specifier, context, nextResolve) => {
    if (!specifier.startsWith('@/')) return nextResolve(specifier, context)
    const target = sourceDirectory + specifier.slice(2)
    const resolved = [
      target,
      target + '.ts',
      target + '.tsx',
      target + '/index.ts',
    ].find(
      (candidate) => existsSync(candidate) && /\.(ts|tsx)$/.test(candidate),
    )
    return nextResolve(
      resolved ? pathToFileURL(resolved).href : specifier,
      context,
    )
  },
})
