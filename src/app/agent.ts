import { generateExecution, generatePhases, generatePlan, generateVerification } from './engine'
import { hydrateMemories, rememberTurn, type MemoryRecord } from './memory'
import { runStructuredPrompt, runTextPrompt } from './openrouter'
import {
  agentTurnPayloadSchema,
  type AgentAction,
  type AgentTurnPayload,
  type ChatMessage,
  type GoalInput,
  type RunRecord,
  type TracerWorkspace,
} from './schemas'
import type { RuntimeConnection, ViewId } from './types'
import { createId, nowIso, sanitizeModelText } from './utils'

const runtimeRequiredActions: AgentAction[] = ['plan', 'phases', 'execution', 'verification']

export interface AgentActionOutcome {
  action: AgentAction
  status: 'executed' | 'skipped'
  summary: string
  artifactMessage?: ChatMessage
  targetView: ViewId
}

export interface AgentTurnResolution {
  workspace: TracerWorkspace
  outcomes: AgentActionOutcome[]
  finalView: ViewId
}

function truncate(value: string, max: number): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, max)
}

function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

function uniquePush(base: string[], items: string[], max: number, itemMax = 280): string[] {
  return Array.from(new Set([...base, ...items.map((item) => truncate(item, itemMax)).filter(Boolean)])).slice(0, max)
}

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

function serializeConversation(workspace: TracerWorkspace): string {
  return workspace.conversation
    .slice(-10)
    .map((message) => `${message.role.toUpperCase()} (${message.kind}): ${truncate(message.text, 320)}`)
    .join('\n')
}

function serializeMemories(memories: MemoryRecord[]): string {
  if (memories.length === 0) {
    return 'Nenhuma memoria recuperada.'
  }

  return memories
    .map((memory, index) => `${index + 1}. [${memory.kind}] ${truncate(memory.text, 320)}`)
    .join('\n')
}

function workspaceDigest(workspace: TracerWorkspace): string {
  return JSON.stringify(
    {
      goal: {
        objective: workspace.goal.objective,
        desiredOutcome: workspace.goal.desiredOutcome,
        constraints: workspace.goal.constraints,
        acceptanceCriteria: workspace.goal.acceptanceCriteria,
        contextNotes: truncate(workspace.goal.contextNotes, 1_400),
        attachments: workspace.goal.attachments.map((file) => ({
          name: file.name,
          kind: file.kind,
          excerpt: truncate(file.content, 600),
        })),
      },
      verificationInput: truncate(workspace.verificationInput, 1_400),
      memory: workspace.memory,
      artifacts: {
        plan: workspace.artifacts.plan ? { title: workspace.artifacts.plan.title, summary: workspace.artifacts.plan.payload.executiveSummary } : null,
        phases: workspace.artifacts.phases ? { title: workspace.artifacts.phases.title, summary: workspace.artifacts.phases.payload.sequencingLogic } : null,
        execution: workspace.artifacts.execution ? { title: workspace.artifacts.execution.title, summary: workspace.artifacts.execution.payload.executionSummary } : null,
        verification: workspace.artifacts.verification ? { title: workspace.artifacts.verification.title, summary: workspace.artifacts.verification.payload.summary } : null,
      },
    },
    null,
    2,
  )
}

function isGreeting(value: string): boolean {
  return /^(oi|ola|e ai|opa|hey|hello)\??$/i.test(normalizeForSearch(value).trim())
}

function asksCapabilities(value: string): boolean {
  return /(o que voce consegue|o que conseguimos fazer|como voce funciona|quais capacidades|o que da para fazer aqui)/i.test(normalizeForSearch(value))
}

