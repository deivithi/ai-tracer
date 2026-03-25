import type { GoalInput, TracerWorkspace } from './schemas'

export type ViewId = 'mission' | 'goal' | 'plan' | 'phases' | 'execution' | 'verification' | 'workspace'

export interface RuntimePreferences {
  model: string
  provider: 'openrouter'
  lastValidatedAt: string | null
  lastView: ViewId
}

export interface RuntimeConnection {
  apiKey: string
  model: string
  provider: 'openrouter'
}

export interface BannerMessage {
  tone: 'neutral' | 'success' | 'warning' | 'danger'
  title: string
  body: string
}

export interface FileImportResult {
  accepted: GoalInput['attachments']
  rejected: string[]
}

export interface WorkspaceSnapshot {
  workspace: TracerWorkspace
  exportedAt: string
  app: {
    name: 'AI Tracer'
    version: string
  }
}
