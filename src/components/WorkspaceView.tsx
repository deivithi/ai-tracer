import type { TracerWorkspace } from '../app/schemas'
import { formatDate } from '../app/utils'
import { ArtifactList } from './shared'

export function WorkspaceView({ workspace }: { workspace: TracerWorkspace }) {
  return (
    <div className="view-stack">
      <section className="feature-ribbon">
        <div>
          <span className="eyebrow">Workspace state</span>
          <h4>{workspace.name}</h4>
          <p>Todos os artefatos deste workspace ficam persistidos localmente e podem ser exportados em bundle.</p>
        </div>
      </section>

      <div className="cards-grid">
        <article className="step-card">
          <span>Modo</span>
          <strong>{workspace.mode}</strong>
          <p>Criado em {formatDate(workspace.createdAt)}</p>
        </article>
        <article className="step-card">
          <span>Anexos</span>
          <strong>{workspace.goal.attachments.length}</strong>
          <p>Contextos locais anexados ao objetivo.</p>
        </article>
        <article className="step-card">
          <span>Runs</span>
          <strong>{workspace.runs.length}</strong>
          <p>Historico de operacao do AI Tracer.</p>
        </article>
      </div>

      <ArtifactList title="Restricoes" items={workspace.goal.constraints} />
      <ArtifactList title="Criterios de aceite" items={workspace.goal.acceptanceCriteria} />
    </div>
  )
}