function heuristicActions(workspace: TracerWorkspace, lower: string): AgentAction[] {
  const actions: AgentAction[] = []

  if (lower.startsWith('/reset') || lower.includes('resetar') || lower.includes('limpar tudo')) {
    return ['reset']
  }

  if (lower.startsWith('/plan') || lower.includes('gera o plano') || lower.includes('gere o plano') || lower.includes('crie o plano') || lower.includes('planej')) {
    actions.push('plan')
  }

  if (lower.startsWith('/phases') || lower.includes('fase') || lower.includes('quebre em etapas') || lower.includes('decomponha')) {
    actions.push('phases')
  }

  if (lower.startsWith('/execute') || lower.startsWith('/execution') || lower.includes('execu') || lower.includes('handoff') || lower.includes('pacote operacional')) {
    actions.push('execution')
  }

  if (lower.startsWith('/verify') || lower.includes('verifi') || lower.includes('audite') || lower.includes('valide') || lower.includes('review')) {
    actions.push('verification')
  }

  if (
    actions.length === 0
    && (lower.includes('agente') || lower.includes('melhore') || lower.includes('refa') || lower.includes('entenda') || lower.includes('estruture'))
    && !workspace.artifacts.plan
  ) {
    actions.push('plan')
  }

  return Array.from(new Set(actions)).slice(0, 4)
}

function heuristicObjective(workspace: TracerWorkspace, message: string, lower: string): string {
  if (lower.startsWith('/') || isGreeting(message) || asksCapabilities(message)) {
    return ''
  }

  if (lower.includes('quero') || lower.includes('preciso') || lower.includes('crie') || lower.includes('construa') || lower.includes('refa')) {
    return truncate(message, 1_200)
  }

  if (!workspace.artifacts.plan && message.length > 80) {
    return truncate(message, 1_200)
  }

  return ''
}

function heuristicOutcome(message: string, lower: string): string {
  if (lower.includes('para que') || lower.includes('resultado') || lower.includes('quero que')) {
    return truncate(message, 800)
  }

  return ''
}

function heuristicUpdates(workspace: TracerWorkspace, message: string): AgentTurnPayload['updates'] {
  const lower = normalizeForSearch(message)
  const constraintsToAdd = /(sem\s+[^,.!\n]+|nao\s+[^,.!\n]+)/gi
  const criteriaToAdd = /(deve\s+[^,.!\n]+|precisa\s+[^,.!\n]+|criterio\s*:\s*[^,.!\n]+)/gi

  if (isGreeting(message) || asksCapabilities(message)) {
    return {
      objective: '',
      desiredOutcome: '',
      constraintsToAdd: [],
      acceptanceCriteriaToAdd: [],
      contextToAdd: [],
      evidenceToAdd: [],
    }
  }

  return {
    objective: heuristicObjective(workspace, message, lower),
    desiredOutcome: heuristicOutcome(message, lower),
    constraintsToAdd: Array.from(lower.matchAll(constraintsToAdd)).map((match) => truncate(match[0], 280)).slice(0, 3),
    acceptanceCriteriaToAdd: Array.from(lower.matchAll(criteriaToAdd)).map((match) => truncate(match[0], 280)).slice(0, 3),
    contextToAdd: [truncate(message, 500)].slice(0, 1),
    evidenceToAdd:
      lower.includes('evid')
      || lower.includes('prova')
      || lower.includes('resultado implementado')
      || lower.includes('implementacao concluida')
        ? [truncate(message, 500)]
        : [],
  }
}

