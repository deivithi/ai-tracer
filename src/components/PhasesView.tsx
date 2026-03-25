import type { PhaseArtifact, PlanArtifact } from '../app/schemas'
import { ActionHeader, EmptyArtifact } from './shared'

export function PhasesView({
  plan,
  phases,
  isBusy,
  onGenerate,
}: {
  plan: PlanArtifact | null
  phases: PhaseArtifact | null
  isBusy: boolean
  onGenerate: () => Promise<void>
}) {
  return (
    <div className="view-stack">
      <ActionHeader
        title="Phases Mode"
        subtitle="Quebra o plano em sequencia operacional com deliverables claros por etapa."
        actionLabel={isBusy ? 'Gerando fases...' : 'Gerar fases'}
        disabled={isBusy || !plan}
        onClick={() => void onGenerate()}
      />

      {phases ? (
        <>
          <section className="feature-ribbon">
            <div>
              <span className="eyebrow">Sequencing logic</span>
              <h4>{phases.title}</h4>
              <p>{phases.payload.sequencingLogic}</p>
            </div>
          </section>

          <div className="phase-grid">
            {phases.payload.phases.map((phase) => (
              <article key={phase.id} className="phase-card">
                <div className="phase-header">
                  <span>{phase.id}</span>
                  <strong>{phase.title}</strong>
                </div>
                <p>{phase.goal}</p>
                <div className="phase-block">
                  <h5>Deliverable</h5>
                  <p>{phase.deliverable}</p>
                </div>
                <ul className="compact-list">
                  {phase.tasks.map((task) => (
                    <li key={task}>{task}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </>
      ) : (
        <EmptyArtifact
          title={plan ? 'Nenhuma decomposicao gerada ainda' : 'O plano ainda nao existe'}
          copy={plan ? 'Use o plano atual para quebrar a iniciativa em fases de entrega.' : 'Gere um plano antes de tentar quebrar a iniciativa em fases.'}
        />
      )}
    </div>
  )
}
