import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight, Download, FolderKanban, KeyRound, Layers3, Orbit, PlayCircle, Radar, RefreshCcw, ShieldCheck, Sparkles, Target, FileSearch } from 'lucide-react'
import { startTransition, useEffect, useState, type FormEvent } from 'react'
import { createDemoWorkspace } from './app/demo'
import { generateExecution, generatePhases, generatePlan, generateVerification } from './app/engine'
import { exportWorkspaceBundle } from './app/export'
import { validateConnection } from './app/openrouter'
import { goalInputSchema, type RunRecord, type TracerWorkspace } from './app/schemas'
import { clearSessionKey, loadPreferences, loadSessionKey, loadWorkspace, savePreferences, saveSessionKey, saveWorkspace } from './app/storage'
import type { BannerMessage, RuntimeConnection, RuntimePreferences, ViewId } from './app/types'
import { DEFAULT_MODEL, createId, formatDate, nowIso, readFiles, resolveHash, setHash } from './app/utils'
import { ExecutionView } from './components/ExecutionView'
import { GoalView } from './components/GoalView'
import { MissionView } from './components/MissionView'
import { PhasesView } from './components/PhasesView'
import { PlanView } from './components/PlanView'
import { Banner, MetricCard, StageProgress } from './components/shared'
import { VerificationView } from './components/VerificationView'
import { WorkspaceView } from './components/WorkspaceView'

const viewItems: Array<{ id: ViewId; label: string; kicker: string; icon: typeof Orbit }> = [
  { id: 'mission', label: 'Mission Control', kicker: 'Visao geral', icon: Orbit },
  { id: 'goal', label: 'Goal Studio', kicker: 'Entrada', icon: Target },
  { id: 'plan', label: 'Plan', kicker: 'Arquitetura', icon: Radar },
  { id: 'phases', label: 'Phases', kicker: 'Sequencia', icon: Layers3 },
  { id: 'execution', label: 'Execute', kicker: 'Handoff', icon: PlayCircle },
  { id: 'verification', label: 'Verify', kicker: 'Auditoria', icon: FileSearch },
  { id: 'workspace', label: 'Workspace', kicker: 'Exportacao', icon: FolderKanban },
]

function createRun(stage: RunRecord['stage'], status: RunRecord['status'], summary: string, detail: string): RunRecord {
  const timestamp = nowIso()
  return { id: createId('run'), stage, status, startedAt: timestamp, finishedAt: timestamp, summary, detail }
}

