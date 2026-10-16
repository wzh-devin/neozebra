import { cpSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
const require = createRequire(import.meta.url)
const source = path.dirname(require.resolve('pdfjs-dist/package.json'))
const destination = new URL('../public/vendor/pdfjs/', import.meta.url)
mkdirSync(destination, { recursive: true })
for (const folder of ['cmaps', 'standard_fonts', 'wasm'])
  cpSync(path.join(source, folder), new URL(folder, destination), {
    recursive: true,
  })
cpSync(path.join(source, 'LICENSE'), new URL('LICENSE', destination))
