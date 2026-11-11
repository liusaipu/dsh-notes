#!/usr/bin/env node
/**
 * Generate a DSH plugin market index (format 1) for this bundle.
 *
 * The index is a static JSON file; host it anywhere over HTTPS and add its
 * URL in DSH Desktop → Plugins → Discover → Add index source. This script
 * does not publish anything: it only writes a validated-by-construction
 * entry for either a Git repository or an npm package.
 *
 * Examples
 *   node scripts/make-market-index.mjs \
 *     --repo https://github.com/you/dsh-notes \
 *     --commit "$(git rev-parse HEAD)"
 *
 *   node scripts/make-market-index.mjs \
 *     --repo https://github.com/you/dsh-notes \
 *     --commit <sha> --path dsh-notes
 *
 *   node scripts/make-market-index.mjs --npm --version 1.0.0
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const en = await readLocale('en')
const zh = await readLocale('zh')
const args = parseArgs(process.argv.slice(2))

if (args.help) {
  console.log(USAGE)
  process.exit(0)
}

const name = pkg.name
const version = String(args.version || pkg.version || '')
const npm = Boolean(args.npm)
const subpath = args.path ? normalizeSubpath(String(args.path)) : ''
const repo = args.repo ? normalizeRepo(String(args.repo)) : ''
const registry = args.registry ? normalizeRegistry(String(args.registry)) : ''
const out = path.resolve(root, args.out ? String(args.out) : 'market/index.json')
const timestamp = parseTimestamp(args.time)

assertPackageName(name)
assertVersion(version)
if (!npm) {
  if (!repo) throw new Error('Git indexes need --repo https://host/owner/repo (or use --npm).')
  if (!args.commit) throw new Error('Git indexes need --commit <40-hex-commit>. Run: git rev-parse HEAD')
  assertCommit(String(args.commit))
}

const plugin = {
  name,
  title: localized({ en: metaTitle(en), zh: metaTitle(zh) }),
  description: localized({ en: metaDescription(en), zh: metaDescription(zh) }),
  icon: relativeIcon(out),
  ...(args.author ? { author: String(args.author) } : {}),
  ...(repo ? { homepage: repo } : {}),
  ...(repo ? { repository: { url: repo, ...(subpath ? { directory: subpath } : {}) } } : {}),
  metadata: {
    keywords: uniqueKeywords(pkg.keywords),
  },
  versions: [
    {
      version,
      publishTimestamp: timestamp,
      source: npm
        ? { type: 'npm', ...(registry ? { registry } : {}) }
        : {
            type: 'git',
            url: repo,
            commit: String(args.commit).toLowerCase(),
            ...(subpath ? { path: subpath } : {}),
          },
      ...(pkg.engines && pkg.engines.dsh ? { engines: { dsh: String(pkg.engines.dsh) } } : {}),
    },
  ],
}

const index = {
  format: 1,
  title: 'Quick Memo',
  description: 'A self-hosted DSH plugin index for the Quick Memo / 随手记 bundle.',
  plugins: [plugin],
}

await mkdir(path.dirname(out), { recursive: true })
await writeFile(out, `${JSON.stringify(index, null, 2)}\n`, 'utf8')

const spec = npm
  ? `${name}@${version}`
  : `git+${repo.endsWith('.git') ? repo : `${repo}.git`}#${String(args.commit).toLowerCase()}${subpath ? `&path:/${subpath}` : ''}`

console.log(`Wrote ${out}`)
console.log(`Install spec: ${spec}`)
console.log('')
console.log('Next:')
console.log('  1. Commit and serve the index over HTTPS (GitHub Pages, raw.githubusercontent.com, a static host).')
console.log('  2. In DSH Desktop: Plugins → Discover → Add index source, then paste the index URL.')
console.log('  3. For the public dsh.so market, push the repository and submit it at https://www.dsh.so/zh/submit/.')
if (!repo) console.log('  4. Add a repository field to package.json if you want the listing to link back to the source.')

/* ---------- helpers ---------- */

