import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApiResult, DesktopApi, DownloadTask, LibraryItem } from '@shared/contracts'

import App from './App'

function ok<T>(data: T): ApiResult<T> {
  return { ok: true, data }
}

describe('App', () => {
  const queueListeners = new Set<(tasks: DownloadTask[]) => void>()
  const downloadListeners = new Set<(items: LibraryItem[]) => void>()
  const queuedTask: DownloadTask = {
    id: 'task-1',
    spaceUrl: 'https://x.com/i/spaces/1',
    status: 'queued',
    progressText: 'Queued for download',
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  const defaultSettings = {
    credentials: null,
    ffmpegPath: '',
    downloadDir: '/tmp/downloads'
  }

  beforeEach(() => {
    queueListeners.clear()
    downloadListeners.clear()

    window.api = {
      settings: {
        get: vi.fn(async () => ok(defaultSettings)),
        saveCredentials: vi.fn(async () => ok(defaultSettings)),
        importCookiesFile: vi.fn(async () => ok(defaultSettings)),
        saveFfmpegPath: vi.fn(async () => ok(defaultSettings)),
        saveDownloadDir: vi.fn(async () => ok(defaultSettings)),
        pickFfmpegPath: vi.fn(async () => ok('/usr/local/bin/ffmpeg')),
        pickDownloadDir: vi.fn(async () => ok('/tmp/downloads'))
      },
      downloads: {
        list: vi.fn(async () => ok([])),
        enqueue: vi.fn(async () => ok(queuedTask)),
        retry: vi.fn(async () => {
          throw new Error('not needed')
        }),
        remove: vi.fn(async () => ok(true)),
        openFile: vi.fn(async () => ok(true)),
        openFolder: vi.fn(async () => ok(true))
      },
      library: {
        list: vi.fn(async () => ok([])),
        deleteRecord: vi.fn(async () => ok(true)),
        deleteFile: vi.fn(async () => ok(true))
      },
      events: {
        onDownloadUpdated: vi.fn((listener) => {
          downloadListeners.add(listener)
          return () => downloadListeners.delete(listener)
        }),
        onQueueUpdated: vi.fn((listener) => {
          queueListeners.add(listener)
          return () => queueListeners.delete(listener)
        })
      }
    } satisfies DesktopApi
  })

  it('renders the empty states after initial hydration', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(await screen.findByText('No queued work yet')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Library' }))
    expect(screen.getByText('Library is empty')).toBeInTheDocument()
    expect(screen.getByText('Credentials required')).toBeInTheDocument()
  })

  it('validates the queue form and enqueues a valid space url', async () => {
    const user = userEvent.setup()
    render(<App />)

    await screen.findByText('Queue a Space')

    await user.click(screen.getByRole('button', { name: 'Add to queue' }))
    expect(await screen.findByText('Space URL is required')).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText('https://x.com/i/spaces/1ypKd...'), 'https://x.com/i/spaces/1')
    await user.click(screen.getByRole('button', { name: 'Add to queue' }))

    await waitFor(() => {
      expect(window.api.downloads.enqueue).toHaveBeenCalledWith('https://x.com/i/spaces/1')
    })
  })

  it('reacts to queue and library event updates', async () => {
    const user = userEvent.setup()
    render(<App />)

    await screen.findByText('Operations')

    queueListeners.forEach((listener) =>
      listener([
        {
          id: 'task-1',
          spaceUrl: 'https://x.com/i/spaces/1',
          status: 'downloading',
          progressText: 'Downloading audio 42% at 3.2x',
          progressPercent: 42,
          error: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          title: 'Night Session'
        }
      ])
    )

    downloadListeners.forEach((listener) =>
      listener([
        {
          id: 'task-1',
          spaceId: 'space-1',
          spaceUrl: 'https://x.com/i/spaces/1',
          title: 'Night Session',
          creatorName: 'Host',
          creatorScreenName: 'host',
          startDate: '2026-04-01',
          status: 'success',
          outputPath: '/tmp/night-session.m4a',
          masterUrl: 'https://example.com/master.m3u8',
          error: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ])
    )

    expect(await screen.findByText('Night Session')).toBeInTheDocument()
    expect(screen.getByText('42%')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Library' }))
    expect(await screen.findByRole('button', { name: 'Open file' })).toBeInTheDocument()
  })
})
