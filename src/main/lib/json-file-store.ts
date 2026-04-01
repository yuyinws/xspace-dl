import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export class JsonFileStore<T> {
  private cache: T | null = null

  constructor(
    private readonly filePath: string,
    private readonly defaults: T
  ) {}

  async get(): Promise<T> {
    if (this.cache) {
      return this.cache
    }

    await mkdir(dirname(this.filePath), { recursive: true })

    try {
      const content = await readFile(this.filePath, 'utf8')
      this.cache = JSON.parse(content) as T
      return this.cache
    } catch {
      this.cache = this.defaults
      await this.persist(this.cache)
      return this.cache
    }
  }

  async set(nextValue: T): Promise<T> {
    this.cache = nextValue
    await this.persist(nextValue)
    return nextValue
  }

  async update(updater: (current: T) => T): Promise<T> {
    const current = await this.get()
    const nextValue = updater(current)
    return this.set(nextValue)
  }

  private async persist(value: T): Promise<void> {
    await writeFile(this.filePath, JSON.stringify(value, null, 2), 'utf8')
  }
}