function buildHeuristicTurn(workspace: TracerWorkspace, userMessage: string, memories: MemoryRecord[]): AgentTurnPayload {
  const lower = userMessage.trim().toLowerCase()
  const actions = heuristicActions(workspace, lower)
  const updates = heuristicUpdates(workspace, userMessage)
  const runtimeNeeded = actions.some((action) => runtimeRequiredActions.includes(action))

  if (isGreeting(userMessage)) {
    return {
      reply: 'Posso conversar com voce de forma livre, recuperar memoria longa local, organizar objetivo, restricoes e criterios, e acionar plan, phases, execution e verification quando fizer sentido. Me diga o que voce quer construir ou resolver e eu puxo o contexto certo antes de agir.',
      understanding: 'Saudacao inicial do usuario.',
      updates,
      actions: [],
      focusView: 'mission',
      needsClarification: false,
      clarificationQuestion: '',
    }
  }

  if (asksCapabilities(userMessage)) {
    return {
      reply: `Hoje eu consigo atuar como agente de plataforma: entendo linguagem natural, retenho memoria longa local, recupero lembrancas relevantes antes de cada turno e aciono ${['plan', 'phases', 'execution', 'verification'].join(', ')} quando isso ajuda de verdade. ${memories.length > 0 ? `Ja recuperei ${memories.length} lembranca(s) relevantes da memoria longa para esta sessao.` : 'Assim que a memoria for sendo alimentada, eu passo a reutilizar historico entre sessoes.'}`,
      understanding: 'O usuario quer entender as capacidades do agente.',
      updates,
      actions: [],
      focusView: 'workspace',
      needsClarification: false,
      clarificationQuestion: '',
    }
  }

  return {
    reply: runtimeNeeded
      ? 'Entendi o seu pedido. Vou conectar esse contexto ao que ja sei, recuperar o que for relevante e acionar as proximas etapas com o runtime.'
      : 'Entendi o seu pedido. Vou guardar esse contexto e seguir a conversa de forma natural a partir daqui.',
    understanding: truncate(userMessage, 240),
    updates,
    actions,
    focusView:
      actions.at(-1) === 'verification'
        ? 'verification'
        : actions.at(-1) === 'execution'
          ? 'execution'
          : actions.at(-1) === 'phases'
            ? 'phases'
            : actions.at(-1) === 'plan'
              ? 'plan'
              : 'mission',
    needsClarification: false,
    clarificationQuestion: '',
  }
}

function normalizeActions(workspace: TracerWorkspace, turn: AgentTurnPayload): AgentAction[] {
  const requested = Array.from(new Set(turn.actions))
  const normalized: AgentAction[] = []
  const hasEvidence = workspace.verificationInput.trim().length > 0 || turn.updates.evidenceToAdd.length > 0

  const push = (action: AgentAction) => {
    if (!normalized.includes(action)) {
      normalized.push(action)
    }
  }

  for (const action of requested) {
    if (action === 'phases' && !workspace.artifacts.plan) {
      push('plan')
    }

    if (action === 'execution') {
      if (!workspace.artifacts.plan) push('plan')
      if (!workspace.artifacts.phases) push('phases')
    }

    if (action === 'verification') {
      if (!workspace.artifacts.plan) push('plan')
      if (!workspace.artifacts.phases) push('phases')
      if (!workspace.artifacts.execution) push('execution')
      if (!hasEvidence) {
        continue
      }
    }

    push(action)
  }

  return normalized.slice(0, 5)
}

function buildAgentTurnPrompts(
  workspace: TracerWorkspace,
  userMessage: string,
  memories: MemoryRecord[],
): { system: string; user: string } {
  return {
    system: `Voce e o AI Tracer, um agente conversacional com memoria longa, planejamento e uso de acoes internas.
Seu trabalho neste passo e CONTROLAR o turno, nao escrever a resposta final.
Regras obrigatorias:
- entenda pedidos em linguagem natural sem exigir formularios, chips ou prefixos;
- use as memorias recuperadas apenas quando elas forem realmente relevantes;
- atualize o contexto persistente a partir da conversa;
- escolha acoes internas quando isso acelerar progresso real;
- faca no maximo uma pergunta curta apenas se houver bloqueio real;
- nao finja que executou uma acao antes de ela rodar;
- retorne JSON puro e preencha todos os campos do schema.`,
    user: `Mensagem nova do usuario:
${userMessage}

Workspace atual:
${workspaceDigest(workspace)}

Memorias recuperadas:
${serializeMemories(memories)}

Ultimas mensagens:
${serializeConversation(workspace) || 'Sem historico relevante ainda.'}

Responda com:
{
  "reply": string,
  "understanding": string,
  "updates": {
    "objective": string,
    "desiredOutcome": string,
    "constraintsToAdd": string[],
    "acceptanceCriteriaToAdd": string[],
    "contextToAdd": string[],
    "evidenceToAdd": string[]
  },
  "actions": ["plan" | "phases" | "execution" | "verification" | "reset"],
  "focusView": "mission" | "goal" | "plan" | "phases" | "execution" | "verification" | "workspace",
  "needsClarification": boolean,
  "clarificationQuestion": string
}

Use o campo "reply" apenas como um rascunho interno curto do que aconteceu no turno. A resposta natural final sera gerada separadamente.`,
  }
}

