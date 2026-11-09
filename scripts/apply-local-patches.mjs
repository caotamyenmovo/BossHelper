import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const patch = fileURLToPath(new URL('../patches/devlog-ui-vite-env.patch', import.meta.url))
const cwd = fileURLToPath(new URL('../packages/devlog-ui/', import.meta.url))
function git(args) {
  return spawnSync('git', ['apply', ...args, patch], { cwd, encoding: 'utf8' })
}
if (git(['--reverse', '--check']).status !== 0) {
  const result = git([])
  if (result.status !== 0) {
    console.error(result.stderr || result.error?.message || `Cannot apply devlog-ui patch in ${root}. Initialize submodules first.`)
    process.exit(1)
  }
}
