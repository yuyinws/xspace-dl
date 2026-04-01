import { appendFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import type { ApiResult, DownloadTask, LibraryItem, SaveCredentialsInput, StoredCredentials } from '@shared/contracts'
import { IPC_CHANNELS } from '@shared/contracts'
import { fail, ok } from '@shared/result'

import { loadCookiesFile, validateCookies } from '../../dl-lib/cookies'
import icon from '../../resources/icon.png?asset'
import { DownloadManager } from './services/download-manager'
import { LibraryStore } from './services/library-store'
import { SettingsStore } from './services/settings-store'
import { invokeIpc } from './lib/invoke-ipc'

let mainWindow: BrowserWindow | null = null
const MAIN_LOG_PATH = '/tmp/xspace-electron-main.log'

function logMain(...args: unknown[]): void {
  const line = `[${new Date().toISOString()}] ${args
    .map((value) => {
      if (value instanceof Error) {
        return `${value.name}: ${value.message}\n${value.stack ?? ''}`
      }

      if (typeof value === 'object' && value !== null) {
        try {
          return JSON.stringify(value)
        } catch {
          return String(value)
        }
      }

      return String(value)
    })
    .join(' ')}\n`

  try {
    appendFileSync(MAIN_LOG_PATH, line, 'utf8')
  } catch {
    // Ignore logging failures to avoid affecting app startup.
  }

  console.log(...args)
}

process.on('uncaughtException', (error) => {
  logMain('[main] uncaughtException', error)
})

process.on('unhandledRejection', (reason) => {
  logMain('[main] unhandledRejection', reason)
})

logMain('[main] module loaded')

function publishQueue(tasks: DownloadTask[]): void {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(IPC_CHANNELS.eventQueueUpdated, tasks)
  })
}

function publishLibrary(items: LibraryItem[]): void {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(IPC_CHANNELS.eventDownloadsUpdated, items)
  })
}

function createWindow(): void {
  const isMac = process.platform === 'darwin'

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 760,
    show: false,
    autoHideMenuBar: true,
    title: 'xspace-dl',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    backgroundColor: '#f7f1e7',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    logMain('[main] ready-to-show')
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    logMain('[main] window closed')
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('did-finish-load', () => {
    logMain('[main] did-finish-load')
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show()
    }
  })

  mainWindow.webContents.on('did-fail-load', (_event, code, description, validatedUrl) => {
    logMain('[main] did-fail-load', { code, description, validatedUrl })
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logMain('[main] render-process-gone', details)
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    logMain('[main] loading renderer url', process.env['ELECTRON_RENDERER_URL'])
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    mainWindow.show()
  } else {
    logMain('[main] loading renderer file')
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  logMain('[app] whenReady')
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    logMain('[app] browser-window-created')
    optimizer.watchWindowShortcuts(window)
  })

  app.on('child-process-gone', (_event, details) => {
    logMain('[app] child-process-gone', details)
  })

  app.on('render-process-gone', (_event, _webContents, details) => {
    logMain('[app] render-process-gone', details)
  })

  const settingsStore = new SettingsStore(join(app.getPath('userData'), 'settings.json'), {
    credentials: null,
    ffmpegPath: '',
    downloadDir: join(app.getPath('downloads'), 'x-space-audio')
  })
  const libraryStore = new LibraryStore(join(app.getPath('userData'), 'library.json'))
  const downloadManager = new DownloadManager(settingsStore, libraryStore, {
    publishTasks: publishQueue,
    publishLibrary
  })

  void settingsStore.get()
  void libraryStore.list().then((items) => publishLibrary(items))

  registerIpcHandlers(settingsStore, libraryStore, downloadManager)

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  logMain('[app] window-all-closed')
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