function coerceAgentTurn(
  workspace: TracerWorkspace,
  userMessage: string,
  memories: MemoryRecord[],
  value: unknown,
): AgentTurnPayload {
  const fallback = buildHeuristicTurn(workspace, userMessage, memories)
  const record = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  const updatesSource = typeof record.updates === 'object' && record.updates !== null ? (record.updates as Record<string, unknown>) : {}
  const rawActions = Array.isArray(record.actions) ? record.actions : fallback.actions
  const actions = rawActions
    .filter((item): item is AgentAction => item === 'plan' || item === 'phases' || item === 'execution' || item === 'verification' || item === 'reset')
    .slice(0, 4)

  const turn = {
    reply: typeof record.reply === 'string' && record.reply.trim().length >= 8 ? truncate(sanitizeModelText(record.reply), 2_400) : fallback.reply,
    understanding: typeof record.understanding === 'string' ? truncate(sanitizeModelText(record.understanding), 400) : fallback.understanding,
    updates: {
      objective: typeof updatesSource.objective === 'string' ? truncate(sanitizeModelText(updatesSource.objective), 4_000) : fallback.updates.objective,
      desiredOutcome: typeof updatesSource.desiredOutcome === 'string' ? truncate(sanitizeModelText(updatesSource.desiredOutcome), 2_000) : fallback.updates.desiredOutcome,
      constraintsToAdd: uniquePush([], Array.isArray(updatesSource.constraintsToAdd) ? updatesSource.constraintsToAdd.filter((item): item is string => typeof item === 'string').map((item) => sanitizeModelText(item)) : fallback.updates.constraintsToAdd, 6),
      acceptanceCriteriaToAdd: uniquePush([], Array.isArray(updatesSource.acceptanceCriteriaToAdd) ? updatesSource.acceptanceCriteriaToAdd.filter((item): item is string => typeof item === 'string').map((item) => sanitizeModelText(item)) : fallback.updates.acceptanceCriteriaToAdd, 6),
      contextToAdd: uniquePush([], Array.isArray(updatesSource.contextToAdd) ? updatesSource.contextToAdd.filter((item): item is string => typeof item === 'string').map((item) => sanitizeModelText(item)) : fallback.updates.contextToAdd, 6, 500),
      evidenceToAdd: uniquePush([], Array.isArray(updatesSource.evidenceToAdd) ? updatesSource.evidenceToAdd.filter((item): item is string => typeof item === 'string').map((item) => sanitizeModelText(item)) : fallback.updates.evidenceToAdd, 6, 500),
    },
    actions: actions.length > 0 ? actions : fallback.actions,
    focusView:
      record.focusView === 'mission' || record.focusView === 'goal' || record.focusView === 'plan' || record.focusView === 'phases'
      || record.focusView === 'execution' || record.focusView === 'verification' || record.focusView === 'workspace'
        ? record.focusView
        : fallback.focusView,
    needsClarification: typeof record.needsClarification === 'boolean' ? record.needsClarification : false,
    clarificationQuestion: typeof record.clarificationQuestion === 'string' ? truncate(sanitizeModelText(record.clarificationQuestion), 400) : '',
  } satisfies AgentTurnPayload

  if (turn.actions.includes('verification') && workspace.verificationInput.trim().length === 0 && turn.updates.evidenceToAdd.length === 0) {
    turn.actions = turn.actions.filter((action) => action !== 'verification')
    turn.needsClarification = true
    turn.clarificationQuestion = 'Para validar de verdade, me envie a evidencia concreta da implementacao ou do resultado que eu devo auditar.'
  }

  return turn
}

