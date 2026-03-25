import { ShieldCheck } from 'lucide-react'
import type { FormEvent } from 'react'
import type { AttachmentRecord, TracerWorkspace } from '../app/schemas'
import type { RuntimeConnection } from '../app/types'
import { DEFAULT_MODEL } from '../app/utils'

export function GoalView({
  workspace,
  connectionDraft,
  runtime,
  isBusy,
  onConnect,
  onDisconnect,
  onConnectionChange,
  onGoalFieldChange,
  onGoalListChange,
  onAttachmentImport,
  onAttachmentRemove,
}: {
  workspace: TracerWorkspace
  connectionDraft: { apiKey: string; model: string }
  runtime: RuntimeConnection | null
  isBusy: boolean
  onConnect: (event: FormEvent) => Promise<void>
  onDisconnect: () => void
  onConnectionChange: (value: { apiKey: string; model: string }) => void
  onGoalFieldChange: (field: 'objective' | 'desiredOutcome' | 'contextNotes', value: string) => void
  onGoalListChange: (field: 'constraints' | 'acceptanceCriteria', value: string) => void
  onAttachmentImport: (files: FileList | null) => Promise<void>
  onAttachmentRemove: (attachmentId: string) => void
}) {
  return (
    <div className="view-stack">
      <section className="connection-shell">
        <form className="connection-form" onSubmit={onConnect}>
          <div className="field-row">
            <label>
              Chave OpenRouter
              <input
                autoComplete="off"
                className="text-input"
                onChange={(event) => onConnectionChange({ ...connectionDraft, apiKey: event.target.value })}
                placeholder="sk-or-v1-..."
                type="password"
                value={connectionDraft.apiKey}
              />
            </label>

            <label>
              Modelo default
              <input
                className="text-input"
                onChange={(event) => onConnectionChange({ ...connectionDraft, model: event.target.value })}
                placeholder={DEFAULT_MODEL}
                type="text"
                value={connectionDraft.model}
              />
            </label>
          </div>

          <div className="form-actions">
            <button className="primary-button" disabled={isBusy} type="submit">
              {isBusy ? 'Validando...' : runtime ? 'Revalidar runtime' : 'Conectar runtime'}
            </button>
            {runtime && (
              <button className="ghost-button" onClick={onDisconnect} type="button">
                Remover chave da sessao
              </button>
            )}
          </div>
        </form>

        <div className="connection-note">
          <ShieldCheck size={16} />
          <p>A chave fica apenas na sessao do navegador. Nada e gravado no deploy publico.</p>
        </div>
      </section>

      <div className="form-grid">
        <label className="field-block field-block-wide">
          Objetivo central
          <textarea className="text-area" onChange={(event) => onGoalFieldChange('objective', event.target.value)} rows={4} value={workspace.goal.objective} />
        </label>

        <label className="field-block field-block-wide">
          Resultado desejado
          <textarea className="text-area" onChange={(event) => onGoalFieldChange('desiredOutcome', event.target.value)} rows={3} value={workspace.goal.desiredOutcome} />
        </label>

        <label className="field-block">
          Restricoes
          <textarea className="text-area" onChange={(event) => onGoalListChange('constraints', event.target.value)} rows={6} value={workspace.goal.constraints.join('\n')} />
        </label>

        <label className="field-block">
          Criterios de aceite
          <textarea className="text-area" onChange={(event) => onGoalListChange('acceptanceCriteria', event.target.value)} rows={6} value={workspace.goal.acceptanceCriteria.join('\n')} />
        </label>

        <label className="field-block field-block-wide">
          Contexto adicional
          <textarea className="text-area" onChange={(event) => onGoalFieldChange('contextNotes', event.target.value)} rows={5} value={workspace.goal.contextNotes} />
        </label>
      </div>

      <section className="attachments-shell">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Context files</span>
            <h3>Anexos do contexto</h3>
          </div>
          <label className="upload-button">
            Importar arquivos
            <input className="hidden-input" multiple onChange={(event) => void onAttachmentImport(event.target.files)} type="file" />
          </label>
        </div>

        <div className="attachment-list">
          {workspace.goal.attachments.map((attachment: AttachmentRecord) => (
            <article key={attachment.id} className="attachment-item">
              <div>
                <strong>{attachment.name}</strong>
                <p>
                  {attachment.kind} • {attachment.size} bytes
                </p>
              </div>
              <button className="ghost-button" onClick={() => onAttachmentRemove(attachment.id)} type="button">
                Remover
              </button>
            </article>
          ))}
          {workspace.goal.attachments.length === 0 && (
            <article className="empty-state">
              <p>Nenhum arquivo anexado ainda. O AI Tracer pode trabalhar apenas com texto ou receber arquivos locais curtos.</p>
            </article>
          )}
        </div>
      </section>
    </div>
  )
}
