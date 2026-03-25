import type { TracerWorkspace } from './schemas'
import type { WorkspaceSnapshot } from './types'
import { APP_VERSION, downloadBlob, nowIso } from './utils'

function artifactFiles(workspace: TracerWorkspace): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = []
  const artifacts = workspace.artifacts

  if (artifacts.plan) {
    files.push({ path: 'artifacts/plan.md', content: artifacts.plan.markdown })
    files.push({ path: 'artifacts/plan.json', content: JSON.stringify(artifacts.plan, null, 2) })
  }

  if (artifacts.phases) {
    files.push({ path: 'artifacts/phases.md', content: artifacts.phases.markdown })
    files.push({ path: 'artifacts/phases.json', content: JSON.stringify(artifacts.phases, null, 2) })
  }

  if (artifacts.execution) {
    files.push({ path: 'artifacts/execution.md', content: artifacts.execution.markdown })
    files.push({ path: 'artifacts/execution.json', content: JSON.stringify(artifacts.execution, null, 2) })
  }

  if (artifacts.verification) {
    files.push({ path: 'artifacts/verification.md', content: artifacts.verification.markdown })
    files.push({ path: 'artifacts/verification.json', content: JSON.stringify(artifacts.verification, null, 2) })
  }

  return files
}

export async function exportWorkspaceBundle(workspace: TracerWorkspace): Promise<void> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const snapshot: WorkspaceSnapshot = {
    workspace,
    exportedAt: nowIso(),
    app: {
      name: 'AI Tracer',
      version: APP_VERSION,
    },
  }

  zip.file('workspace.json', JSON.stringify(snapshot, null, 2))
  zip.file(
    'README.md',
    `# AI Tracer Workspace\n\n- Nome: ${workspace.name}\n- Exportado em: ${snapshot.exportedAt}\n- Versao: ${APP_VERSION}\n`,
  )
  zip.file('runs.json', JSON.stringify(workspace.runs, null, 2))

  for (const attachment of workspace.goal.attachments) {
    zip.file(`context/${attachment.name}`, attachment.content)
  }

  for (const file of artifactFiles(workspace)) {
    zip.file(file.path, file.content)
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(`ai-tracer-workspace-${workspace.id}.zip`, blob)
}
