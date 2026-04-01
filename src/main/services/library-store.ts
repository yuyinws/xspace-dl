import type { LibraryItem } from '@shared/contracts'

import { JsonFileStore } from '../lib/json-file-store'

interface LibraryState {
  items: LibraryItem[]
}

export class LibraryStore {
  private readonly store: JsonFileStore<LibraryState>

  constructor(filePath: string) {
    this.store = new JsonFileStore(filePath, { items: [] })
  }

  async list(): Promise<LibraryItem[]> {
    const state = await this.store.get()
    return [...state.items].sort(sortByUpdatedAt)
  }

  async get(id: string): Promise<LibraryItem | undefined> {
    const items = await this.list()
    return items.find((item) => item.id === id)
  }

  async upsert(item: LibraryItem): Promise<LibraryItem[]> {
    const state = await this.store.get()
    const existingIndex = state.items.findIndex((entry) => entry.id === item.id)
    const nextItems = [...state.items]

    if (existingIndex >= 0) {
      nextItems[existingIndex] = {
        ...nextItems[existingIndex],
        ...item,
        createdAt: nextItems[existingIndex].createdAt
      }
    } else {
      nextItems.push(item)
    }

    await this.store.set({ items: nextItems })
    return [...nextItems].sort(sortByUpdatedAt)
  }

  async delete(id: string): Promise<LibraryItem[]> {
    const state = await this.store.get()
    const nextItems = state.items.filter((item) => item.id !== id)
    await this.store.set({ items: nextItems })
    return [...nextItems].sort(sortByUpdatedAt)
  }
}

function sortByUpdatedAt(a: LibraryItem, b: LibraryItem): number {
  return b.updatedAt.localeCompare(a.updatedAt)
}
