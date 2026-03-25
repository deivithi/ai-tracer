import type { ExecutionArtifact, VerificationArtifact } from '../app/schemas'
import { ActionHeader, ArtifactList, EmptyArtifact } from './shared'

export function VerificationView({
  verification,
  execution,
  value,
  isBusy,
  onChange,
  onGenerate,
}: {
  verification: VerificationArtifact | null
  execution: ExecutionArtifact | null
  value: string
  isBusy: boolean
  onChange: (value: string) => void
  onGenerate: () => Promise<void>
}) {
  return (
    <div className="view-stack">
      <ActionHeader
        title="Verification"
        subtitle="Cole a evidencia da implementacao e compare com o plano original."
        actionLabel={isBusy ? 'Verificando...' : 'Rodar verificacao'}
        disabled={isBusy || !execution}
        onClick={() => void onGenerate()}
      />

      <label className="field-block field-block-wide">
        Evidencia de implementacao
        <textarea
          className="text-area"
          onChange={(event) => onChange(event.target.value)}
          placeholder="Cole aqui diff, resumo do que foi implementado, saida de testes, links ou observacoes de entrega."
          rows={8}
          value={value}
        />
      </label>

      {verification ? (
        <>
          <section className="feature-ribbon">
            <div>
              <span className="eyebrow">Decision</span>
              <h4>{verification.payload.decision.toUpperCase()}</h4>
              <p>{verification.payload.summary}</p>
            </div>
          </section>

          <ArtifactList title="Passes" items={verification.payload.passes} />
          <ArtifactList title="Gaps" items={verification.payload.gaps} />

          <div className="cards-grid">
            {verification.payload.findings.map((finding) => (
              <article key={`${finding.severity}-${finding.title}`} className={`risk-card risk-${finding.severity}`}>
                <span>{finding.severity}</span>
                <strong>{finding.title}</strong>
                <p>{finding.description}</p>
                <small>{finding.recommendedFix}</small>
              </article>
            ))}
          </div>
        </>
      ) : (
        <EmptyArtifact
          title="Nenhuma verificacao executada"
          copy="Depois de gerar o pacote de execucao, cole a evidencia da implementacao e rode a auditoria."
        />
      )}
    </div>
  )
}
