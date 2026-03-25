import { FileCog, FileSearch, Radar, Sparkles, Target } from 'lucide-react'
import type { RuntimeConnection, ViewId } from '../app/types'
import type { TracerWorkspace } from '../app/schemas'
import { formatDate } from '../app/utils'
import { PipelineCard } from './shared'

export function MissionView({
  workspace,
  runtime,
  onGo,
}: {
  workspace: TracerWorkspace
  runtime: RuntimeConnection | null
  onGo: (view: ViewId) => void
}) {
  return (
    <div className="view-stack">
      <section className="feature-ribbon">
        <div>
          <span className="eyebrow">Operational loop</span>
          <h4>Do objetivo cru ao parecer operacional</h4>
          <p>O AI Tracer trabalha em quatro artefatos centrais para reduzir drift e deixar evidencias reutilizaveis.</p>
        </div>
        <button className="primary-button" onClick={() => onGo('goal')} type="button">
          Abrir Goal Studio
          <Sparkles size={16} />
        </button>
      </section>

      <div className="cards-grid">
        <PipelineCard title="Goal" copy="Contexto, criterios, anexos e restricoes em um pacote limpo." icon={<Target size={18} />} />
        <PipelineCard title="Plan" copy="North star, workstreams, gates de aprovacao e riscos reais." icon={<Radar size={18} />} />
        <PipelineCard title="Execute" copy="Handoff packet pronto para Codex, Claude Code e Gemini." icon={<FileCog size={18} />} />
        <PipelineCard title="Verify" copy="Findings, lacunas e decisao final para aprovar ou retrabalhar." icon={<FileSearch size={18} />} />
      </div>

      <section className="split-panel">
        <article className="insight-card">
          <span className="eyebrow">Conexao segura</span>
          <h4>{runtime ? 'Runtime live conectado' : 'Sessao ainda nao conectada'}</h4>
          <p>
            {runtime
              ? 'A chave esta ativa apenas na sessao atual. O deploy em GitHub Pages continua sem segredo embarcado.'
              : 'A chave do OpenRouter nao e salva no bundle publicado. Conecte no navegador e rode o fluxo live com MiniMax-2.7.'}
          </p>
        </article>

        <article className="insight-card">
          <span className="eyebrow">Workspace atual</span>
          <h4>{workspace.goal.objective}</h4>
          <p>{workspace.goal.desiredOutcome}</p>
        </article>
      </section>

      <section className="cards-grid">
        <article className="step-card">
          <span>Modelo alvo</span>
          <strong>{runtime?.model ?? 'minimax/minimax-m2.7'}</strong>
          <p>Runtime validado em {workspace.mode === 'live' && runtime ? formatDate(workspace.updatedAt) : 'modo demo'}</p>
        </article>
        <article className="step-card">
          <span>Seguranca</span>
          <strong>CSP + sessao local</strong>
          <p>Chave fora do bundle e fluxo guiado para reduzir erro operacional.</p>
        </article>
        <article className="step-card">
          <span>Rastro</span>
          <strong>{workspace.runs.length} runs</strong>
          <p>Histórico persistido no navegador e exportável em bundle zip.</p>
        </article>
        <article className="step-card">
          <span>Controle</span>
          <strong>spec before code</strong>
          <p>Planejar, quebrar, empacotar e verificar antes de aprovar execução.</p>
        </article>
      </section>
    </div>
  )
}