export async function runAgentTurn(
  workspace: TracerWorkspace,
  userMessage: string,
  runtime: RuntimeConnection | null,
  memories: MemoryRecord[] = [],
): Promise<AgentTurnPayload> {
  if (!runtime || userMessage.trim().startsWith('/')) {
    return buildHeuristicTurn(workspace, userMessage, memories)
  }

  try {
    return await runStructuredPrompt(runtime, agentTurnPayloadSchema, buildAgentTurnPrompts(workspace, userMessage, memories), {
      maxTokens: 1_100,
      coerce: (value) => coerceAgentTurn(workspace, userMessage, memories, value),
    })
  } catch (error) {
    const fallback = buildHeuristicTurn(workspace, userMessage, memories)
    const message = error instanceof Error ? error.message : 'Falha desconhecida.'
    return {
      ...fallback,
      reply: `Entendi o que voce quer, mas o runtime falhou neste passo de controle (${message}). Vou continuar com memoria local e posso aprofundar a conversa assim que a conexao estabilizar.`,
    }
  }
}

function applyAgentUpdates(goal: GoalInput, turn: AgentTurnPayload, workspace: TracerWorkspace): GoalInput {
  const nextContext = uniquePush(goal.contextNotes ? [goal.contextNotes] : [], turn.updates.contextToAdd, 8, 500).join('\n\n')

  workspace.verificationInput = uniquePush(
    workspace.verificationInput ? [workspace.verificationInput] : [],
    turn.updates.evidenceToAdd,
    8,
    500,
  ).join('\n\n')

  return {
    ...goal,
    objective: turn.updates.objective || goal.objective,
    desiredOutcome: turn.updates.desiredOutcome || goal.desiredOutcome,
    constraints: uniquePush(goal.constraints, turn.updates.constraintsToAdd, 12),
    acceptanceCriteria: uniquePush(goal.acceptanceCriteria, turn.updates.acceptanceCriteriaToAdd, 12),
    contextNotes: nextContext.slice(0, 6_000),
  }
}

function buildReplyMessages(
  workspace: TracerWorkspace,
  userMessage: string,
  turn: AgentTurnPayload,
  outcomes: AgentActionOutcome[],
  memories: MemoryRecord[],
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const outcomeLines = outcomes.length > 0
    ? outcomes.map((outcome) => `- ${outcome.action}: ${outcome.status} | ${truncate(outcome.summary, 220)}`).join('\n')
    : 'Nenhuma acao foi executada neste turno.'

  return [
    {
      role: 'system',
      content: `Voce e o AI Tracer respondendo como um agente de verdade.
Escreva em portugues do Brasil.
Seja natural, objetivo, conversacional e inteligente.
Regras:
- nada de resposta genérica repetida;
- reconheca o que o usuario quis dizer;
- cite memoria recuperada apenas se for util;
- se acoes foram executadas, explique isso naturalmente;
- se faltou runtime ou evidencia, explique com elegancia e sem soar travado;
- nao mencione JSON, schema, prompt interno ou "memoria operacional" como jargao repetitivo;
- evite titulos markdown, blocos decorativos e listas longas quando uma resposta curta resolver;
- so faca pergunta no final se houver bloqueio explicito neste turno.`,
    },
    {
      role: 'user',
      content: `Mensagem do usuario:
${userMessage}

Entendimento interno:
${turn.understanding}

Workspace apos atualizacoes:
${workspaceDigest(workspace)}

Memorias relevantes:
${serializeMemories(memories)}

Resultado das acoes:
${outcomeLines}

Precisa de esclarecimento explicito neste turno? ${turn.needsClarification ? 'sim' : 'nao'}

Gere uma resposta final unica, fluida e util para o usuario.`,
    },
  ]
}

