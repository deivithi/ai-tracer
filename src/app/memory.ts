import type { AgentAction, WorkspaceMemoryState } from './schemas'
import { nowIso } from './utils'

const DB_NAME = 'ai-tracer-memory'
const STORE_NAME = 'entries'
const DB_VERSION = 1
const FALLBACK_KEY = 'ai-tracer-memory-fallback'

export interface MemoryRecord {
  id: string
  kind: 'goal' | 'constraint' | 'criteria' | 'context' | 'episodic' | 'artifact' | 'summary'
  text: string
  keywords: string[]
  importance: number
  source: 'user' | 'agent' | 'system'
  createdAt: string
  updatedAt: string
  lastAccessedAt: string
}

export interface MemoryHydration {
  records: MemoryRecord[]
  snapshot: WorkspaceMemoryState
}

function canUseIndexedDb(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined'
}

function tokenize(value: string): string[] {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .split(/[^a-z0-9]+/i)
        .map((item) => item.trim())
        .filter((item) => item.length >= 3),
    ),
  ).slice(0, 24)
}

function clampText(value: string, max: number): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, max)
}

function uniqueTexts(values: string[], limit: number): string[] {
  return Array.from(new Set(values.map((value) => clampText(value, 320)).filter(Boolean))).slice(0, limit)
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (!canUseIndexedDb()) {
    return Promise.resolve(null)
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('updatedAt', 'updatedAt')
        store.createIndex('kind', 'kind')
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function loadFallback(): MemoryRecord[] {
  try {
    const raw = localStorage.getItem(FALLBACK_KEY)
    if (!raw) return []
    return JSON.parse(raw) as MemoryRecord[]
  } catch {
    return []
  }
}

function saveFallback(records: MemoryRecord[]): void {
  localStorage.setItem(FALLBACK_KEY, JSON.stringify(records.slice(-1_000)))
}

async function listAllRecords(): Promise<MemoryRecord[]> {
  const database = await openDatabase()
  if (!database) {
    return loadFallback()
  }

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.getAll()

    request.onsuccess = () => {
      resolve((request.result as MemoryRecord[]).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
    }
    request.onerror = () => reject(request.error)
  })
}

async function putRecords(records: MemoryRecord[]): Promise<void> {
  const database = await openDatabase()
  if (!database) {
    const current = loadFallback()
    const byId = new Map(current.map((record) => [record.id, record]))
    for (const record of records) {
      byId.set(record.id, record)
    }
    saveFallback(Array.from(byId.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
    return
  }

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    for (const record of records) {
      store.put(record)
    }

    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

function scoreMemory(record: MemoryRecord, queryTokens: string[], now: number): number {
  const overlap = record.keywords.filter((token) => queryTokens.includes(token)).length
  const freshnessHours = Math.max(1, (now - new Date(record.updatedAt).getTime()) / 3_600_000)
  const freshnessBoost = 1 / freshnessHours
  return overlap * 3 + record.importance * 0.8 + freshnessBoost
}

function createMemoryRecord(
  text: string,
  kind: MemoryRecord['kind'],
  source: MemoryRecord['source'],
  importance: number,
  existing?: MemoryRecord,
): MemoryRecord {
  const timestamp = nowIso()
  return {
    id: existing?.id ?? crypto.randomUUID(),
    kind,
    text: clampText(text, 600),
    keywords: tokenize(text),
    importance,
    source,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    lastAccessedAt: timestamp,
  }
}

async function upsertByText(entries: Array<{ text: string; kind: MemoryRecord['kind']; source: MemoryRecord['source']; importance: number }>) {
  const current = await listAllRecords()
  const next = entries
    .filter((entry) => entry.text.trim().length >= 6)
    .map((entry) => {
      const existing = current.find((record) => record.kind === entry.kind && record.text === clampText(entry.text, 600))
      return createMemoryRecord(entry.text, entry.kind, entry.source, entry.importance, existing)
    })

  await putRecords(next)
}

export async function hydrateMemories(query: string, limit = 6): Promise<MemoryHydration> {
  const current = await listAllRecords()
  const now = Date.now()
  const queryTokens = tokenize(query)
  const ranked = current
    .map((record) => ({ record, score: scoreMemory(record, queryTokens, now) }))
    .filter((entry) => entry.score > 0.15)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => ({
      ...entry.record,
      lastAccessedAt: nowIso(),
    }))

  if (ranked.length > 0) {
    await putRecords(ranked)
  }

  return {
    records: ranked,
    snapshot: {
      summary: ranked.length > 0
        ? `Memoria longa local carregada com ${ranked.length} lembranca(s) relevantes para este turno.`
        : 'Ainda nao ha memoria longa relevante recuperada para este turno.',
      totalEntries: current.length,
      retrieved: uniqueTexts(ranked.map((record) => record.text), 8),
      recent: uniqueTexts(current.map((record) => record.text), 8),
    },
  }
}

export async function rememberTurn(input: {
  userMessage: string
  assistantReply: string
  objective?: string
  desiredOutcome?: string
  constraints?: string[]
  criteria?: string[]
  context?: string[]
  executedActions?: AgentAction[]
}): Promise<WorkspaceMemoryState> {
  const entries: Array<{ text: string; kind: MemoryRecord['kind']; source: MemoryRecord['source']; importance: number }> = [
    { text: input.userMessage, kind: 'episodic', source: 'user', importance: 0.8 },
    { text: input.assistantReply, kind: 'summary', source: 'agent', importance: 0.9 },
  ]

  if (input.objective) {
    entries.push({ text: input.objective, kind: 'goal', source: 'user', importance: 1.4 })
  }

  if (input.desiredOutcome && clampText(input.desiredOutcome, 600) !== clampText(input.objective ?? '', 600)) {
    entries.push({ text: input.desiredOutcome, kind: 'goal', source: 'user', importance: 1.2 })
  }

  for (const item of input.constraints ?? []) {
    entries.push({ text: item, kind: 'constraint', source: 'user', importance: 1.1 })
  }

  for (const item of input.criteria ?? []) {
    entries.push({ text: item, kind: 'criteria', source: 'user', importance: 1.0 })
  }

  for (const item of input.context ?? []) {
    entries.push({ text: item, kind: 'context', source: 'user', importance: 0.9 })
  }

  if ((input.executedActions?.length ?? 0) > 0) {
    entries.push({
      text: `Acoes executadas no turno: ${(input.executedActions ?? []).join(', ')}`,
      kind: 'artifact',
      source: 'agent',
      importance: 1.0,
    })
  }

  await upsertByText(entries)
  const current = await listAllRecords()

  return {
    summary: current.length > 0
      ? `Memoria longa local ativa com ${current.length} registro(s) persistidos em armazenamento local-first.`
      : 'Memoria longa local ainda vazia.',
    totalEntries: current.length,
    retrieved: [],
    recent: uniqueTexts(current.map((record) => record.text), 8),
  }
}
