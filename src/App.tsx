import { AnimatePresence, motion } from 'framer-motion'
import {
  Command,
  Download,
  Eye,
  EyeOff,
  FileSearch,
  FolderKanban,
  KeyRound,
  Layers3,
  Paperclip,
  PlayCircle,
  Radar,
  RefreshCcw,
  SendHorizontal,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { startTransition, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { executeAgentTurn, runAgentTurn } from './app/agent'
import { createDemoWorkspace } from './app/demo'
import { exportWorkspaceBundle } from './app/export'
import { validateConnection } from './app/openrouter'
import { type ChatMessage, type RunRecord, type TracerWorkspace } from './app/schemas'
import { clearSessionKey, loadPreferences, loadSessionKey, loadWorkspace, savePreferences, saveSessionKey, saveWorkspace } from './app/storage'
import type { BannerMessage, RuntimeConnection, RuntimePreferences, ViewId } from './app/types'
import { DEFAULT_MODEL, createId, formatDate, nowIso, readFiles, resolveHash, setHash } from './app/utils'

const dockViews: Array<{ id: ViewId; label: string }> = [
  { id: 'mission', label: 'Resumo' },
  { id: 'goal', label: 'Memoria' },
  { id: 'plan', label: 'Plan' },
  { id: 'phases', label: 'Phases' },
  { id: 'execution', label: 'Execution' },
  { id: 'verification', label: 'Verify' },
  { id: 'workspace', label: 'Workspace' },
]

function createRun(stage: RunRecord['stage'], status: RunRecord['status'], summary: string, detail: string): RunRecord {
  const timestamp = nowIso()
  return { id: createId('run'), stage, status, startedAt: timestamp, finishedAt: timestamp, summary, detail }
}

function createMessage(
  role: ChatMessage['role'],
  kind: ChatMessage['kind'],
  text: string,
  extras?: Partial<Pick<ChatMessage, 'artifactType' | 'stage'>>,
): ChatMessage {
  return {
    id: createId('msg'),
    role,
    kind,
    text,
    createdAt: nowIso(),
    artifactType: extras?.artifactType,
    stage: extras?.stage,
  }
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function App() {
  const initialPreferences = loadPreferences()
  const [preferences, setPreferences] = useState<RuntimePreferences>(initialPreferences)
  const [workspace, setWorkspace] = useState<TracerWorkspace>(() => loadWorkspace() ?? createDemoWorkspace())
  const [activeView, setActiveView] = useState<ViewId>(() => resolveHash(initialPreferences.lastView))
  const [sessionKey, setSessionKeyState] = useState(loadSessionKey())
  const [banner, setBanner] = useState<BannerMessage>({
    tone: 'neutral',
    title: 'Agente carregado',
    body: 'A tela principal agora funciona como um chat operacional. Alimente o contexto e dispare os artefatos sem sair da conversa.',
  })
  const [isBusy, setIsBusy] = useState<RunRecord['stage'] | null>(null)
  const [connectionDraft, setConnectionDraft] = useState({ apiKey: loadSessionKey(), model: initialPreferences.model || DEFAULT_MODEL })
  const [composer, setComposer] = useState('')
  const [showKey, setShowKey] = useState(false)
  const threadRef = useRef<HTMLDivElement | null>(null)

  function updatePreferences(transform: (current: RuntimePreferences) => RuntimePreferences) {
    setPreferences((current) => {
      const next = transform(current)
      savePreferences(next)
      return next
    })
  }

  function navigateTo(view: ViewId) {
    setActiveView(view)
    setHash(view)
    updatePreferences((current) => ({ ...current, lastView: view }))
  }

  useEffect(() => {
    const onHashChange = () => setActiveView((current) => resolveHash(current))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    if (!threadRef.current) return
    if (typeof threadRef.current.scrollTo === 'function') {
      threadRef.current.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' })
      return
    }
    threadRef.current.scrollTop = threadRef.current.scrollHeight
  }, [workspace.conversation.length, isBusy])

  const runtime: RuntimeConnection | null = sessionKey ? { apiKey: sessionKey, model: preferences.model, provider: 'openrouter' } : null
  const plan = workspace.artifacts.plan
  const phases = workspace.artifacts.phases
  const execution = workspace.artifacts.execution
  const verification = workspace.artifacts.verification

  function commitWorkspace(nextWorkspace: TracerWorkspace) {
    const next = { ...nextWorkspace, updatedAt: nowIso() }
    startTransition(() => {
      setWorkspace(next)
      saveWorkspace(next)
    })
    return next
  }

  function updateWorkspace(transform: (current: TracerWorkspace) => TracerWorkspace) {
    startTransition(() =>
      setWorkspace((current) => {
        const next = { ...transform(current), updatedAt: nowIso() }
        saveWorkspace(next)
        return next
      }),
    )
  }

  function appendRun(run: RunRecord) {
    updateWorkspace((current) => ({ ...current, runs: [run, ...current.runs].slice(0, 60) }))
  }

  function appendMessages(messages: ChatMessage[]) {
    updateWorkspace((current) => ({ ...current, conversation: [...current.conversation, ...messages].slice(-200) }))
  }

  function appendMessage(role: ChatMessage['role'], kind: ChatMessage['kind'], text: string, extras?: Partial<Pick<ChatMessage, 'artifactType' | 'stage'>>) {
    appendMessages([createMessage(role, kind, text, extras)])
  }

  async function handleAttachmentImport(files: FileList | null) {
    const result = await readFiles(files)
    if (result.accepted.length > 0) {
      updateWorkspace((current) => ({
        ...current,
        goal: { ...current.goal, attachments: [...current.goal.attachments, ...result.accepted].slice(0, 6) },
      }))
      appendMessage('agent', 'status', `${result.accepted.length} arquivo(s) de contexto adicionados ao workspace.`)
    }
    if (result.rejected.length > 0) {
      setBanner({ tone: 'warning', title: 'Alguns arquivos foram rejeitados', body: result.rejected.join(' ') })
      appendMessage('agent', 'status', `Arquivos rejeitados: ${result.rejected.join(' ')}`)
    }
  }

  async function handleConnect(event: FormEvent) {
    event.preventDefault()
    if (!connectionDraft.apiKey.trim()) {
      setBanner({ tone: 'warning', title: 'Chave ausente', body: 'Cole uma chave valida do OpenRouter para ativar o chat live.' })
      appendMessage('agent', 'status', 'Nao encontrei chave para validar o runtime. Cole a chave do OpenRouter e tente novamente.', { stage: 'connect' })
      return
    }

    setIsBusy('connect')
    try {
      const nextRuntime: RuntimeConnection = {
        apiKey: connectionDraft.apiKey.trim(),
        model: connectionDraft.model.trim() || DEFAULT_MODEL,
        provider: 'openrouter',
      }

      await validateConnection(nextRuntime)
      saveSessionKey(nextRuntime.apiKey)
      setSessionKeyState(nextRuntime.apiKey)
      updatePreferences((current) => ({ ...current, model: nextRuntime.model, lastValidatedAt: nowIso() }))
      updateWorkspace((current) => ({ ...current, mode: 'live' }))
      appendRun(createRun('connect', 'success', 'Runtime validado com sucesso.', `Modelo conectado: ${nextRuntime.model}`))
      appendMessage('agent', 'status', `Runtime conectado com ${nextRuntime.model}. A chave fica apenas nesta sessao do navegador.`, { stage: 'connect' })
      setBanner({ tone: 'success', title: 'Runtime conectado', body: `OpenRouter validado com ${nextRuntime.model}. O chat agora pode gerar artefatos reais.` })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido.'
      appendRun(createRun('connect', 'error', 'Falha ao validar o runtime.', message))
      appendMessage('agent', 'status', `Falha ao validar o runtime: ${message}`, { stage: 'connect' })
      setBanner({ tone: 'danger', title: 'Falha na conexao', body: message })
    } finally {
      setIsBusy(null)
    }
  }

  function handleDisconnect() {
    clearSessionKey()
    setSessionKeyState('')
    setConnectionDraft((current) => ({ ...current, apiKey: '' }))
    updateWorkspace((current) => ({ ...current, mode: 'demo' }))
    appendMessage('agent', 'status', 'Runtime desconectado. O workspace continua salvo, mas o chat volta ao modo demo.', { stage: 'connect' })
    setBanner({ tone: 'neutral', title: 'Runtime desconectado', body: 'A chave foi removida da sessao. O chat continua com os artefatos locais.' })
  }

  async function handleExport(targetWorkspace: TracerWorkspace = workspace) {
    await exportWorkspaceBundle(targetWorkspace)
    updateWorkspace((current) => ({
      ...current,
      runs: [createRun('export', 'success', 'Workspace exportado.', targetWorkspace.name), ...current.runs].slice(0, 60),
      conversation: [
        ...current.conversation,
        createMessage('agent', 'status', 'Bundle exportado com artefatos, historico e contexto anexado.', { stage: 'export' }),
      ].slice(-200),
    }))
    setBanner({ tone: 'success', title: 'Bundle exportado', body: 'O pacote do workspace foi baixado com sucesso.' })
  }

  function resetChatWorkspace() {
    const nextWorkspace = createDemoWorkspace()
    commitWorkspace(nextWorkspace)
    setComposer('')
    navigateTo('mission')
    setBanner({ tone: 'neutral', title: 'Workspace resetado', body: 'O chat voltou para a seed demo, pronto para uma nova rodada.' })
  }

  async function submitAgentMessage(rawValue: string) {
    const value = rawValue.trim()
    if (!value) return

    const userMessage = createMessage('user', 'text', value)
    const baseWorkspace = structuredClone(workspace)
    baseWorkspace.conversation = [...baseWorkspace.conversation, userMessage].slice(-200)
    commitWorkspace(baseWorkspace)
    setComposer('')

    const normalized = value.toLowerCase()

    if (normalized === '/help' || normalized === 'help' || normalized === 'comandos') {
      updateWorkspace((current) => ({
        ...current,
        conversation: [
          ...current.conversation,
          createMessage(
            'agent',
            'text',
            'Pode falar normalmente comigo. Eu extraio objetivo, restricoes, criterios, contexto e evidencia da conversa. Se preferir atalhos, use /plan, /phases, /execute, /verify, /export ou /reset.',
            { stage: 'agent' },
          ),
        ].slice(-200),
      }))
      setBanner({ tone: 'neutral', title: 'Ajuda do agente', body: 'A conversa agora e livre. Os slash commands continuam disponiveis como atalho.' })
      return
    }

    if (normalized === '/export' || normalized === 'exportar') {
      await handleExport(baseWorkspace)
      return
    }

    if (normalized === '/reset' || normalized === 'resetar') {
      resetChatWorkspace()
      appendMessage('agent', 'text', 'Workspace reiniciado. Traga um novo briefing e eu reconstruo a memoria operacional do zero.', { stage: 'agent' })
      return
    }

    setIsBusy('agent')
    try {
      const turn = await runAgentTurn(baseWorkspace, value, runtime)
      const resolution = await executeAgentTurn(baseWorkspace, turn, runtime)
      commitWorkspace(resolution.workspace)
      navigateTo(resolution.finalView)

      const executed = resolution.outcomes.filter((outcome) => outcome.status === 'executed')
      const skipped = resolution.outcomes.filter((outcome) => outcome.status === 'skipped')

      setBanner({
        tone: executed.length > 0 ? 'success' : skipped.length > 0 || turn.needsClarification ? 'warning' : 'neutral',
        title: executed.length > 0 ? 'Agente em movimento' : turn.needsClarification ? 'Agente pedindo precisao' : 'Memoria atualizada',
        body:
          executed.length > 0
            ? `A conversa acionou ${executed.map((outcome) => outcome.action).join(', ')} sem depender de mensagens roteirizadas.`
            : skipped.length > 0
              ? 'Atualizei a memoria do agente, mas faltou runtime ou evidencia para executar todas as acoes pedidas.'
              : 'O agente absorveu o contexto e ajustou a memoria operacional desta conversa.',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido.'
      const failedWorkspace = structuredClone(baseWorkspace)
      failedWorkspace.runs = [createRun('agent', 'error', 'Falha no turno do agente.', message), ...failedWorkspace.runs].slice(0, 60)
      failedWorkspace.conversation = [
        ...failedWorkspace.conversation,
        createMessage('agent', 'status', `Falhei neste turno do agente: ${message}`, { stage: 'agent' }),
      ].slice(-200)
      commitWorkspace(failedWorkspace)
      setBanner({ tone: 'danger', title: 'Falha no turno do agente', body: message })
    } finally {
      setIsBusy(null)
    }
  }

  async function handleComposerSubmit(event: FormEvent) {
    event.preventDefault()
    await submitAgentMessage(composer)
  }

  const stageProgress = [
    { label: 'Goal', done: workspace.goal.objective.length > 9 },
    { label: 'Plan', done: Boolean(plan) },
    { label: 'Phases', done: Boolean(phases) },
    { label: 'Execute', done: Boolean(execution) },
    { label: 'Verify', done: Boolean(verification) },
  ]

  const dockSummary = useMemo(() => {
    if (activeView === 'plan' && plan) {
      return {
        title: plan.title,
        body: plan.payload.executiveSummary,
        bullets: [...plan.payload.contextSignals, ...plan.payload.approvalGates].slice(0, 6),
      }
    }

    if (activeView === 'phases' && phases) {
      return {
        title: phases.title,
        body: phases.payload.sequencingLogic,
        bullets: phases.payload.phases.map((phase) => `${phase.id} · ${phase.title} · ${phase.deliverable}`),
      }
    }

    if (activeView === 'execution' && execution) {
      return {
        title: execution.title,
        body: execution.payload.executionSummary,
        bullets: execution.payload.executionSteps.map((step) => `${step.label} · ${step.expectedEvidence}`).slice(0, 6),
      }
    }

    if (activeView === 'verification' && verification) {
      return {
        title: verification.title,
        body: verification.payload.summary,
        bullets: [`Decision · ${verification.payload.decision.toUpperCase()}`, ...verification.payload.gaps.slice(0, 5)],
      }
    }

    if (activeView === 'workspace') {
      return {
        title: workspace.name,
        body: 'Bundle exportavel com artefatos, historico e contexto persistido localmente.',
        bullets: [
          `Runs · ${workspace.runs.length}`,
          `Artefatos · ${[plan, phases, execution, verification].filter(Boolean).length}`,
          `Modo · ${workspace.mode}`,
        ],
      }
    }

    return {
      title: workspace.goal.objective,
      body: workspace.goal.desiredOutcome,
      bullets: [...workspace.goal.constraints, ...workspace.goal.acceptanceCriteria].slice(0, 6),
    }
  }, [activeView, execution, phases, plan, verification, workspace])

  function renderArtifactInline(message: ChatMessage) {
    if (message.artifactType === 'plan' && plan) {
      return (
        <div className="chat-artifact-card">
          <span className="chat-artifact-tag">Plan</span>
          <strong>{plan.title}</strong>
          <p>{plan.payload.executiveSummary}</p>
          <ul>
            {plan.payload.workstreams.slice(0, 3).map((stream) => <li key={stream.name}>{stream.name}</li>)}
          </ul>
        </div>
      )
    }

    if (message.artifactType === 'phases' && phases) {
      return (
        <div className="chat-artifact-card">
          <span className="chat-artifact-tag">Phases</span>
          <strong>{phases.title}</strong>
          <p>{phases.payload.sequencingLogic}</p>
          <ul>
            {phases.payload.phases.slice(0, 3).map((phase) => <li key={phase.id}>{phase.id} · {phase.title}</li>)}
          </ul>
        </div>
      )
    }

    if (message.artifactType === 'execution' && execution) {
      return (
        <div className="chat-artifact-card">
          <span className="chat-artifact-tag">Execution</span>
          <strong>{execution.title}</strong>
          <p>{execution.payload.executionSummary}</p>
          <ul>
            {execution.payload.operatorChecklist.slice(0, 4).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      )
    }

    if (message.artifactType === 'verification' && verification) {
      return (
        <div className="chat-artifact-card">
          <span className="chat-artifact-tag">Verification</span>
          <strong>{verification.payload.decision.toUpperCase()}</strong>
          <p>{verification.payload.summary}</p>
          <ul>
            {verification.payload.findings.slice(0, 3).map((item) => <li key={item.title}>{item.severity} · {item.title}</li>)}
          </ul>
        </div>
      )
    }

    return null
  }

  return (
    <div className="chat-app-shell">
      <aside className="chat-rail">
        <div className="brand-block">
          <div className="brand-mark"><Sparkles size={18} /></div>
          <div>
            <p className="eyebrow">AI Tracer</p>
            <h1>Agent chat control plane</h1>
          </div>
        </div>
        <p className="sidebar-copy">A conversa virou a tela principal. O agente absorve contexto, atualiza a memoria operacional e dispara artefatos sem sair do chat.</p>
        <section className="rail-card">
          <div className="rail-card-header"><span className="eyebrow">Pipeline</span><ShieldCheck size={16} /></div>
          <div className="progress-grid">
            {stageProgress.map((item) => <div key={item.label} className={`progress-pill ${item.done ? 'is-done' : ''}`}><span>{item.label}</span></div>)}
          </div>
        </section>
        <section className="rail-card">
          <div className="rail-card-header"><span className="eyebrow">Runtime</span><KeyRound size={16} /></div>
          <div className="runtime-stack">
            <div className="metric-chip"><span>Modelo</span><strong>{preferences.model}</strong></div>
            <div className={`metric-chip ${runtime ? 'is-online' : ''}`}><span>Status</span><strong>{runtime ? 'Conectado' : 'Sessao local'}</strong></div>
            <div className="metric-chip"><span>Runs</span><strong>{workspace.runs.length}</strong></div>
          </div>
        </section>
        <section className="rail-card">
          <div className="rail-card-header"><span className="eyebrow">Comandos</span><Command size={16} /></div>
          <div className="command-list"><span>/plan</span><span>/phases</span><span>/execute</span><span>/verify</span><span>/export</span><span>/reset</span></div>
        </section>
      </aside>

      <main className="chat-main-panel">
        <section className={`banner banner-${banner.tone}`}>
          <div className="banner-dot" />
          <div><strong>{banner.title}</strong><p>{banner.body}</p></div>
        </section>

        <section className="chat-panel">
          <div className="chat-topbar">
            <div><span className="hero-tag">Chat-first agent</span><h2>Converse, construa e audite no mesmo fluxo.</h2></div>
            <div className="panel-actions">
              <button className="ghost-button" onClick={() => void handleExport()} type="button"><Download size={16} />Exportar</button>
              <button className="ghost-button" onClick={resetChatWorkspace} type="button"><RefreshCcw size={16} />Resetar</button>
            </div>
          </div>

          <section className="runtime-bar">
            <form className="runtime-form" onSubmit={handleConnect}>
              <label className="field-block">
                Chave OpenRouter
                <div className="secure-input-shell">
                  <input aria-label="Chave OpenRouter" autoComplete="off" className="text-input" onChange={(event) => setConnectionDraft((current) => ({ ...current, apiKey: event.target.value }))} placeholder="sk-or-v1-..." type={showKey ? 'text' : 'password'} value={connectionDraft.apiKey} />
                  <button className="ghost-button" onClick={() => setShowKey((current) => !current)} type="button">{showKey ? <EyeOff size={16} /> : <Eye size={16} />}{showKey ? 'Ocultar' : 'Mostrar'}</button>
                </div>
              </label>
              <label className="field-block">
                Modelo default
                <input aria-label="Modelo default" className="text-input" onChange={(event) => setConnectionDraft((current) => ({ ...current, model: event.target.value }))} placeholder={DEFAULT_MODEL} type="text" value={connectionDraft.model} />
              </label>
              <div className="runtime-form-actions">
                <button className="primary-button" disabled={isBusy === 'connect'} type="submit">{isBusy === 'connect' ? 'Validando runtime...' : runtime ? 'Revalidar runtime' : 'Conectar runtime'}</button>
                {runtime && <button className="ghost-button" onClick={handleDisconnect} type="button">Remover chave</button>}
              </div>
            </form>
            <div className="runtime-note"><ShieldCheck size={16} /><p>A chave fica apenas na sessao do navegador. Nada e salvo no deploy publicado.</p></div>
          </section>

          <div className="chat-thread" ref={threadRef}>
            <AnimatePresence initial={false}>
              {workspace.conversation.map((message) => (
                <motion.article key={message.id} className={`chat-bubble chat-${message.role} chat-${message.kind}`} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.2, ease: 'easeOut' }}>
                  <div className="chat-bubble-head"><span>{message.role === 'agent' ? 'AI Tracer' : message.role === 'user' ? 'Voce' : 'Sistema'}</span><small>{formatDate(message.createdAt)}</small></div>
                  <p>{message.text}</p>
                  {renderArtifactInline(message)}
                </motion.article>
              ))}
            </AnimatePresence>
            {isBusy && <motion.article className="chat-bubble chat-agent chat-status" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}><div className="chat-bubble-head"><span>AI Tracer</span><small>agora</small></div><p>Processando {isBusy}...</p></motion.article>}
          </div>

          <section className="chat-tools">
            <div className="quick-action-row">
              <button className="ghost-button" onClick={() => void submitAgentMessage('/plan')} type="button"><Radar size={16} />Planejar</button>
              <button className="ghost-button" onClick={() => void submitAgentMessage('/phases')} type="button"><Layers3 size={16} />Fases</button>
              <button className="ghost-button" onClick={() => void submitAgentMessage('/execute')} type="button"><PlayCircle size={16} />Execucao</button>
              <button className="ghost-button" onClick={() => void submitAgentMessage('/verify')} type="button"><FileSearch size={16} />Verificar</button>
            </div>
            <form className="chat-composer" onSubmit={(event) => void handleComposerSubmit(event)}>
              <textarea aria-label="Mensagem do agente" className="text-area composer-input" onChange={(event) => setComposer(event.target.value)} placeholder="Escreva naturalmente o que voce precisa. Ex.: Quero um agente menos roteirizado, que entenda o contexto e monte o proximo passo sozinho." rows={4} value={composer} />
              <div className="composer-actions">
                <label className="upload-button"><Paperclip size={16} />Importar contexto<input className="hidden-input" multiple onChange={(event) => void handleAttachmentImport(event.target.files)} type="file" /></label>
                <button className="primary-button" disabled={!composer.trim()} type="submit"><SendHorizontal size={16} />Enviar ao agente</button>
              </div>
            </form>
          </section>
        </section>
      </main>

      <aside className="dock-panel">
        <div className="panel-header"><div><span className="eyebrow">Inspector</span><h3>{dockSummary.title}</h3></div><FolderKanban size={16} /></div>
        <div className="dock-tabs">{dockViews.map((item) => <button key={item.id} className={`dock-tab ${activeView === item.id ? 'is-active' : ''}`} onClick={() => navigateTo(item.id)} type="button">{item.label}</button>)}</div>
        <section className="dock-card"><p>{dockSummary.body}</p></section>
        <section className="dock-card"><span className="eyebrow">Sinais ativos</span><ul className="dock-list">{dockSummary.bullets.map((item) => <li key={item}>{truncate(item, 180)}</li>)}</ul></section>
        <section className="dock-card"><span className="eyebrow">Memoria operacional</span><div className="memory-stack"><div><strong>Objetivo</strong><p>{workspace.goal.objective}</p></div><div><strong>Resultado</strong><p>{workspace.goal.desiredOutcome}</p></div><div><strong>Verification input</strong><p>{workspace.verificationInput || 'Nenhuma evidencia registrada ainda.'}</p></div></div></section>
      </aside>
    </div>
  )
}

export default App
