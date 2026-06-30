#!/usr/bin/env node
// Auto-increment patch version in web/package.json
// Called by git pre-commit hook

import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkgPath = resolve(__dirname, '../web/package.json')

const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
const [major, minor, patch] = pkg.version.split('.').map(Number)
pkg.version = `${major}.${minor}.${patch + 1}`

writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
console.log(`Version bumped to ${pkg.version}`)
