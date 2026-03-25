import type { ExecutionArtifact } from '../app/schemas'
import { ActionHeader, ArtifactList, EmptyArtifact } from './shared'
import { copyText } from '../app/utils'
import { Copy } from 'lucide-react'

export function ExecutionView({
  execution,
  isBusy,
  onGenerate,
}: {
  execution: ExecutionArtifact | null
  isBusy: boolean
  onGenerate: () => Promise<void>
}) {
  return (
    <div className="view-stack">
      <ActionHeader
        title="Execution Packet"
        subtitle="Monta o pacote operacional com checklist, evidencias e handoff packets."
        actionLabel={isBusy ? 'Gerando pacote...' : 'Gerar execucao'}
        disabled={isBusy}
        onClick={() => void onGenerate()}
      />

      {execution ? (
        <>
          <section className="feature-ribbon">
            <div>
              <span className="eyebrow">Execution summary</span>
              <h4>{execution.title}</h4>
              <p>{execution.payload.executionSummary}</p>
            </div>
          </section>

          <ArtifactList title="Checklist do operador" items={execution.payload.operatorChecklist} />

          <div className="cards-grid">
            {execution.payload.executionSteps.map((step) => (
              <article key={step.label} className="step-card">
                <span>{step.label}</span>
                <strong>{step.action}</strong>
                <p>{step.expectedEvidence}</p>
                <small>{step.riskNote}</small>
              </article>
            ))}
          </div>

          <div className="handoff-grid">
            {Object.entries(execution.payload.handoffPackets).map(([provider, prompt]) => (
              <article key={provider} className="handoff-card">
                <div className="handoff-header">
                  <strong>{provider}</strong>
                  <button className="ghost-button" onClick={() => void copyText(prompt)} type="button">
                    <Copy size={14} />
                    Copiar
                  </button>
                </div>
                <pre>{prompt}</pre>
              </article>
            ))}
          </div>
        </>
      ) : (
        <EmptyArtifact
          title="Nenhum pacote de execucao pronto"
          copy="O AI Tracer gera os handoffs somente depois de consolidar plano e, opcionalmente, fases."
        />
      )}
    </div>
  )
}
