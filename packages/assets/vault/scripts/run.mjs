import { fileURLToPath } from 'node:url'
process.chdir(fileURLToPath(new URL('..', import.meta.url)))
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'

mkdirSync('dist', { recursive: true })
const build = spawnSync('go', ['build', '-o', 'dist/vault', './cmd/vault'], {
  stdio: 'inherit',
})
if (build.status !== 0) process.exit(build.status ?? 1)
const child = spawn('./dist/vault', process.argv.slice(2), {
  stdio: 'inherit',
})
const interruptHandler = () => child.kill('SIGINT')
const terminateHandler = () => child.kill('SIGTERM')
process.on('SIGINT', interruptHandler)
process.on('SIGTERM', terminateHandler)
child.on('error', (error) => {
  console.error(error.message)
  process.exitCode = 1
})
child.on('exit', (code) => {
  process.exitCode = code ?? 1
})
