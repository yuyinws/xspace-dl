export type CredentialsMode = 'manual' | 'file'

export interface StoredCredentials {
  mode: CredentialsMode
  authToken: string
  ct0: string
  lastUpdatedAt: string
}

export interface AppSettings {
  credentials: StoredCredentials | null
  ffmpegPath: string
  downloadDir: string
}

export type TaskStatus =
  | 'queued'
  | 'resolving'
  | 'downloading'
  | 'success'
  | 'failed'
  | 'cancelled'

export interface DownloadTask {
  id: string
  spaceUrl: string
  status: TaskStatus
  progressText: string
  progressPercent?: number
  error: string | null
  createdAt: string
  updatedAt: string
  title?: string
  creatorName?: string
  outputPath?: string
}

export interface LibraryItem {
  id: string
  spaceId: string
  spaceUrl: string
  title: string
  creatorName: string
  creatorScreenName: string
  startDate: string
  status: TaskStatus
  outputPath: string
  masterUrl: string
  error: string | null
  createdAt: string
  updatedAt: string
}

export interface AppError {
  code: string
  message: string
}

export type ApiResult<T> =
  | {
      ok: true
      data: T
    }
  | {
      ok: false
      error: AppError
    }

export interface SaveCredentialsInput {
  mode: CredentialsMode
  authToken: string
  ct0: string
}

export interface DesktopApi {
  settings: {
    get: () => Promise<ApiResult<AppSettings>>
    saveCredentials: (input: SaveCredentialsInput) => Promise<ApiResult<AppSettings>>
    importCookiesFile: () => Promise<ApiResult<AppSettings>>
    saveFfmpegPath: (ffmpegPath: string) => Promise<ApiResult<AppSettings>>
    saveDownloadDir: (downloadDir: string) => Promise<ApiResult<AppSettings>>
    pickFfmpegPath: () => Promise<ApiResult<string>>
    pickDownloadDir: () => Promise<ApiResult<string>>
  }
  downloads: {
    list: () => Promise<ApiResult<DownloadTask[]>>
    enqueue: (spaceUrl: string) => Promise<ApiResult<DownloadTask>>
    retry: (id: string) => Promise<ApiResult<DownloadTask>>
    remove: (id: string) => Promise<ApiResult<boolean>>
    openFile: (id: string) => Promise<ApiResult<boolean>>
    openFolder: (id: string) => Promise<ApiResult<boolean>>
  }
  library: {
    list: () => Promise<ApiResult<LibraryItem[]>>
    deleteRecord: (id: string) => Promise<ApiResult<boolean>>
    deleteFile: (id: string) => Promise<ApiResult<boolean>>
  }
  events: {
    onDownloadUpdated: (listener: (items: LibraryItem[]) => void) => () => void
    onQueueUpdated: (listener: (tasks: DownloadTask[]) => void) => () => void
  }
}

export const IPC_CHANNELS = {
  settingsGet: 'settings:get',
  settingsSaveCredentials: 'settings:saveCredentials',
  settingsImportCookiesFile: 'settings:importCookiesFile',
  settingsSaveFfmpegPath: 'settings:saveFfmpegPath',
  settingsSaveDownloadDir: 'settings:saveDownloadDir',
  settingsPickFfmpegPath: 'settings:pickFfmpegPath',
  settingsPickDownloadDir: 'settings:pickDownloadDir',
  downloadsList: 'downloads:list',
  downloadsEnqueue: 'downloads:enqueue',
  downloadsRetry: 'downloads:retry',
  downloadsRemove: 'downloads:remove',
  downloadsOpenFile: 'downloads:openFile',
  downloadsOpenFolder: 'downloads:openFolder',
  libraryList: 'library:list',
  libraryDeleteRecord: 'library:deleteRecord',
  libraryDeleteFile: 'library:deleteFile',
  eventDownloadsUpdated: 'events:downloadsUpdated',
  eventQueueUpdated: 'events:queueUpdated'
} as const
