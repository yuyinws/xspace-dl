import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import type { LibraryItem } from '@shared/contracts'

import { DownloadManager } from './download-manager'
import { LibraryStore } from './library-store'
import { SettingsStore } from './settings-store'

describe('DownloadManager', () => {
  it('moves a task to success and persists the library record', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'download-manager-'))
    const settingsStore = new SettingsStore(path.join(dir, 'settings.json'), {
      credentials: {
        mode: 'manual',
        authToken: 'aa'.repeat(20),
        ct0: 'bb'.repeat(80),
        lastUpdatedAt: new Date().toISOString()
      },
      ffmpegPath: '',
      downloadDir: dir
    })
    const libraryStore = new LibraryStore(path.join(dir, 'library.json'))
    const publishedLibraries: LibraryItem[][] = []

    const manager = new DownloadManager(
      settingsStore,
      libraryStore,
      {
        publishTasks: () => undefined,
        publishLibrary: (items) => publishedLibraries.push(items)
      },
      {
        createClient: vi.fn(() => ({}) as never),
        getSpaceFromUrl: vi.fn(async () => ({
          id: 'space-1',
          url: 'https://x.com/i/spaces/space-1',
          title: 'Morning Briefing',
          creatorName: 'Host',
          creatorScreenName: 'host',
          creatorId: '1',
          creatorProfileImageUrl: '',
          startDate: '2026-04-01',
          state: 'Ended',
          availableForReplay: true,
          mediaKey: 'media-key'
        })),
        downloadEndedSpace: vi.fn(async () => ({
          outputPath: path.join(dir, 'Morning Briefing.m4a'),
          masterUrl: 'https://example.com/master.m3u8'
        })),
        DEFAULT_OUTPUT_TEMPLATE: 'audio/%(title)s'
      }
    )

    const task = await manager.enqueue('https://x.com/i/spaces/space-1')

    await vi.waitFor(() => {
      expect(manager.list().find((entry) => entry.id === task.id)?.status).toBe('success')
    })

    const items = await libraryStore.list()
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: task.id,
      title: 'Morning Briefing',
      status: 'success'
    })
    expect(publishedLibraries.at(-1)?.[0]?.status).toBe('success')
  })

  it('runs tasks serially', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'download-manager-serial-'))
    const settingsStore = new SettingsStore(path.join(dir, 'settings.json'), {
      credentials: {
        mode: 'manual',
        authToken: 'aa'.repeat(20),
        ct0: 'bb'.repeat(80),
        lastUpdatedAt: new Date().toISOString()
      },
      ffmpegPath: '',
      downloadDir: dir
    })
    const libraryStore = new LibraryStore(path.join(dir, 'library.json'))
    let releaseFirst: (() => void) | undefined
    const started: string[] = []

    const manager = new DownloadManager(
      settingsStore,
      libraryStore,
      {
        publishTasks: () => undefined,
        publishLibrary: () => undefined
      },
      {
        createClient: vi.fn(() => ({}) as never),
        getSpaceFromUrl: vi.fn(async (_client, spaceUrl) => ({
          id: spaceUrl.slice(-1),
          url: spaceUrl,
          title: spaceUrl,
          creatorName: 'Host',
          creatorScreenName: 'host',
          creatorId: '1',
          creatorProfileImageUrl: '',
          startDate: '2026-04-01',
          state: 'Ended',
          availableForReplay: true,
          mediaKey: 'media-key'
        })),
        downloadEndedSpace: vi.fn(
          ({ space }): Promise<{ outputPath: string; masterUrl: string }> =>
            new Promise((resolve) => {
              started.push(space?.id ?? 'unknown')
              if (space?.id === '1') {
                releaseFirst = () =>
                  resolve({
                    outputPath: path.join(dir, 'first.m4a'),
                    masterUrl: 'https://example.com/first.m3u8'
                  })
              } else {
                resolve({
                  outputPath: path.join(dir, 'second.m4a'),
                  masterUrl: 'https://example.com/second.m3u8'
                })
              }
            })
        ),
        DEFAULT_OUTPUT_TEMPLATE: '%(title)s'
      }
    )

    const first = await manager.enqueue('https://x.com/i/spaces/1')
    const second = await manager.enqueue('https://x.com/i/spaces/2')

    await vi.waitFor(() => {
      expect(manager.list().find((task) => task.id === first.id)?.status).toBe('downloading')
    })

    expect(manager.list().find((task) => task.id === second.id)?.status).toBe('queued')
    expect(started).toEqual(['1'])

    releaseFirst?.()

    await vi.waitFor(() => {
      expect(manager.list().find((task) => task.id === second.id)?.status).toBe('success')
    })

    expect(started).toEqual(['1', '2'])
  })
})
