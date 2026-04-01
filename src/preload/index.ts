import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { DesktopApi } from '@shared/contracts'
import { IPC_CHANNELS } from '@shared/contracts'

const api: DesktopApi = {
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGet),
    saveCredentials: (input) => ipcRenderer.invoke(IPC_CHANNELS.settingsSaveCredentials, input),
    importCookiesFile: () => ipcRenderer.invoke(IPC_CHANNELS.settingsImportCookiesFile),
    saveFfmpegPath: (ffmpegPath) => ipcRenderer.invoke(IPC_CHANNELS.settingsSaveFfmpegPath, ffmpegPath),
    saveDownloadDir: (downloadDir) =>
      ipcRenderer.invoke(IPC_CHANNELS.settingsSaveDownloadDir, downloadDir),
    pickFfmpegPath: () => ipcRenderer.invoke(IPC_CHANNELS.settingsPickFfmpegPath),
    pickDownloadDir: () => ipcRenderer.invoke(IPC_CHANNELS.settingsPickDownloadDir)
  },
  downloads: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.downloadsList),
    enqueue: (spaceUrl) => ipcRenderer.invoke(IPC_CHANNELS.downloadsEnqueue, spaceUrl),
    retry: (id) => ipcRenderer.invoke(IPC_CHANNELS.downloadsRetry, id),
    remove: (id) => ipcRenderer.invoke(IPC_CHANNELS.downloadsRemove, id),
    openFile: (id) => ipcRenderer.invoke(IPC_CHANNELS.downloadsOpenFile, id),
    openFolder: (id) => ipcRenderer.invoke(IPC_CHANNELS.downloadsOpenFolder, id)
  },
  library: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.libraryList),
    deleteRecord: (id) => ipcRenderer.invoke(IPC_CHANNELS.libraryDeleteRecord, id),
    deleteFile: (id) => ipcRenderer.invoke(IPC_CHANNELS.libraryDeleteFile, id)
  },
  events: {
    onDownloadUpdated: (listener) => subscribe(IPC_CHANNELS.eventDownloadsUpdated, listener),
    onQueueUpdated: (listener) => subscribe(IPC_CHANNELS.eventQueueUpdated, listener)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  const unsafeWindow = window as Window &
    typeof globalThis & {
      electron: typeof electronAPI
      api: DesktopApi
    }

  unsafeWindow.electron = electronAPI
  unsafeWindow.api = api
}

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const wrappedListener = (_event: Electron.IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, wrappedListener)
  return () => {
    ipcRenderer.removeListener(channel, wrappedListener)
  }
}
