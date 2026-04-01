import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { JsonFileStore } from './json-file-store'

describe('JsonFileStore', () => {
  it('creates the backing file with defaults on first read', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'json-store-'))
    const filePath = path.join(dir, 'settings.json')
    const store = new JsonFileStore(filePath, { ready: false })

    const value = await store.get()
    const persisted = JSON.parse(await readFile(filePath, 'utf8')) as { ready: boolean }

    expect(value).toEqual({ ready: false })
    expect(persisted).toEqual({ ready: false })
  })

  it('recovers from invalid json by rewriting defaults', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'json-store-bad-'))
    const filePath = path.join(dir, 'library.json')
    await writeFile(filePath, '{broken', 'utf8')
    const store = new JsonFileStore(filePath, { items: [] as string[] })

    const value = await store.get()
    const persisted = JSON.parse(await readFile(filePath, 'utf8')) as { items: string[] }

    expect(value).toEqual({ items: [] })
    expect(persisted).toEqual({ items: [] })
  })
})