function buildHeuristicReply(
  workspace: TracerWorkspace,
  userMessage: string,
  turn: AgentTurnPayload,
  outcomes: AgentActionOutcome[],
  runtime: RuntimeConnection | null,
  memories: MemoryRecord[],
): string {
  if (isGreeting(userMessage)) {
    return buildHeuristicTurn(workspace, userMessage, memories).reply
  }

  if (asksCapabilities(userMessage)) {
    return buildHeuristicTurn(workspace, userMessage, memories).reply
  }

  const executed = outcomes.filter((item) => item.status === 'executed')
  const skipped = outcomes.filter((item) => item.status === 'skipped')
  const parts: string[] = []

  parts.push(`Entendi: ${turn.understanding || truncate(userMessage, 220)}.`)

  if (executed.length > 0) {
    parts.push(`Ja coloquei a conversa em movimento com ${executed.map((item) => item.action).join(', ')}.`)
  }

  if (memories.length > 0) {
    parts.push(`Tambem recuperei ${memories.length} lembranca(s) relevantes da memoria longa local para manter continuidade entre sessoes.`)
  }

  if (skipped.length > 0 && !runtime) {
    parts.push('Para aprofundar com raciocinio do modelo e gerar artefatos reais, conecte o runtime. Ate la, eu continuo guardando contexto e preparando o proximo passo.')
  }

  if (turn.needsClarification && turn.clarificationQuestion) {
    parts.push(turn.clarificationQuestion)
  }

  return parts.join('\n\n')
}

async function generateConversationalReply(
  workspace: TracerWorkspace,
  userMessage: string,
  turn: AgentTurnPayload,
  outcomes: AgentActionOutcome[],
  runtime: RuntimeConnection | null,
  memories: MemoryRecord[],
): Promise<string> {
  if (!runtime) {
    return buildHeuristicReply(workspace, userMessage, turn, outcomes, runtime, memories)
  }

  try {
    return sanitizeModelText(await runTextPrompt(runtime, buildReplyMessages(workspace, userMessage, turn, outcomes, memories), {
      maxTokens: 500,
      temperature: 0.45,
    }))
  } catch {
    return buildHeuristicReply(workspace, userMessage, turn, outcomes, runtime, memories)
  }
}

