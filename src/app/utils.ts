import type { AttachmentRecord } from './schemas'
import type { ViewId } from './types'

export const APP_VERSION = '1.0.0'
export const DEFAULT_MODEL = 'minimax/minimax-m2.7'
export const SESSION_KEY_STORAGE = 'ai-tracer-session-key'
export const PREFS_STORAGE = 'ai-tracer-prefs'
export const WORKSPACE_STORAGE = 'ai-tracer-workspace'
export const MAX_FILE_SIZE = 120_000

export function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function resolveHash(defaultView: ViewId): ViewId {
  const value = window.location.hash.replace('#', '').trim() as ViewId
  const views: ViewId[] = ['mission', 'goal', 'plan', 'phases', 'execution', 'verification', 'workspace']
  return views.includes(value) ? value : defaultView
}

export function setHash(view: ViewId): void {
  window.location.hash = view
}

export async function copyText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value)
}

export function downloadBlob(filename: string, blob: Blob): void {
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(href)
}

export async function readFiles(files: FileList | null): Promise<{ accepted: AttachmentRecord[]; rejected: string[] }> {
  if (!files) {
    return { accepted: [], rejected: [] }
  }

  const accepted: AttachmentRecord[] = []
  const rejected: string[] = []

  for (const file of Array.from(files).slice(0, 6)) {
    if (file.size > MAX_FILE_SIZE) {
      rejected.push(`${file.name}: excede o limite de ${Math.round(MAX_FILE_SIZE / 1000)} KB.`)
      continue
    }

    const lower = file.name.toLowerCase()
    const kind = lower.endsWith('.md')
      ? 'markdown'
      : lower.endsWith('.json')
        ? 'json'
        : lower.endsWith('.ts') || lower.endsWith('.tsx') || lower.endsWith('.js') || lower.endsWith('.jsx')
          ? 'code'
          : 'text'

    const content = await file.text()
    accepted.push({
      id: createId('ctx'),
      name: file.name,
      kind,
      content: content.slice(0, 150_000),
      size: file.size,
    })
  }

  return { accepted, rejected }
}

export function joinBullets(items: string[]): string {
  return items.map((item) => `- ${item}`).join('\n')
}

export function sanitizeModelText(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[•·]/g, '-')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .split('')
    .map((character) => {
      const code = character.charCodeAt(0)
      if (character === '\n' || character === '\r' || character === '\t') {
        return character
      }
      return code >= 32 && code <= 126 ? character : ' '
    })
    .join('')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}
