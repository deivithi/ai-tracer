import type { PlanArtifact } from '../app/schemas'
import { ActionHeader, ArtifactHero, ArtifactList, EmptyArtifact } from './shared'

export function PlanView({
  plan,
  isBusy,
  onGenerate,
}: {
  plan: PlanArtifact | null
  isBusy: boolean
  onGenerate: () => Promise<void>
}) {
  return (
    <div className="view-stack">
      <ActionHeader
        title="Plan Mode"
        subtitle="Gera North Star, workstreams, riscos, fronteiras e approval gates."
        actionLabel={isBusy ? 'Gerando plano...' : 'Gerar plano'}
        disabled={isBusy}
        onClick={() => void onGenerate()}
      />

      {plan ? (
        <div className="artifact-stack">
          <ArtifactHero artifactTitle={plan.title} summary={plan.payload.executiveSummary} />
          <ArtifactList title="Context signals" items={plan.payload.contextSignals} />
          <ArtifactList title="Scope boundaries" items={plan.payload.scopeBoundaries} />

          <div className="cards-grid">
            {plan.payload.workstreams.map((stream) => (
              <article key={stream.name} className="step-card">
                <span>{stream.name}</span>
                <strong>{stream.goal}</strong>
                <p>{stream.surfaces.join(' • ')}</p>
              </article>
            ))}
          </div>

          <div className="cards-grid">
            {plan.payload.risks.map((risk) => (
              <article key={risk.title} className={`risk-card risk-${risk.severity}`}>
                <span>{risk.severity}</span>
                <strong>{risk.title}</strong>
                <p>{risk.mitigation}</p>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <EmptyArtifact
          title="Nenhum plano gerado ainda"
          copy="Conecte o runtime, refine o objetivo e gere o primeiro artefato spec-driven."
        />
      )}
    </div>
  )
}
