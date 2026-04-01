import { randomUUID } from 'node:crypto'
import path from 'node:path'

import type { DownloadTask, LibraryItem } from '@shared/contracts'

import type { SpaceInfo, TwitterClient } from '../../../dl-lib/types'
import { DEFAULT_OUTPUT_TEMPLATE } from '../../../dl-lib/format'
import { createClient } from '../../../dl-lib/api'
import { downloadEndedSpace } from '../../../dl-lib/downloader'
import { getSpaceFromUrl } from '../../../dl-lib/space'
import { LibraryStore } from './library-store'
import { SettingsStore } from './settings-store'

interface DownloadBridge {
  publishTasks(tasks: DownloadTask[]): void
  publishLibrary(items: LibraryItem[]): void
}

interface DlModule {
  createClient: typeof createClient
  getSpaceFromUrl: typeof getSpaceFromUrl
  downloadEndedSpace: typeof downloadEndedSpace
  DEFAULT_OUTPUT_TEMPLATE: string
}

export class DownloadManager {
  private readonly tasks = new Map<string, DownloadTask>()
  private readonly pendingIds: string[] = []
  private processing = false

  constructor(
    private readonly settingsStore: SettingsStore,
    private readonly libraryStore: LibraryStore,
    private readonly bridge: DownloadBridge,
    private readonly dl: DlModule = {
      createClient,
      getSpaceFromUrl,
      downloadEndedSpace,
      DEFAULT_OUTPUT_TEMPLATE
    }
  ) {}

  list(): DownloadTask[] {
    return this.snapshotTasks()
  }

  async enqueue(spaceUrl: string): Promise<DownloadTask> {
    const trimmedUrl = spaceUrl.trim()
    const now = new Date().toISOString()
      const task: DownloadTask = {
      id: randomUUID(),
      spaceUrl: trimmedUrl,
      status: 'queued',
      progressText: 'Queued for download',
      progressPercent: 0,
      error: null,
      createdAt: now,
      updatedAt: now
    }

    this.tasks.set(task.id, task)
    this.pendingIds.push(task.id)
    this.publishTasks()
    void this.processQueue()
    return task
  }

  async retry(id: string): Promise<DownloadTask> {
    const existingTask = this.tasks.get(id)
    const libraryItem = await this.libraryStore.get(id)
    const sourceUrl = existingTask?.spaceUrl ?? libraryItem?.spaceUrl

    if (!sourceUrl) {
      throw new Error('Download task not found')
    }

    const now = new Date().toISOString()
    const retriedTask: DownloadTask = {
      id,
      spaceUrl: sourceUrl,
      status: 'queued',
      progressText: 'Queued for retry',
      progressPercent: 0,
      error: null,
      createdAt: existingTask?.createdAt ?? libraryItem?.createdAt ?? now,
      updatedAt: now,
      title: existingTask?.title ?? libraryItem?.title,
      creatorName: existingTask?.creatorName ?? libraryItem?.creatorName,
      outputPath: existingTask?.outputPath ?? libraryItem?.outputPath
    }

    this.tasks.set(id, retriedTask)
    this.pendingIds.push(id)
    this.publishTasks()
    void this.processQueue()
    return retriedTask
  }

  remove(id: string): boolean {
    const task = this.tasks.get(id)
    if (!task) {
      return false
    }

    if (task.status === 'resolving' || task.status === 'downloading') {
      throw new Error('Cannot remove a task that is currently running')
    }

    this.tasks.delete(id)
    const nextPendingIds = this.pendingIds.filter((taskId) => taskId !== id)
    this.pendingIds.length = 0
    this.pendingIds.push(...nextPendingIds)
    this.publishTasks()
    return true
  }

  private async processQueue(): Promise<void> {
    if (this.processing) {
      return
    }

    this.processing = true

    while (this.pendingIds.length > 0) {
      const id = this.pendingIds.shift()
      if (!id) {
        continue
      }

      const task = this.tasks.get(id)
      if (!task || task.status !== 'queued') {
        continue
      }

      await this.runTask(task)
    }

    this.processing = false
    this.publishTasks()
  }

