import type { TracerWorkspace } from './schemas'
import { workspaceSchema } from './schemas'
import type { RuntimePreferences } from './types'
import { DEFAULT_MODEL, PREFS_STORAGE, SESSION_KEY_STORAGE, WORKSPACE_STORAGE } from './utils'

export function loadPreferences(): RuntimePreferences {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE)
    if (!raw) {
      return {
        model: DEFAULT_MODEL,
        provider: 'openrouter',
        lastValidatedAt: null,
        lastView: 'mission',
      }
    }

    const parsed = JSON.parse(raw) as RuntimePreferences
    return {
      model: parsed.model || DEFAULT_MODEL,
      provider: 'openrouter',
      lastValidatedAt: parsed.lastValidatedAt ?? null,
      lastView: parsed.lastView ?? 'mission',
    }
  } catch {
    return {
      model: DEFAULT_MODEL,
      provider: 'openrouter',
      lastValidatedAt: null,
      lastView: 'mission',
    }
  }
}

export function savePreferences(preferences: RuntimePreferences): void {
  localStorage.setItem(PREFS_STORAGE, JSON.stringify(preferences))
}

export function loadWorkspace(): TracerWorkspace | null {
  try {
    const raw = localStorage.getItem(WORKSPACE_STORAGE)
    if (!raw) {
      return null
    }

    return workspaceSchema.parse(JSON.parse(raw))
  } catch {
    return null
  }
}

export function saveWorkspace(workspace: TracerWorkspace): void {
  localStorage.setItem(WORKSPACE_STORAGE, JSON.stringify(workspace))
}

export function saveSessionKey(key: string): void {
  sessionStorage.setItem(SESSION_KEY_STORAGE, key)
}

export function loadSessionKey(): string {
  return sessionStorage.getItem(SESSION_KEY_STORAGE) ?? ''
}

export function clearSessionKey(): void {
  sessionStorage.removeItem(SESSION_KEY_STORAGE)
}
