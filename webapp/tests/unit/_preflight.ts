import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

/**
 * Hosts + port out of a mongodb:// or mongodb+srv:// URI.
 */
export function getMongoHostPort(): { host: string; port: number } {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/become-test'
  const m = /^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)/i.exec(uri.trim())
  if (m) {
    const firstHost = m[1].split(',')[0]
    const [h, p] = firstHost.split(':')
    return {
      host: h || '127.0.0.1',
      port: p ? parseInt(p, 10) : 27017,
    }
  }
  return { host: '127.0.0.1', port: 27017 }
}

/**
 * Find the path of the current test file being executed by node:test / tsx.
 */
export function getCurrentTestFile(): string | null {
  for (let i = 1; i < process.argv.length; i++) {
    const arg = process.argv[i]
    if (typeof arg === 'string' && (arg.endsWith('.test.ts') || arg.endsWith('.test.tsx'))) {
      const resolved = path.resolve(arg)
      if (fs.existsSync(resolved)) {
        return resolved
      }
    }
  }
  return null
}

/**
 * Determine whether a test file requires a live MongoDB connection.
 * Strips comments to avoid matching commented-out code or explanations.
 */
export function isDbTestFile(filePath: string): boolean {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const noComments = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')
    const hasConnect =
      /\bmongoose\.connect\s*\(/.test(noComments) &&
      !/indexOf\s*\(\s*['"`].*?mongoose\.connect/.test(noComments)
    const hasSeedMembers = /\bseedMembers\s*\(/.test(noComments)
    const hasContractHarness = /from\s+['"][^'"]*_contract['"]/.test(noComments)
    return hasConnect || hasSeedMembers || hasContractHarness
  } catch {
    return false
  }
}

/**
 * Synchronous probe to check if mongod is reachable on host:port with short timeout.
 * Caches reachability in /tmp keyed by the runner process PPID so parallel workers
 * in the same test run only probe once.
 */
export function isMongoReachable(host: string, port: number): boolean {
  const ppid = process.ppid || 'single'
  const cacheFile = `/tmp/.become_mongod_${ppid}.json`

  try {
    if (fs.existsSync(cacheFile)) {
      const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
      if (typeof data.reachable === 'boolean') {
        return data.reachable
      }
    }
  } catch {
    // Cache read failed, proceed to probe
  }

  let reachable = false
  try {
    const probeScript = `const net=require("net");const s=net.connect({host:${JSON.stringify(host)},port:${port},timeout:250});s.on("connect",()=>{s.destroy();process.exit(0);});s.on("error",()=>process.exit(1));s.on("timeout",()=>{s.destroy();process.exit(1);});`
    const res = spawnSync(process.execPath, ['-e', probeScript], { timeout: 400 })
    reachable = res.status === 0
  } catch {
    reachable = false
  }

  try {
    fs.writeFileSync(cacheFile, JSON.stringify({ reachable, time: Date.now() }))
  } catch {
    // Ignore cache write failure
  }

  return reachable
}

/**
 * Print one clear warning line across all worker processes in a single test run.
 * Guarded by an atomic file lock in /tmp keyed by runner PPID.
 */
export function warnNoMongodOnce(host: string, port: number): void {
  const ppid = process.ppid || 'single'
  const lockFile = `/tmp/.become_nomongod_${ppid}.lock`

  let shouldWarn = false
  try {
    const fd = fs.openSync(lockFile, 'wx')
    fs.closeSync(fd)
    shouldWarn = true
  } catch {
    shouldWarn = false
  }

  if (shouldWarn) {
    console.error(
      `[tests] no mongod listening on ${host}:${port} — skipping DB-backed suites (start it with: npm run dev:db)`,
    )
  }
}

/**
 * Patch node:test to skip suites and tests, and make lifecycle hooks no-ops so
 * connection attempts and cleanup queries never execute.
 */
export function patchNodeTestForSkip(reason: string): void {
  const req = typeof require === 'function' ? require : createRequire(path.resolve('package.json'))
  const nodeTest = req('node:test')

  function wrapTest(origFn: any) {
    if (typeof origFn !== 'function') return origFn

    const wrapped = function (this: any, ...args: any[]) {
      let name: string | undefined
      let options: Record<string, any> = {}
      let fn: any

      if (typeof args[0] === 'string') {
        name = args[0]
        if (typeof args[1] === 'function') {
          fn = args[1]
        } else if (typeof args[1] === 'object' && args[1] !== null) {
          options = { ...args[1] }
          fn = args[2]
        }
      } else if (typeof args[0] === 'function') {
        fn = args[0]
        name = fn.name || 'unnamed'
      } else if (typeof args[0] === 'object' && args[0] !== null) {
        options = { ...args[0] }
        fn = args[1]
      }

      options.skip = reason
      if (name !== undefined) {
        return origFn.call(this, name, options, fn)
      } else {
        return origFn.call(this, options, fn)
      }
    }

    for (const key of Object.keys(origFn)) {
      try {
        ;(wrapped as any)[key] = (origFn as any)[key]
      } catch {
        // ignore
      }
    }
    return wrapped
  }

  const origTest = nodeTest.test
  const patchedTest = wrapTest(origTest)
  if (origTest) {
    patchedTest.skip = wrapTest(origTest.skip || origTest)
    patchedTest.only = wrapTest(origTest.only || origTest)
    patchedTest.todo = wrapTest(origTest.todo || origTest)
  }
  nodeTest.test = patchedTest
  nodeTest.it = patchedTest

  if (nodeTest.describe) {
    nodeTest.describe = wrapTest(nodeTest.describe)
    nodeTest.describe.skip = nodeTest.describe
    nodeTest.describe.only = nodeTest.describe
  }
  if (nodeTest.suite) {
    nodeTest.suite = wrapTest(nodeTest.suite)
    nodeTest.suite.skip = nodeTest.suite
    nodeTest.suite.only = nodeTest.suite
  }

  // Disable lifecycle hooks for DB suites so connect / seed / teardown do not run
  nodeTest.before = function () {}
  nodeTest.after = function () {}
  nodeTest.beforeEach = function () {}
  nodeTest.afterEach = function () {}

  // Stub mongoose as an additional safety guarantee
  try {
    const mongoose = req('mongoose')
    if (mongoose) {
      mongoose.connect = async () => mongoose.connection
      mongoose.disconnect = async () => {}
    }
  } catch {
    // ignore
  }
}

/**
 * Preflight entrypoint.
 * If mongod is unreachable and process.env.CI is unset, prints one clear warning line
 * and skips DB-backed test files.
 */
export function runPreflight(): void {
  // If running in CI, never skip: unreachable database must fail loudly.
  if (process.env.CI) {
    return
  }

  const currentFile = getCurrentTestFile()
  if (!currentFile || !isDbTestFile(currentFile)) {
    return
  }

  const { host, port } = getMongoHostPort()
  const reachable = isMongoReachable(host, port)
  if (reachable) {
    return
  }

  warnNoMongodOnce(host, port)
  patchNodeTestForSkip('no mongod (start with: npm run dev:db)')
}
