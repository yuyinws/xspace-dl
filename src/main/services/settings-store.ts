import type { AppSettings, StoredCredentials } from '@shared/contracts'

import { JsonFileStore } from '../lib/json-file-store'

export class SettingsStore {
  private readonly store: JsonFileStore<AppSettings>

  constructor(filePath: string, defaults: AppSettings) {
    this.store = new JsonFileStore(filePath, defaults)
  }

  get(): Promise<AppSettings> {
    return this.store.get()
  }

  async saveCredentials(credentials: StoredCredentials): Promise<AppSettings> {
    return this.store.update((current) => ({
      ...current,
      credentials
    }))
  }

  async saveFfmpegPath(ffmpegPath: string): Promise<AppSettings> {
    return this.store.update((current) => ({
      ...current,
      ffmpegPath: ffmpegPath.trim()
    }))
  }

  async saveDownloadDir(downloadDir: string): Promise<AppSettings> {
    return this.store.update((current) => ({
      ...current,
      downloadDir: downloadDir.trim()
    }))
  }
}