function App() {
  const initialPreferences = loadPreferences()
  const [preferences, setPreferences] = useState<RuntimePreferences>(initialPreferences)
  const [workspace, setWorkspace] = useState<TracerWorkspace>(() => loadWorkspace() ?? createDemoWorkspace())
  const [activeView, setActiveView] = useState<ViewId>(() => resolveHash(initialPreferences.lastView))
  const [sessionKey, setSessionKeyState] = useState(loadSessionKey())
  const [banner, setBanner] = useState<BannerMessage>({ tone: 'neutral', title: 'Workspace carregado', body: 'Conecte o OpenRouter para gerar artefatos reais sem expor a chave no deploy.' })
  const [isBusy, setIsBusy] = useState<RunRecord['stage'] | null>(null)
  const [connectionDraft, setConnectionDraft] = useState({ apiKey: loadSessionKey(), model: initialPreferences.model || DEFAULT_MODEL })

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

  const runtime: RuntimeConnection | null = sessionKey ? { apiKey: sessionKey, model: preferences.model, provider: 'openrouter' } : null
  const plan = workspace.artifacts.plan
  const phases = workspace.artifacts.phases
  const execution = workspace.artifacts.execution
  const verification = workspace.artifacts.verification

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

  function updateGoalField(field: 'objective' | 'desiredOutcome' | 'contextNotes', value: string) {
    updateWorkspace((current) => ({ ...current, goal: { ...current.goal, [field]: value } }))
  }

  function updateGoalList(field: 'constraints' | 'acceptanceCriteria', value: string) {
    const items = value.split('\n').map((item) => item.trim()).filter(Boolean).slice(0, 12)
    updateWorkspace((current) => ({ ...current, goal: { ...current.goal, [field]: items } }))
  }

  async function handleAttachmentImport(files: FileList | null) {
    const result = await readFiles(files)
    if (result.accepted.length > 0) {
      updateWorkspace((current) => ({ ...current, goal: { ...current.goal, attachments: [...current.goal.attachments, ...result.accepted].slice(0, 6) } }))
    }
    if (result.rejected.length > 0) {
      setBanner({ tone: 'warning', title: 'Alguns arquivos foram rejeitados', body: result.rejected.join(' ') })
    }
  }

  function removeAttachment(attachmentId: string) {
    updateWorkspace((current) => ({ ...current, goal: { ...current.goal, attachments: current.goal.attachments.filter((item) => item.id !== attachmentId) } }))
  }

  async function handleConnect(event: FormEvent) {
    event.preventDefault()
    if (!connectionDraft.apiKey.trim()) {
      setBanner({ tone: 'warning', title: 'Chave ausente', body: 'Cole uma chave valida do OpenRouter para ativar a geracao live.' })
      return
    }

    setIsBusy('connect')
    try {
      const nextRuntime: RuntimeConnection = { apiKey: connectionDraft.apiKey.trim(), model: connectionDraft.model.trim() || DEFAULT_MODEL, provider: 'openrouter' }
      await validateConnection(nextRuntime)
      saveSessionKey(nextRuntime.apiKey)
      setSessionKeyState(nextRuntime.apiKey)
      updatePreferences((current) => ({ ...current, model: nextRuntime.model, lastValidatedAt: nowIso() }))
      updateWorkspace((current) => ({ ...current, mode: 'live' }))
      appendRun(createRun('connect', 'success', 'Runtime validado com sucesso.', `Modelo conectado: ${nextRuntime.model}`))
      setBanner({ tone: 'success', title: 'Runtime conectado', body: `OpenRouter validado com ${nextRuntime.model}. A chave ficou apenas nesta sessao do navegador.` })
    } catch (error) {
      appendRun(createRun('connect', 'error', 'Falha ao validar o runtime.', error instanceof Error ? error.message : 'Erro desconhecido.'))
      setBanner({ tone: 'danger', title: 'Falha na conexao', body: error instanceof Error ? error.message : 'Nao foi possivel validar a conexao com o OpenRouter.' })
    } finally {
      setIsBusy(null)
    }
  }

  function handleDisconnect() {
    clearSessionKey()
    setSessionKeyState('')
    setConnectionDraft((current) => ({ ...current, apiKey: '' }))
    updateWorkspace((current) => ({ ...current, mode: 'demo' }))
    setBanner({ tone: 'neutral', title: 'Runtime desconectado', body: 'A chave foi removida da sessao. Seus artefatos continuam salvos neste navegador.' })
  }

  async function withStage(stage: RunRecord['stage'], action: () => Promise<void>, successTitle: string, successBody: string) {
    if ((stage === 'plan' && !goalInputSchema.safeParse(workspace.goal).success) || !runtime) {
      setBanner({ tone: 'warning', title: 'Pre-requisito ausente', body: 'Revise o objetivo e valide o runtime antes de seguir.' })
      return
    }
    setIsBusy(stage)
    try {
      await action()
      setBanner({ tone: 'success', title: successTitle, body: successBody })
    } catch (error) {
      appendRun(createRun(stage, 'error', `Falha em ${stage}.`, error instanceof Error ? error.message : 'Erro desconhecido.'))
      setBanner({ tone: 'danger', title: `Falha em ${stage}`, body: error instanceof Error ? error.message : 'Erro desconhecido.' })
    } finally {
      setIsBusy(null)
    }
  }

  async function runPlanStage() {
    await withStage('plan', async () => {
      const nextPlan = await generatePlan(workspace.goal, runtime as RuntimeConnection)
      updateWorkspace((current) => ({ ...current, mode: 'live', artifacts: { ...current.artifacts, plan: nextPlan, phases: null, execution: null, verification: null } }))
      appendRun(createRun('plan', 'success', 'Plano gerado.', nextPlan.title))
      navigateTo('plan')
    }, 'Plano pronto', 'O AI Tracer gerou um plano operacional auditavel e resetou artefatos dependentes para manter coerencia.')
  }

  async function runPhasesStage() {
    if (!plan) return
    await withStage('phases', async () => {
      const nextPhases = await generatePhases(workspace.goal, plan, runtime as RuntimeConnection)
      updateWorkspace((current) => ({ ...current, artifacts: { ...current.artifacts, phases: nextPhases, execution: null, verification: null } }))
      appendRun(createRun('phases', 'success', 'Fases geradas.', nextPhases.title))
      navigateTo('phases')
    }, 'Phases prontas', 'A sequencia foi quebrada em fases com deliverable, inputs, outputs e risco por etapa.')
  }

  async function runExecutionStage() {
    if (!plan) return
    await withStage('execution', async () => {
      const nextExecution = await generateExecution(workspace.goal, plan, phases, runtime as RuntimeConnection)
      updateWorkspace((current) => ({ ...current, artifacts: { ...current.artifacts, execution: nextExecution, verification: null } }))
      appendRun(createRun('execution', 'success', 'Pacote de execucao gerado.', nextExecution.title))
      navigateTo('execution')
    }, 'Pacote de execucao pronto', 'Os handoffs para Codex, Claude Code e Gemini foram montados sobre o plano atual.')
  }

  async function runVerificationStage() {
    if (!plan || !execution) return
    await withStage('verification', async () => {
      const nextVerification = await generateVerification(workspace.goal, plan, execution, workspace.verificationInput, runtime as RuntimeConnection)
      updateWorkspace((current) => ({ ...current, artifacts: { ...current.artifacts, verification: nextVerification } }))
      appendRun(createRun('verification', 'success', 'Verificacao concluida.', nextVerification.title))
      navigateTo('verification')
    }, 'Verificacao atualizada', 'A auditoria comparou plano, pacote de execucao e evidencia de implementacao.')
  }

  async function handleExport() {
    await exportWorkspaceBundle(workspace)
    appendRun(createRun('export', 'success', 'Workspace exportado.', workspace.name))
    setBanner({ tone: 'success', title: 'Bundle exportado', body: 'O pacote do workspace foi baixado com artefatos, runs e contexto anexado.' })
  }

  const stageProgress = [
    { label: 'Goal', done: workspace.goal.objective.length > 9 },
    { label: 'Plan', done: Boolean(plan) },
    { label: 'Phases', done: Boolean(phases) },
    { label: 'Execute', done: Boolean(execution) },
    { label: 'Verify', done: Boolean(verification) },
  ]

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block"><div className="brand-mark"><Sparkles size={18} /></div><div><p className="eyebrow">AI Tracer</p><h1>Mission control spec-driven</h1></div></div>
        <p className="sidebar-copy">Transforme objetivo, contexto e criterio de aceite em trilhas operacionais, handoffs e verificacoes auditaveis.</p>
        <nav className="nav-list">{viewItems.map((item) => { const Icon = item.icon; return <button key={item.id} className={`nav-item ${activeView === item.id ? 'is-active' : ''}`} onClick={() => navigateTo(item.id)} type="button"><div className="nav-item-icon"><Icon size={16} /></div><div><span>{item.label}</span><small>{item.kicker}</small></div><ChevronRight size={14} /></button> })}</nav>
        <section className="rail-card"><div className="rail-card-header"><span className="eyebrow">Pipeline</span><ShieldCheck size={16} /></div><StageProgress progress={stageProgress} /></section>
        <section className="rail-card"><div className="rail-card-header"><span className="eyebrow">Runtime</span><KeyRound size={16} /></div><div className="runtime-stack"><div className="metric-chip"><span>Provider</span><strong>OpenRouter</strong></div><div className="metric-chip"><span>Modelo</span><strong>{preferences.model}</strong></div><div className={`metric-chip ${runtime ? 'is-online' : ''}`}><span>Status</span><strong>{runtime ? 'Conectado' : 'Sessao local'}</strong></div></div></section>
      </aside>

      <main className="main-panel">
        <section className="hero-shell">
          <div className="hero-copy"><span className="hero-tag">Zero prompt drift. Mais controle. Mais rastreabilidade.</span><h2>Planeje, empacote execucao e verifique com uma IA que pensa em etapas e deixa rastro.</h2><p>O AI Tracer roda como control plane static-first. A chave do provedor fica apenas na sessao do navegador, enquanto planos, fases, pacotes e verificacoes permanecem locais e exportaveis.</p></div>
          <div className="hero-grid"><MetricCard label="Workspace" value={workspace.name} /><MetricCard label="Runs" value={String(workspace.runs.length)} /><MetricCard label="Artefatos" value={String([plan, phases, execution, verification].filter(Boolean).length)} /><MetricCard label="Ultima validacao" value={preferences.lastValidatedAt ? formatDate(preferences.lastValidatedAt) : 'Nao validado'} /></div>
        </section>
        <Banner banner={banner} />
        <div className="content-grid">
          <section className="panel panel-large">
            <div className="panel-header"><div><span className="eyebrow">Current view</span><h3>{viewItems.find((item) => item.id === activeView)?.label}</h3></div><div className="panel-actions"><button className="ghost-button" onClick={() => void handleExport()} type="button"><Download size={16} />Exportar bundle</button><button className="ghost-button" onClick={() => setWorkspace(createDemoWorkspace())} type="button"><RefreshCcw size={16} />Resetar demo</button></div></div>
            <AnimatePresence mode="wait"><motion.div key={activeView} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -18 }} transition={{ duration: 0.2, ease: 'easeOut' }}>
              {activeView === 'mission' && <MissionView workspace={workspace} runtime={runtime} onGo={navigateTo} />}
              {activeView === 'goal' && <GoalView workspace={workspace} connectionDraft={connectionDraft} runtime={runtime} isBusy={isBusy === 'connect'} onConnect={handleConnect} onDisconnect={handleDisconnect} onConnectionChange={setConnectionDraft} onGoalFieldChange={updateGoalField} onGoalListChange={updateGoalList} onAttachmentImport={handleAttachmentImport} onAttachmentRemove={removeAttachment} />}
              {activeView === 'plan' && <PlanView plan={plan} isBusy={isBusy === 'plan'} onGenerate={runPlanStage} />}
              {activeView === 'phases' && <PhasesView plan={plan} phases={phases} isBusy={isBusy === 'phases'} onGenerate={runPhasesStage} />}
              {activeView === 'execution' && <ExecutionView execution={execution} isBusy={isBusy === 'execution'} onGenerate={runExecutionStage} />}
              {activeView === 'verification' && <VerificationView verification={verification} execution={execution} value={workspace.verificationInput} isBusy={isBusy === 'verification'} onChange={(value) => updateWorkspace((current) => ({ ...current, verificationInput: value }))} onGenerate={runVerificationStage} />}
              {activeView === 'workspace' && <WorkspaceView workspace={workspace} />}
            </motion.div></AnimatePresence>
          </section>

          <aside className="panel panel-side">
            <div className="panel-header"><div><span className="eyebrow">Execution feed</span><h3>Ultimas corridas</h3></div></div>
            <div className="feed-list">{workspace.runs.map((run) => <article key={run.id} className={`feed-item ${run.status === 'success' ? 'is-success' : 'is-error'}`}><div className="feed-topline"><span>{run.stage}</span><small>{formatDate(run.finishedAt)}</small></div><strong>{run.summary}</strong><p>{run.detail}</p></article>)}</div>
          </aside>
        </div>
      </main>
    </div>
  )
}

export default App
