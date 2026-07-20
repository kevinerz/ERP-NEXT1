import { fileURLToPath, URL } from 'node:url'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))
const gitHash = (() => {
  try { return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim() } catch { return 'dev' }
})()

// Changelog timeline — dibangkitkan otomatis dari git log tiap build, tidak perlu
// ditulis manual. Tiap commit dipetakan ke versi web/package.json yang berlaku
// saat itu (version di-bump tiap commit signifikan), jadi entri baru muncul
// sendiri di changelog begitu ada commit baru — tanpa perlu sentuh file ini.
const CHANGELOG_LIMIT = 100
const changelog = (() => {
  try {
    const sep = '\x1f'
    const log = execSync(
      `git log -n ${CHANGELOG_LIMIT} --pretty=format:%H${sep}%h${sep}%ad${sep}%s --date=iso-strict`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 },
    )
    const commits = log.split('\n').filter(Boolean).map((line) => {
      const [full, short, date, subject] = line.split(sep)
      return { full, short, date, subject }
    })

    // Versi web/package.json yang di-diff tiap commit — dipakai untuk memetakan
    // "versi berapa yang berlaku saat commit X dibuat".
    const pkgLog = execSync(
      `git log -n ${CHANGELOG_LIMIT} -p --follow --format=COMMIT${sep}%H -- web/package.json`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 },
    )
    const versionByHash: Record<string, string> = {}
    let curHash = ''
    for (const line of pkgLog.split('\n')) {
      if (line.startsWith(`COMMIT${sep}`)) { curHash = line.slice(7); continue }
      const m = line.match(/^\+\s*"version":\s*"([\d.]+)"/)
      if (m && curHash) versionByHash[curHash] = m[1]
    }

    let lastVersion = pkg.version
    return commits.map((c) => {
      if (versionByHash[c.full]) lastVersion = versionByHash[c.full]
      const [, type, desc] = c.subject.match(/^(\w+):\s*(.+)$/) || [null, 'update', c.subject]
      return { version: lastVersion, hash: c.short, date: c.date, type, subject: desc }
    })
  } catch {
    return []
  }
})()

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_GIT_HASH__: JSON.stringify(gitHash),
    __APP_CHANGELOG__: JSON.stringify(changelog),
  },
  plugins: [
    vue(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/webhook': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
})