const USAGE = `Usage: node scripts/make-market-index.mjs [options]

  --repo <url>       HTTPS Git repository (https://github.com/owner/repo)
  --commit <sha>     Full 40-hex commit for a Git source
  --path <dir>       Package directory inside the repository (default: root)
  --version <semver> Version to list (default: package.json version)
  --time <seconds>   publishTimestamp; default: now
  --author <name>    Display author
  --out <file>       Output file (default: market/index.json)
  --npm              Emit an npm source instead of Git
  --registry <url>   Registry for an npm source
  --help             Show this message
`

function parseArgs(argv) {
  const parsed = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[index + 1]
    if (next && !next.startsWith('--')) {
      parsed[key] = next
      index += 1
    } else {
      parsed[key] = true
    }
  }
  return parsed
}

async function readLocale(locale) {
  try {
    return JSON.parse(await readFile(path.join(root, 'locale', `${locale}.json`), 'utf8'))
  } catch {
    return null
  }
}

function metaTitle(locale) {
  return (locale && locale.meta && locale.meta.title) || pkg.name
}

function metaDescription(locale) {
  return (locale && locale.meta && locale.meta.description) || pkg.description || pkg.name
}

function localized(values) {
  const entries = Object.entries(values).filter(([, value]) => typeof value === 'string' && value.trim())
  if (!entries.some(([language]) => language === 'en')) {
    throw new Error('Localized title/description must include English.')
  }
  return Object.fromEntries(entries)
}

function normalizeRepo(value) {
  let text = value.trim().replace(/^git\+/, '').replace(/\/+$/, '')
  if (!/^[a-z]+:\/\//i.test(text)) text = `https://${text}`
  let url
  try {
    url = new URL(text)
  } catch {
    throw new Error(`--repo must be an absolute https URL, got ${JSON.stringify(value)}.`)
  }
  if (url.protocol !== 'https:') throw new Error('--repo must use https.')
  if (url.username || url.password) throw new Error('--repo must not contain credentials.')
  if (url.search || url.hash) throw new Error('--repo must not contain a query or fragment.')
  if (url.pathname.split('/').filter(Boolean).length < 2) {
    throw new Error('--repo must name a repository with at least two path segments.')
  }
  if (/\.(tgz|tar\.gz)$/i.test(url.pathname)) throw new Error('--repo must name a repository, not a tarball.')
  return url.href.replace(/\/$/, '')
}

function normalizeRegistry(value) {
  let url
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error('--registry must be an absolute https URL.')
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('--registry must be a canonical https URL without credentials, query, or fragment.')
  }
  return url.href
}

function normalizeSubpath(value) {
  const text = value.replace(/^\/+|\/+$/g, '')
  if (!text) return ''
  for (const segment of text.split('/')) {
    if (segment === '.' || segment === '..' || !/^[A-Za-z0-9._@+-]+$/.test(segment)) {
      throw new Error(`--path must be a relative directory without . or .. segments, got ${JSON.stringify(value)}.`)
    }
  }
  return text
}

function relativeIcon(outFile) {
  const relative = path.relative(path.dirname(outFile), path.join(root, 'icon.svg')).split(path.sep).join('/')
  return relative.startsWith('.') ? relative : `./${relative}`
}

function parseTimestamp(value) {
  if (value === undefined) return Math.floor(Date.now() / 1000)
  const number = Number(value)
  if (!Number.isInteger(number) || number < 0 || number >= 1e11) {
    throw new Error('--time must be an integer number of Unix seconds in [0, 10^11).')
  }
  return number
}

function assertCommit(value) {
  if (!/^[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error('--commit must be the full 40-hex commit SHA. Run: git rev-parse HEAD')
  }
}

function assertVersion(value) {
  const semver =
    /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
  if (!semver.test(value)) throw new Error(`Version ${JSON.stringify(value)} is not an exact SemVer version.`)
}

function assertPackageName(value) {
  const pattern = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/
  if (!pattern.test(value) || value.length > 214) {
    throw new Error(`${JSON.stringify(value)} is not a valid npm package name.`)
  }
}

function uniqueKeywords(values) {
  const list = Array.isArray(values) ? values : []
  const output = []
  for (const value of list) {
    if (typeof value !== 'string' || !value.trim() || output.includes(value)) continue
    output.push(value)
  }
  for (const fallback of ['dsh-plugin', 'notes', 'memo']) {
    if (!output.includes(fallback)) output.push(fallback)
  }
  return output
}