export async function executeAgentTurn(
  workspace: TracerWorkspace,
  turn: AgentTurnPayload,
  runtime: RuntimeConnection | null,
  memories: MemoryRecord[] = [],
  userMessage = '',
): Promise<AgentTurnResolution> {
  const nextWorkspace = structuredClone(workspace)
  nextWorkspace.goal = applyAgentUpdates(nextWorkspace.goal, turn, nextWorkspace)

  const artifactMessages: ChatMessage[] = []
  const outcomes: AgentActionOutcome[] = []
  const actions = normalizeActions(nextWorkspace, turn)

  for (const action of actions) {
    if (action === 'reset') {
      outcomes.push({
        action,
        status: 'executed',
        summary: 'O usuario pediu para reiniciar o loop do agente.',
        targetView: 'mission',
      })
      continue
    }

    if (runtimeRequiredActions.includes(action) && !runtime) {
      outcomes.push({
        action,
        status: 'skipped',
        summary: 'A acao depende de runtime conectado para gerar um artefato real.',
        targetView: 'mission',
      })
      continue
    }

    if (action === 'plan') {
      const plan = await generatePlan(nextWorkspace.goal, runtime as RuntimeConnection)
      nextWorkspace.mode = 'live'
      nextWorkspace.artifacts.plan = plan
      nextWorkspace.artifacts.phases = null
      nextWorkspace.artifacts.execution = null
      nextWorkspace.artifacts.verification = null
      nextWorkspace.runs = [createRun('plan', 'success', 'Plano gerado.', plan.title), ...nextWorkspace.runs].slice(0, 60)
      artifactMessages.push(createMessage('agent', 'artifact', plan.payload.executiveSummary, { artifactType: 'plan', stage: 'plan' }))
      outcomes.push({
        action,
        status: 'executed',
        summary: plan.payload.firstMove,
        artifactMessage: artifactMessages.at(-1),
        targetView: 'plan',
      })
      continue
    }

    if (action === 'phases' && nextWorkspace.artifacts.plan) {
      const phases = await generatePhases(nextWorkspace.goal, nextWorkspace.artifacts.plan, runtime as RuntimeConnection)
      nextWorkspace.artifacts.phases = phases
      nextWorkspace.artifacts.execution = null
      nextWorkspace.artifacts.verification = null
      nextWorkspace.runs = [createRun('phases', 'success', 'Fases geradas.', phases.title), ...nextWorkspace.runs].slice(0, 60)
      artifactMessages.push(createMessage('agent', 'artifact', phases.payload.sequencingLogic, { artifactType: 'phases', stage: 'phases' }))
      outcomes.push({
        action,
        status: 'executed',
        summary: phases.payload.phases.map((phase) => phase.title).slice(0, 3).join(' | '),
        artifactMessage: artifactMessages.at(-1),
        targetView: 'phases',
      })
      continue
    }

    if (action === 'execution' && nextWorkspace.artifacts.plan) {
      const execution = await generateExecution(
        nextWorkspace.goal,
        nextWorkspace.artifacts.plan,
        nextWorkspace.artifacts.phases,
        runtime as RuntimeConnection,
      )
      nextWorkspace.artifacts.execution = execution
      nextWorkspace.artifacts.verification = null
      nextWorkspace.runs = [createRun('execution', 'success', 'Pacote de execucao gerado.', execution.title), ...nextWorkspace.runs].slice(0, 60)
      artifactMessages.push(createMessage('agent', 'artifact', execution.payload.executionSummary, { artifactType: 'execution', stage: 'execution' }))
      outcomes.push({
        action,
        status: 'executed',
        summary: execution.payload.operatorChecklist.slice(0, 2).join(' | '),
        artifactMessage: artifactMessages.at(-1),
        targetView: 'execution',
      })
      continue
    }

    if (action === 'verification' && nextWorkspace.artifacts.plan && nextWorkspace.artifacts.execution) {
      const verification = await generateVerification(
        nextWorkspace.goal,
        nextWorkspace.artifacts.plan,
        nextWorkspace.artifacts.execution,
        nextWorkspace.verificationInput,
        runtime as RuntimeConnection,
      )
      nextWorkspace.artifacts.verification = verification
      nextWorkspace.runs = [createRun('verification', 'success', 'Verificacao concluida.', verification.title), ...nextWorkspace.runs].slice(0, 60)
      artifactMessages.push(createMessage('agent', 'artifact', verification.payload.summary, { artifactType: 'verification', stage: 'verification' }))
      outcomes.push({
        action,
        status: 'executed',
        summary: verification.payload.nextMove,
        artifactMessage: artifactMessages.at(-1),
        targetView: 'verification',
      })
    }
  }

  const reply = await generateConversationalReply(nextWorkspace, userMessage, turn, outcomes, runtime, memories)
  const memoryState = await rememberTurn({
    userMessage,
    assistantReply: reply,
    objective: turn.updates.objective || nextWorkspace.goal.objective,
    desiredOutcome: turn.updates.desiredOutcome || nextWorkspace.goal.desiredOutcome,
    constraints: turn.updates.constraintsToAdd,
    criteria: turn.updates.acceptanceCriteriaToAdd,
    context: turn.updates.contextToAdd,
    executedActions: outcomes.filter((item) => item.status === 'executed').map((item) => item.action),
  })

  nextWorkspace.memory = {
    ...memoryState,
    retrieved: memories.map((memory) => memory.text).slice(0, 8),
  }
  nextWorkspace.conversation = [
    ...nextWorkspace.conversation,
    createMessage('agent', 'text', reply, { stage: 'agent' }),
    ...artifactMessages,
  ].slice(-200)
  nextWorkspace.updatedAt = nowIso()

  return {
    workspace: nextWorkspace,
    outcomes,
    finalView: outcomes.at(-1)?.targetView ?? turn.focusView,
  }
}

export async function processAgentTurn(
  workspace: TracerWorkspace,
  userMessage: string,
  runtime: RuntimeConnection | null,
): Promise<AgentTurnResolution> {
  const hydrated = await hydrateMemories(`${workspace.goal.objective}\n${workspace.goal.desiredOutcome}\n${userMessage}`)
  const workspaceWithMemory = structuredClone(workspace)
  workspaceWithMemory.memory = hydrated.snapshot
  const turn = await runAgentTurn(workspaceWithMemory, userMessage, runtime, hydrated.records)
  return executeAgentTurn(workspaceWithMemory, turn, runtime, hydrated.records, userMessage)
}