function registerIpcHandlers(
  settingsStore: SettingsStore,
  libraryStore: LibraryStore,
  downloadManager: DownloadManager
): void {
  handle(
    IPC_CHANNELS.settingsGet,
    async () => ok(await settingsStore.get())
  )
  handle(
    IPC_CHANNELS.settingsSaveCredentials,
    async (_event, payload: SaveCredentialsInput) => {
      const credentials = validateCookies({
        authToken: payload.authToken.trim(),
        ct0: payload.ct0.trim()
      })
      const nextSettings = await settingsStore.saveCredentials(makeStoredCredentials(payload.mode, credentials))
      return ok(nextSettings)
    }
  )
  handle(IPC_CHANNELS.settingsImportCookiesFile, async () => {
    const selectedFile = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Cookies', extensions: ['txt', 'cookies'] }]
    })

    if (selectedFile.canceled || selectedFile.filePaths.length === 0) {
      return fail('Cookies import cancelled', 'CANCELLED')
    }

    const credentials = await loadCookiesFile(selectedFile.filePaths[0])
    const nextSettings = await settingsStore.saveCredentials(makeStoredCredentials('file', credentials))
    return ok(nextSettings)
  })
  handle(
    IPC_CHANNELS.settingsSaveFfmpegPath,
    async (_event, ffmpegPath: string) => ok(await settingsStore.saveFfmpegPath(ffmpegPath))
  )
  handle(
    IPC_CHANNELS.settingsSaveDownloadDir,
    async (_event, downloadDir: string) => ok(await settingsStore.saveDownloadDir(downloadDir))
  )
  handle(IPC_CHANNELS.settingsPickFfmpegPath, async () => {
    const selectedFile = await dialog.showOpenDialog({
      properties: ['openFile']
    })

    if (selectedFile.canceled || selectedFile.filePaths.length === 0) {
      return fail('No ffmpeg binary selected', 'CANCELLED')
    }

    return ok(selectedFile.filePaths[0])
  })
  handle(IPC_CHANNELS.settingsPickDownloadDir, async () => {
    const selectedDir = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    })

    if (selectedDir.canceled || selectedDir.filePaths.length === 0) {
      return fail('No download directory selected', 'CANCELLED')
    }

    return ok(selectedDir.filePaths[0])
  })
  handle(IPC_CHANNELS.downloadsList, async () => ok(downloadManager.list()))
  handle(
    IPC_CHANNELS.downloadsEnqueue,
    async (_event, spaceUrl: string) => ok(await downloadManager.enqueue(spaceUrl))
  )
  handle(
    IPC_CHANNELS.downloadsRetry,
    async (_event, id: string) => ok(await downloadManager.retry(id))
  )
  handle(
    IPC_CHANNELS.downloadsRemove,
    async (_event, id: string) => ok(downloadManager.remove(id))
  )
  handle(IPC_CHANNELS.downloadsOpenFile, async (_event, id: string) => {
    const item = await libraryStore.get(id)
    if (!item?.outputPath) {
      throw new Error('Downloaded file not found')
    }

    const shellResult = await shell.openPath(item.outputPath)
    if (shellResult) {
      throw new Error(shellResult)
    }
    return ok(true)
  })
  handle(IPC_CHANNELS.downloadsOpenFolder, async (_event, id: string) => {
    const item = await libraryStore.get(id)
    if (!item?.outputPath) {
      throw new Error('Downloaded file not found')
    }

    shell.showItemInFolder(item.outputPath)
    return ok(true)
  })
  handle(IPC_CHANNELS.libraryList, async () => ok(await libraryStore.list()))
  handle(IPC_CHANNELS.libraryDeleteRecord, async (_event, id: string) => {
    const items = await libraryStore.delete(id)
    publishLibrary(items)
    return ok(true)
  })
  handle(IPC_CHANNELS.libraryDeleteFile, async (_event, id: string) => {
    const item = await libraryStore.get(id)
    if (!item?.outputPath) {
      throw new Error('Downloaded file not found')
    }

    await rm(item.outputPath, { force: true })
    const items = await libraryStore.delete(id)
    publishLibrary(items)
    return ok(true)
  })
}

function handle<TArgs extends unknown[], TResult>(
  channel: string,
  handler: (_event: Electron.IpcMainInvokeEvent, ...args: TArgs) => Promise<ApiResult<TResult>>
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    return invokeIpc(() => handler(event, ...(args as TArgs)))
  })
}

function makeStoredCredentials(
  mode: SaveCredentialsInput['mode'],
  credentials: { authToken: string; ct0: string }
): StoredCredentials {
  return {
    mode,
    authToken: credentials.authToken,
    ct0: credentials.ct0,
    lastUpdatedAt: new Date().toISOString()
  }
}
