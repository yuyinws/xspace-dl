import { zodResolver } from '@hookform/resolvers/zod'
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  DownloadIcon,
  FileAudioIcon,
  FolderOpenIcon,
  HardDriveDownloadIcon,
  ImportIcon,
  LoaderCircleIcon,
  RefreshCcwIcon,
  ShieldCheckIcon,
  Trash2Icon
} from 'lucide-react'
import { startTransition, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Toaster, toast } from 'sonner'
import { z } from 'zod'

import type { AppSettings, DownloadTask, LibraryItem } from '@shared/contracts'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const credentialsSchema = z.object({
  authToken: z.string().trim().min(1, 'auth_token is required'),
  ct0: z.string().trim().min(1, 'ct0 is required')
})

const queueSchema = z.object({
  spaceUrl: z
    .string()
    .trim()
    .min(1, 'Space URL is required')
    .refine((value) => /^https?:\/\/x\.com\/i\/spaces\/\w+$/i.test(value), {
      message: 'Use a full X Space URL such as https://x.com/i/spaces/...'
    })
})

type CredentialsFormValues = z.infer<typeof credentialsSchema>
type QueueFormValues = z.infer<typeof queueSchema>

function App(): React.JSX.Element {
  const hasCustomTitlebar = navigator.userAgent.includes('Mac')
  const [isBooting, setIsBooting] = useState(true)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [tasks, setTasks] = useState<DownloadTask[]>([])
  const [library, setLibrary] = useState<LibraryItem[]>([])
  const [ffmpegPath, setFfmpegPath] = useState('')
  const [downloadDir, setDownloadDir] = useState('')
  const [pendingDelete, setPendingDelete] = useState<{
    id: string
    mode: 'record' | 'file'
    title: string
  } | null>(null)

  const credentialsForm = useForm<CredentialsFormValues>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: {
      authToken: '',
      ct0: ''
    }
  })

  const queueForm = useForm<QueueFormValues>({
    resolver: zodResolver(queueSchema),
    defaultValues: {
      spaceUrl: ''
    }
  })

  useEffect(() => {
    let active = true

    const syncSettings = (nextSettings: AppSettings): void => {
      setSettings(nextSettings)
      setFfmpegPath(nextSettings.ffmpegPath)
      setDownloadDir(nextSettings.downloadDir)
      credentialsForm.reset({
        authToken: nextSettings.credentials?.authToken ?? '',
        ct0: nextSettings.credentials?.ct0 ?? ''
      })
    }

    const hydrate = async (): Promise<void> => {
      const [settingsResult, tasksResult, libraryResult] = await Promise.all([
        window.api.settings.get(),
        window.api.downloads.list(),
        window.api.library.list()
      ])

      if (!active) {
        return
      }

      if (settingsResult.ok) {
        syncSettings(settingsResult.data)
      } else {
        toast.error(settingsResult.error.message)
      }

      if (tasksResult.ok) {
        setTasks(tasksResult.data)
      } else {
        toast.error(tasksResult.error.message)
      }

      if (libraryResult.ok) {
        setLibrary(libraryResult.data)
      } else {
        toast.error(libraryResult.error.message)
      }

      setIsBooting(false)
    }

    void hydrate()

    const unsubscribeDownloads = window.api.events.onDownloadUpdated((items) => {
      startTransition(() => {
        setLibrary(items)
      })
    })

    const unsubscribeQueue = window.api.events.onQueueUpdated((nextTasks) => {
      startTransition(() => {
        setTasks(nextTasks)
      })
    })

    return () => {
      active = false
      unsubscribeDownloads()
      unsubscribeQueue()
    }
  }, [credentialsForm])

  const syncSettings = (nextSettings: AppSettings): void => {
    startTransition(() => {
      setSettings(nextSettings)
      setFfmpegPath(nextSettings.ffmpegPath)
      setDownloadDir(nextSettings.downloadDir)
    })

    credentialsForm.reset({
      authToken: nextSettings.credentials?.authToken ?? '',
      ct0: nextSettings.credentials?.ct0 ?? ''
    })
  }

  const saveManualCredentials = credentialsForm.handleSubmit(async (values) => {
    const result = await window.api.settings.saveCredentials({
      mode: 'manual',
      authToken: values.authToken,
      ct0: values.ct0
    })

    if (!result.ok) {
      toast.error(result.error.message)
      return
    }

    syncSettings(result.data)
    toast.success('Credentials saved to local settings')
  })

  const submitQueue = queueForm.handleSubmit(async (values) => {
    const result = await window.api.downloads.enqueue(values.spaceUrl)
    if (!result.ok) {
      toast.error(result.error.message)
      return
    }

    queueForm.reset()
    toast.success('Space added to the queue')
  })

  const importCookiesFile = async (): Promise<void> => {
    const result = await window.api.settings.importCookiesFile()
    if (!result.ok) {
      if (result.error.code !== 'CANCELLED') {
        toast.error(result.error.message)
      }
      return
    }

    syncSettings(result.data)
    toast.success('Cookies imported successfully')
  }

  const chooseFfmpegPath = async (): Promise<void> => {
    const result = await window.api.settings.pickFfmpegPath()
    if (!result.ok) {
      if (result.error.code !== 'CANCELLED') {
        toast.error(result.error.message)
      }
      return
    }

    setFfmpegPath(result.data)
  }

  const chooseDownloadDir = async (): Promise<void> => {
    const result = await window.api.settings.pickDownloadDir()
    if (!result.ok) {
      if (result.error.code !== 'CANCELLED') {
        toast.error(result.error.message)
      }
      return
    }

    setDownloadDir(result.data)
  }

  const persistFfmpegPath = async (): Promise<void> => {
    const result = await window.api.settings.saveFfmpegPath(ffmpegPath)
    if (!result.ok) {
      toast.error(result.error.message)
      return
    }

    syncSettings(result.data)
    toast.success('ffmpeg path updated')
  }

  const persistDownloadDir = async (): Promise<void> => {
    const result = await window.api.settings.saveDownloadDir(downloadDir)
    if (!result.ok) {
      toast.error(result.error.message)
      return
    }

    syncSettings(result.data)
    toast.success('Download directory updated')
  }

  const retryTask = async (id: string): Promise<void> => {
    const result = await window.api.downloads.retry(id)
    if (!result.ok) {
      toast.error(result.error.message)
      return
    }

    toast.success('Task queued for retry')
  }

  const removeTask = async (id: string): Promise<void> => {
    const result = await window.api.downloads.remove(id)
    if (!result.ok) {
      toast.error(result.error.message)
      return
    }

    toast.success('Task removed from the queue list')
  }

  const openFile = async (id: string): Promise<void> => {
    const result = await window.api.downloads.openFile(id)
    if (!result.ok) {
      toast.error(result.error.message)
      return
    }
  }

  const openFolder = async (id: string): Promise<void> => {
    const result = await window.api.downloads.openFolder(id)
    if (!result.ok) {
      toast.error(result.error.message)
      return
    }
  }

  const confirmDeletion = async (): Promise<void> => {
    if (!pendingDelete) {
      return
    }

    const result =
      pendingDelete.mode === 'record'
        ? await window.api.library.deleteRecord(pendingDelete.id)
        : await window.api.library.deleteFile(pendingDelete.id)

    if (!result.ok) {
      toast.error(result.error.message)
      return
    }

    toast.success(pendingDelete.mode === 'record' ? 'Record removed from library' : 'Audio file deleted')
    setPendingDelete(null)
  }

  const downloadingCount = tasks.filter((task) =>
    ['queued', 'resolving', 'downloading'].includes(task.status)
  ).length
  const failedCount = library.filter((item) => item.status === 'failed').length
  const successCount = library.filter((item) => item.status === 'success').length

  return (
    <>
      <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(175,117,76,0.18),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(28,60,75,0.16),transparent_38%),linear-gradient(135deg,rgba(255,255,255,0.72),rgba(247,241,231,0.96))]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[linear-gradient(180deg,rgba(57,37,24,0.08),transparent)]" />
        {hasCustomTitlebar && <div className="app-drag app-drag-sticky is-scrolled" aria-hidden="true" />}
        <main className="relative mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-6 px-5 py-6 md:px-8 xl:px-10">
          {hasCustomTitlebar && <div className="app-drag-spacer" aria-hidden="true" />}
          <header className="grid gap-4 rounded-[28px] border border-border/70 bg-background/85 p-6 shadow-[0_30px_90px_-48px_rgba(53,40,28,0.48)] backdrop-blur xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex flex-col gap-4">
              <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.24em]">
                Editorial Utility Desktop
              </Badge>
              <div className="flex flex-col gap-3">
                <h1 className="max-w-3xl font-serif text-4xl leading-tight tracking-tight text-foreground md:text-5xl">
                  Capture finished X Spaces, then keep the audio library tidy.
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                  Import cookies, point the app at your system <code>ffmpeg</code>, and queue Space URLs.
                  Downloads run one at a time, metadata is preserved, and the library stays available after restart.
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <MetricCard label="Active Queue" value={String(downloadingCount)} detail="Queued, resolving, or downloading" />
              <MetricCard label="Completed Audio" value={String(successCount)} detail="Saved into your local library" />
              <MetricCard label="Needs Attention" value={String(failedCount)} detail="Retryable failures and missing files" />
            </div>
          </header>

          <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
            <section className="flex flex-col gap-6">
              <Card className="border-border/70 bg-background/88 shadow-[0_24px_70px_-50px_rgba(58,39,24,0.5)] backdrop-blur">
                <CardHeader>
                  <CardTitle className="font-serif text-2xl">Access</CardTitle>
                  <CardDescription>
                    Credentials are stored in your local app settings and reused across launches.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-5">
                  <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-muted/60 px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium">Current credential state</span>
                      <span className="text-xs text-muted-foreground">
                        {settings?.credentials ? `Saved via ${settings.credentials.mode}` : 'No credentials configured yet'}
                      </span>
                    </div>
                    <StatusBadge status={settings?.credentials ? 'success' : 'failed'}>
                      {settings?.credentials ? 'Ready' : 'Missing'}
                    </StatusBadge>
                  </div>

                  {!settings?.credentials && (
                    <Alert variant="destructive">
                      <AlertCircleIcon />
                      <AlertTitle>Credentials required</AlertTitle>
                      <AlertDescription>
                        Downloads need a valid <code>auth_token</code> and <code>ct0</code>. Import a cookies file
                        or paste the values manually.
                      </AlertDescription>
                    </Alert>
                  )}

                  <Button type="button" variant="outline" onClick={importCookiesFile}>
                    <ImportIcon data-icon="inline-start" />
                    Import cookies file
                  </Button>

                  <Separator />

                  <form className="flex flex-col gap-5" onSubmit={saveManualCredentials}>
                    <FieldGroup>
                      <Field data-invalid={Boolean(credentialsForm.formState.errors.authToken)}>
                        <FieldLabel htmlFor="authToken">auth_token</FieldLabel>
                        <Input
                          id="authToken"
                          type="password"
                          placeholder="Paste auth_token"
                          aria-invalid={Boolean(credentialsForm.formState.errors.authToken)}
                          {...credentialsForm.register('authToken')}
                        />
                        <FieldDescription>Used for authenticated X API access.</FieldDescription>
                        <FieldError errors={[credentialsForm.formState.errors.authToken]} />
                      </Field>
                      <Field data-invalid={Boolean(credentialsForm.formState.errors.ct0)}>
                        <FieldLabel htmlFor="ct0">ct0</FieldLabel>
                        <Input
                          id="ct0"
                          type="password"
                          placeholder="Paste ct0"
                          aria-invalid={Boolean(credentialsForm.formState.errors.ct0)}
                          {...credentialsForm.register('ct0')}
                        />
                        <FieldDescription>Saved locally and used to create the Twitter client.</FieldDescription>
                        <FieldError errors={[credentialsForm.formState.errors.ct0]} />
                      </Field>
                    </FieldGroup>
                    <Button type="submit" disabled={credentialsForm.formState.isSubmitting}>
                      {credentialsForm.formState.isSubmitting ? (
                        <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
                      ) : (
                        <ShieldCheckIcon data-icon="inline-start" />
                      )}
                      Save manual credentials
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card className="border-border/70 bg-background/88 shadow-[0_24px_70px_-50px_rgba(58,39,24,0.5)] backdrop-blur">
                <CardHeader>
                  <CardTitle className="font-serif text-2xl">Paths</CardTitle>
                  <CardDescription>Blank ffmpeg path means the app will call the system binary named <code>ffmpeg</code>.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-5">
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="ffmpegPath">ffmpeg path</FieldLabel>
                      <Input
                        id="ffmpegPath"
                        value={ffmpegPath}
                        onChange={(event) => setFfmpegPath(event.target.value)}
                        placeholder="ffmpeg"
                      />
                      <FieldDescription>Choose a binary if <code>ffmpeg</code> is not on your PATH.</FieldDescription>
                    </Field>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" className="flex-1" onClick={chooseFfmpegPath}>
                        <FolderOpenIcon data-icon="inline-start" />
                        Browse
                      </Button>
                      <Button type="button" className="flex-1" onClick={persistFfmpegPath}>
                        <HardDriveDownloadIcon data-icon="inline-start" />
                        Save
                      </Button>
                    </div>
                    <Field>
                      <FieldLabel htmlFor="downloadDir">Download directory</FieldLabel>
                      <Input
                        id="downloadDir"
                        value={downloadDir}
                        onChange={(event) => setDownloadDir(event.target.value)}
                        placeholder="Choose where .m4a files should land"
                      />
                      <FieldDescription>The library keeps the final file path for each successful download.</FieldDescription>
                    </Field>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" className="flex-1" onClick={chooseDownloadDir}>
                        <FolderOpenIcon data-icon="inline-start" />
                        Browse
                      </Button>
                      <Button type="button" className="flex-1" onClick={persistDownloadDir}>
                        <HardDriveDownloadIcon data-icon="inline-start" />
                        Save
                      </Button>
                    </div>
                  </FieldGroup>
                </CardContent>
              </Card>
            </section>

            <section className="flex min-h-0 flex-col gap-6">
              <Card className="border-border/70 bg-background/90 shadow-[0_28px_80px_-54px_rgba(58,39,24,0.55)] backdrop-blur">
                <CardHeader>
                  <CardTitle className="font-serif text-2xl">Queue a Space</CardTitle>
                  <CardDescription>
                    Paste a finished Space URL. The app will resolve metadata first, then download audio serially.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="flex flex-col gap-4 md:flex-row" onSubmit={submitQueue}>
                    <Field
                      className="md:flex-1"
                      data-invalid={Boolean(queueForm.formState.errors.spaceUrl)}
                    >
                      <FieldLabel htmlFor="spaceUrl" className="sr-only">
                        Space URL
                      </FieldLabel>
                      <Input
                        id="spaceUrl"
                        placeholder="https://x.com/i/spaces/1ypKd..."
                        aria-invalid={Boolean(queueForm.formState.errors.spaceUrl)}
                        {...queueForm.register('spaceUrl')}
                      />
                      <FieldError errors={[queueForm.formState.errors.spaceUrl]} />
                    </Field>
                    <Button type="submit" className="md:self-start" disabled={queueForm.formState.isSubmitting}>
                      {queueForm.formState.isSubmitting ? (
                        <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
                      ) : (
                        <DownloadIcon data-icon="inline-start" />
                      )}
                      Add to queue
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card className="min-h-[560px] border-border/70 bg-background/90 shadow-[0_28px_80px_-54px_rgba(58,39,24,0.55)] backdrop-blur">
                <CardHeader>
                  <CardTitle className="font-serif text-2xl">Operations</CardTitle>
                  <CardDescription>Track queue progress and manage the persistent local audio library.</CardDescription>
                </CardHeader>
                <CardContent className="min-h-0 flex-1">
                  <Tabs defaultValue="queue" className="min-h-0">
                    <TabsList variant="line" className="w-full justify-start">
                      <TabsTrigger value="queue">Queue</TabsTrigger>
                      <TabsTrigger value="library">Library</TabsTrigger>
                    </TabsList>

                    <TabsContent value="queue" className="mt-4 min-h-0">
                      {isBooting ? (
                        <div className="flex flex-col gap-3">
                          <Skeleton className="h-24 rounded-2xl" />
                          <Skeleton className="h-24 rounded-2xl" />
                          <Skeleton className="h-24 rounded-2xl" />
                        </div>
                      ) : tasks.length === 0 ? (
                        <Alert>
                          <DownloadIcon />
                          <AlertTitle>No queued work yet</AlertTitle>
                          <AlertDescription>Submit a finished Space URL to start the first download task.</AlertDescription>
                        </Alert>
                      ) : (
                        <ScrollArea className="h-[460px] pr-4">
                          <div className="flex flex-col gap-3">
                            {tasks.map((task) => (
                              <div
                                key={task.id}
                                className="rounded-2xl border border-border/70 bg-muted/35 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]"
                              >
                                <div className="flex flex-col gap-3">
                                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                    <div className="flex flex-col gap-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <StatusBadge status={task.status}>{task.status}</StatusBadge>
                                        <span className="text-sm font-medium">{task.title || task.spaceUrl}</span>
                                      </div>
                                      <span className="text-xs text-muted-foreground">
                                        {task.creatorName ? `${task.creatorName} · ` : ''}
                                        {task.progressText}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      {task.status === 'failed' && (
                                        <Button type="button" variant="outline" size="sm" onClick={() => retryTask(task.id)}>
                                          <RefreshCcwIcon data-icon="inline-start" />
                                          Retry
                                        </Button>
                                      )}
                                      {(task.status === 'failed' || task.status === 'success' || task.status === 'cancelled') && (
                                        <Button type="button" variant="ghost" size="sm" onClick={() => removeTask(task.id)}>
                                          <Trash2Icon data-icon="inline-start" />
                                          Remove
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                  {task.error && (
                                    <Alert variant="destructive">
                                      <AlertCircleIcon />
                                      <AlertTitle>Task failed</AlertTitle>
                                      <AlertDescription>{task.error}</AlertDescription>
                                    </Alert>
                                  )}
                                  {typeof task.progressPercent === 'number' &&
                                    ['queued', 'resolving', 'downloading', 'success'].includes(task.status) && (
                                      <div className="flex flex-col gap-2">
                                        <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                                          <span>Progress</span>
                                          <span>{task.progressPercent}%</span>
                                        </div>
                                        <Progress value={task.progressPercent} />
                                      </div>
                                    )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      )}
                    </TabsContent>

                    <TabsContent value="library" className="mt-4 min-h-0">
                      {isBooting ? (
                        <div className="flex flex-col gap-3">
                          <Skeleton className="h-28 rounded-2xl" />
                          <Skeleton className="h-28 rounded-2xl" />
                        </div>
                      ) : library.length === 0 ? (
                        <Alert>
                          <FileAudioIcon />
                          <AlertTitle>Library is empty</AlertTitle>
                          <AlertDescription>Successful downloads will appear here with actions for opening or removing files.</AlertDescription>
                        </Alert>
                      ) : (
                        <ScrollArea className="h-[460px] pr-4">
                          <div className="flex flex-col gap-3">
                            {library.map((item) => (
                              <div
                                key={item.id}
                                className="rounded-2xl border border-border/70 bg-muted/35 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]"
                              >
                                <div className="flex flex-col gap-4">
                                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                    <div className="flex flex-col gap-2">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <StatusBadge status={item.status}>{item.status}</StatusBadge>
                                        <h3 className="text-sm font-medium">{item.title}</h3>
                                      </div>
                                      <p className="text-xs text-muted-foreground">
                                        {item.creatorName} · @{item.creatorScreenName} · {item.startDate || 'Unknown date'}
                                      </p>
                                      <p className="break-all text-xs text-muted-foreground">
                                        {item.outputPath || item.spaceUrl}
                                      </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      {item.status === 'success' && (
                                        <>
                                          <Button type="button" variant="outline" size="sm" onClick={() => openFile(item.id)}>
                                            <FileAudioIcon data-icon="inline-start" />
                                            Open file
                                          </Button>
                                          <Button type="button" variant="outline" size="sm" onClick={() => openFolder(item.id)}>
                                            <FolderOpenIcon data-icon="inline-start" />
                                            Show folder
                                          </Button>
                                        </>
                                      )}
                                      {item.status === 'failed' && (
                                        <Button type="button" size="sm" onClick={() => retryTask(item.id)}>
                                          <RefreshCcwIcon data-icon="inline-start" />
                                          Retry
                                        </Button>
                                      )}
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                          setPendingDelete({
                                            id: item.id,
                                            mode: 'record',
                                            title: item.title
                                          })
                                        }
                                      >
                                        <Trash2Icon data-icon="inline-start" />
                                        Remove record
                                      </Button>
                                      {item.outputPath && (
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={() =>
                                            setPendingDelete({
                                              id: item.id,
                                              mode: 'file',
                                              title: item.title
                                            })
                                          }
                                        >
                                          <Trash2Icon data-icon="inline-start" />
                                          Delete file
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                  {item.error && (
                                    <Alert variant="destructive">
                                      <AlertCircleIcon />
                                      <AlertTitle>Stored failure reason</AlertTitle>
                                      <AlertDescription>{item.error}</AlertDescription>
                                    </Alert>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
                <CardFooter className="justify-between border-t border-border/70 text-xs text-muted-foreground">
                  <span>Downloads run serially to avoid ffmpeg and network contention.</span>
                  <span>{library.length} library records</span>
                </CardFooter>
              </Card>
            </section>
          </div>
        </main>
      </div>

      <Dialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Confirm removal</DialogTitle>
            <DialogDescription>
              {pendingDelete?.mode === 'record'
                ? `Remove “${pendingDelete?.title}” from the local library list? The audio file will stay on disk.`
                : `Delete the downloaded audio file for “${pendingDelete?.title}”? This also removes the library record.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={confirmDeletion}>
              <Trash2Icon data-icon="inline-start" />
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toaster position="top-right" richColors />
    </>
  )
}

function MetricCard(props: { label: string; value: string; detail: string }): React.JSX.Element {
  return (
    <div className="rounded-2xl border border-border/70 bg-muted/55 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{props.label}</div>
      <div className="mt-2 font-serif text-3xl leading-none text-foreground">{props.value}</div>
      <div className="mt-2 text-xs leading-5 text-muted-foreground">{props.detail}</div>
    </div>
  )
}

function StatusBadge({
  status,
  children
}: {
  status: DownloadTask['status'] | 'success'
  children: React.ReactNode
}): React.JSX.Element {
  if (status === 'success') {
    return (
      <Badge variant="secondary">
        <CheckCircle2Icon />
        {children}
      </Badge>
    )
  }

  if (status === 'failed') {
    return (
      <Badge variant="destructive">
        <AlertCircleIcon />
        {children}
      </Badge>
    )
  }

  if (status === 'queued' || status === 'resolving' || status === 'downloading') {
    return (
      <Badge variant="outline">
        <LoaderCircleIcon className={status === 'downloading' ? 'animate-spin' : undefined} />
        {children}
      </Badge>
    )
  }

  return <Badge variant="outline">{children}</Badge>
}

export default App
