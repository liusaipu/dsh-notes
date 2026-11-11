import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, stat, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  DEFAULT_NOTEBOOK_ID,
  DEFAULT_NOTEBOOK_NAME,
  LEGACY_PASSWORD_REF,
  NotebookError,
  NotebookRegistry,
} from '../lib/notebooks.js'

async function tempRoot() {
  return mkdtemp(path.join(tmpdir(), 'dsh-notebooks-'))
}

test('migrates the legacy single-notebook state without moving it first', async () => {
  const root = await tempRoot()
  const legacyState = JSON.stringify({ version: 3, notes: { a: { text: 'old' } } })
  await writeFile(path.join(root, 'state.json'), legacyState)
  await mkdir(path.join(root, 'images'))
  await writeFile(path.join(root, 'images', 'a.png'), Buffer.from([137, 80, 78, 71]))

  const registry = new NotebookRegistry({ root })
  await registry.load()

  const entries = await registry.list()
  assert.equal(entries.length, 1)
  assert.equal(entries[0].id, DEFAULT_NOTEBOOK_ID)
  assert.equal(entries[0].name, DEFAULT_NOTEBOOK_NAME)
  assert.equal(entries[0].passwordRef, LEGACY_PASSWORD_REF)
  assert.equal(await readFile(path.join(root, 'notebooks', 'default', 'state.json'), 'utf8'), legacyState)
  assert.deepEqual(
    [...(await readFile(path.join(root, 'notebooks', 'default', 'images', 'a.png')))],
    [137, 80, 78, 71],
  )
  await assert.rejects(stat(path.join(root, 'state.json')), { code: 'ENOENT' })
  await assert.rejects(stat(path.join(root, 'images')), { code: 'ENOENT' })
})

test('creates, renames, activates and removes notebooks while keeping one', async () => {
  const root = await tempRoot()
  const registry = new NotebookRegistry({ root })
  await registry.load()

  const first = (await registry.list())[0]
  assert.equal(registry.activeId, first.id)

  const created = await registry.create('生活')
  assert.match(created.id, /^[a-z0-9]{8}$/)
  assert.equal(created.name, '生活')
  assert.equal(registry.activeId, created.id)
  assert.match(created.passwordRef, /^DSH_FLOMO_IMAP_PASSWORD_[A-Z0-9]+$/)
  assert.equal((await stat(path.join(created.dir, '..'))).isDirectory(), true)

  await registry.rename(created.id, '读书')
  await registry.setActive(first.id)
  assert.equal(registry.activeId, first.id)
  assert.equal((await registry.entry(created.id)).name, '读书')

  await registry.remove(created.id)
  assert.equal((await registry.list()).length, 1)
  await assert.rejects(registry.remove(first.id), (error) => {
    assert.ok(error instanceof NotebookError)
    assert.equal(error.code, 'NOTEBOOK_LAST')
    return true
  })
})

test('starts with a default notebook when there is no legacy state', async () => {
  const root = await tempRoot()
  const registry = new NotebookRegistry({ root })
  await registry.load()
  const entries = await registry.list()
  assert.equal(entries.length, 1)
  assert.equal(entries[0].id, DEFAULT_NOTEBOOK_ID)
  assert.equal(entries[0].name, DEFAULT_NOTEBOOK_NAME)
})