  private async runTask(task: DownloadTask): Promise<void> {
    let space: SpaceInfo | undefined

    try {
      this.updateTask(task.id, {
        status: 'resolving',
        progressText: 'Resolving Space metadata',
        progressPercent: 0,
        error: null
      })

      const settings = await this.settingsStore.get()
      if (!settings.credentials) {
        throw new Error('Missing credentials. Import cookies or enter auth_token and ct0 first.')
      }

      const client = this.dl.createClient({
        cookies: {
          authToken: settings.credentials.authToken,
          ct0: settings.credentials.ct0
        }
      })

      space = await this.resolveSpace(client, task.spaceUrl)

      this.updateTask(task.id, {
        title: space.title,
        creatorName: space.creatorName,
        status: 'downloading',
        progressText: 'Downloading audio with ffmpeg',
        progressPercent: 0
      })

      await this.publishLibraryState(
        makeLibraryItem(task, space, {
          status: 'downloading',
          outputPath: '',
          masterUrl: '',
          error: null
        })
      )

      const result = await this.dl.downloadEndedSpace({
        client,
        space,
        outputTemplate: path.join(settings.downloadDir, this.dl.DEFAULT_OUTPUT_TEMPLATE),
        ffmpegPath: settings.ffmpegPath || 'ffmpeg',
        onProgress: (progress) => {
          this.updateTask(task.id, {
            status: 'downloading',
            progressText: progress.text,
            progressPercent: progress.percent
          })
        }
      })

      const updatedTask = this.updateTask(task.id, {
        status: 'success',
        progressText: 'Download completed',
        progressPercent: 100,
        outputPath: result.outputPath
      })

      await this.publishLibraryState(
        makeLibraryItem(updatedTask, space, {
          status: 'success',
          outputPath: result.outputPath,
          masterUrl: result.masterUrl,
          error: null
        })
      )
    } catch (error) {
      const updatedTask = this.updateTask(task.id, {
        status: 'failed',
        progressText: 'Download failed',
        progressPercent: undefined,
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      if (space) {
        await this.publishLibraryState(
          makeLibraryItem(updatedTask, space, {
            status: 'failed',
            outputPath: updatedTask.outputPath ?? '',
            masterUrl: '',
            error: updatedTask.error
          })
        )
      }
    }
  }

  private async resolveSpace(client: TwitterClient, spaceUrl: string): Promise<SpaceInfo> {
    return this.dl.getSpaceFromUrl(client, spaceUrl)
  }

  private updateTask(id: string, patch: Partial<DownloadTask>): DownloadTask {
    const task = this.tasks.get(id)
    if (!task) {
      throw new Error('Task not found')
    }

    const nextTask: DownloadTask = {
      ...task,
      ...patch,
      updatedAt: new Date().toISOString()
    }

    this.tasks.set(id, nextTask)
    this.publishTasks()
    return nextTask
  }

  private snapshotTasks(): DownloadTask[] {
    return [...this.tasks.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  private publishTasks(): void {
    this.bridge.publishTasks(this.snapshotTasks())
  }

  private async publishLibraryState(item: LibraryItem): Promise<void> {
    const items = await this.libraryStore.upsert(item)
    this.bridge.publishLibrary(items)
  }
}

function makeLibraryItem(
  task: DownloadTask,
  space: SpaceInfo,
  patch: Pick<LibraryItem, 'status' | 'outputPath' | 'masterUrl' | 'error'>
): LibraryItem {
  return {
    id: task.id,
    spaceId: space.id,
    spaceUrl: task.spaceUrl,
    title: space.title,
    creatorName: space.creatorName,
    creatorScreenName: space.creatorScreenName,
    startDate: space.startDate,
    status: patch.status,
    outputPath: patch.outputPath,
    masterUrl: patch.masterUrl,
    error: patch.error,
    createdAt: task.createdAt,
    updatedAt: new Date().toISOString()
  }
}
