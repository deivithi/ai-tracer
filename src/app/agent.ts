import { generateExecution, generatePhases, generatePlan, generateVerification } from './engine'
import { runStructuredPrompt } from './openrouter'
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
import { createId, nowIso } from './utils'

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

function uniquePush(base: string[], items: string[], max: number): string[] {
  return Array.from(new Set([...base, ...items.map((item) => truncate(item, 280)).filter(Boolean)])).slice(0, max)
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
    .slice(-8)
    .map((message) => `${message.role.toUpperCase()} (${message.kind}): ${truncate(message.text, 320)}`)
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

  if (actions.length === 0 && (lower.includes('agente') || lower.includes('melhore') || lower.includes('refa') || lower.includes('entenda') || lower.includes('estruture'))) {
    if (!workspace.artifacts.plan) {
      actions.push('plan')
    }
  }

  return Array.from(new Set(actions)).slice(0, 4)
}

function heuristicObjective(workspace: TracerWorkspace, message: string, lower: string): string {
  if (lower.startsWith('/')) {
    return ''
  }

  if (lower.includes('quero') || lower.includes('preciso') || lower.includes('crie') || lower.includes('construa') || lower.includes('refa')) {
    return truncate(message, 1_200)
  }

  if (!workspace.artifacts.plan && message.length > 60) {
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
  const lower = message.toLowerCase()
  const constraintsToAdd = /(sem\s+[^,.!\n]+|nao\s+[^,.!\n]+|não\s+[^,.!\n]+)/gi
  const criteriaToAdd = /(deve\s+[^,.!\n]+|precisa\s+[^,.!\n]+|criterio\s*:\s*[^,.!\n]+)/gi

  return {
    objective: heuristicObjective(workspace, message, lower),
    desiredOutcome: heuristicOutcome(message, lower),
    constraintsToAdd: Array.from(lower.matchAll(constraintsToAdd)).map((match) => truncate(match[0], 280)).slice(0, 3),
    acceptanceCriteriaToAdd: Array.from(lower.matchAll(criteriaToAdd)).map((match) => truncate(match[0], 280)).slice(0, 3),
    contextToAdd: lower.startsWith('/') ? [] : [truncate(message, 500)].slice(0, 1),
    evidenceToAdd: lower.includes('evid') || lower.includes('prova') || lower.includes('resultado implementado')
      ? [truncate(message, 500)]
      : [],
  }
}

function buildHeuristicTurn(workspace: TracerWorkspace, userMessage: string): AgentTurnPayload {
  const lower = userMessage.trim().toLowerCase()
  const actions = heuristicActions(workspace, lower)
  const updates = heuristicUpdates(workspace, userMessage)
  const runtimeNeeded = actions.some((action) => runtimeRequiredActions.includes(action))

  return {
    reply: runtimeNeeded
      ? 'Entendi o seu pedido e consigo organizar a conversa como um agente de verdade. Vou atualizar a memoria operacional agora e, com o runtime conectado, disparar os proximos artefatos automaticamente.'
      : 'Entendi o seu pedido e atualizei a memoria operacional para manter a conversa mais fluida e menos roteirizada.',
    understanding: truncate(userMessage, 240),
    updates,
    actions,
    focusView: actions.at(-1) === 'verification'
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

function buildAgentTurnPrompts(workspace: TracerWorkspace, userMessage: string): { system: string; user: string } {
  return {
    system: `Voce e o AI Tracer, um agente conversacional com memoria, planejamento e uso de acoes internas.
Seu estilo deve ser natural, direto e colaborativo em portugues do Brasil.
Principios obrigatorios:
- entenda pedidos em linguagem natural sem exigir formularios ou prefixos;
- atualize memoria operacional a partir da conversa;
- escolha acoes internas quando isso acelerar o progresso real;
- faca no maximo uma pergunta curta apenas se houver bloqueio real;
- nao finja que executou uma acao antes de ela rodar;
- evite respostas mecanicas, pre-programadas ou tutorializadas;
- trate as acoes disponiveis como ferramentas internas: plan, phases, execution, verification e reset.
Retorne JSON puro e preencha todos os campos do schema.`,
    user: `Mensagem nova do usuario:
${userMessage}

Workspace atual:
${workspaceDigest(workspace)}

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

Regras extras:
- se o usuario quiser que voce aja, proponha e acione as acoes necessarias;
- se o pedido mencionar melhorar o proprio agente ou a experiencia, trate isso como contexto de produto e arquitetura;
- use strings vazias quando objective ou desiredOutcome nao precisarem mudar;
- evite repetir literalmente o texto do usuario sem agregar entendimento.`,
  }
}

function coerceAgentTurn(workspace: TracerWorkspace, userMessage: string, value: unknown): AgentTurnPayload {
  const fallback = buildHeuristicTurn(workspace, userMessage)
  const record = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  const updatesSource = typeof record.updates === 'object' && record.updates !== null ? (record.updates as Record<string, unknown>) : {}
  const rawActions = Array.isArray(record.actions) ? record.actions : fallback.actions
  const actions = rawActions
    .filter((item): item is AgentAction => item === 'plan' || item === 'phases' || item === 'execution' || item === 'verification' || item === 'reset')
    .slice(0, 4)

  const turn = {
    reply: typeof record.reply === 'string' && record.reply.trim().length >= 8 ? truncate(record.reply, 2_400) : fallback.reply,
    understanding: typeof record.understanding === 'string' ? truncate(record.understanding, 400) : fallback.understanding,
    updates: {
      objective: typeof updatesSource.objective === 'string' ? truncate(updatesSource.objective, 4_000) : fallback.updates.objective,
      desiredOutcome: typeof updatesSource.desiredOutcome === 'string' ? truncate(updatesSource.desiredOutcome, 2_000) : fallback.updates.desiredOutcome,
      constraintsToAdd: uniquePush([], Array.isArray(updatesSource.constraintsToAdd) ? updatesSource.constraintsToAdd.filter((item): item is string => typeof item === 'string') : fallback.updates.constraintsToAdd, 6),
      acceptanceCriteriaToAdd: uniquePush([], Array.isArray(updatesSource.acceptanceCriteriaToAdd) ? updatesSource.acceptanceCriteriaToAdd.filter((item): item is string => typeof item === 'string') : fallback.updates.acceptanceCriteriaToAdd, 6),
      contextToAdd: uniquePush([], Array.isArray(updatesSource.contextToAdd) ? updatesSource.contextToAdd.filter((item): item is string => typeof item === 'string') : fallback.updates.contextToAdd, 6),
      evidenceToAdd: uniquePush([], Array.isArray(updatesSource.evidenceToAdd) ? updatesSource.evidenceToAdd.filter((item): item is string => typeof item === 'string') : fallback.updates.evidenceToAdd, 6),
    },
    actions: actions.length > 0 ? actions : fallback.actions,
    focusView:
      record.focusView === 'mission' || record.focusView === 'goal' || record.focusView === 'plan' || record.focusView === 'phases'
      || record.focusView === 'execution' || record.focusView === 'verification' || record.focusView === 'workspace'
        ? record.focusView
        : fallback.focusView,
    needsClarification: typeof record.needsClarification === 'boolean' ? record.needsClarification : false,
    clarificationQuestion:
      typeof record.clarificationQuestion === 'string' ? truncate(record.clarificationQuestion, 400) : '',
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
): Promise<AgentTurnPayload> {
  if (!runtime || userMessage.trim().startsWith('/')) {
    return buildHeuristicTurn(workspace, userMessage)
  }

  try {
    return await runStructuredPrompt(runtime, agentTurnPayloadSchema, buildAgentTurnPrompts(workspace, userMessage), {
      maxTokens: 1_100,
      coerce: (value) => coerceAgentTurn(workspace, userMessage, value),
    })
  } catch (error) {
    const fallback = buildHeuristicTurn(workspace, userMessage)
    const message = error instanceof Error ? error.message : 'Falha desconhecida.'
    return {
      ...fallback,
      reply: `Entendi o que voce quer, mas o runtime falhou nesta rodada (${message}). Vou continuar com a memoria local e posso agir melhor assim que a conexao estabilizar.`,
    }
  }
}

function applyAgentUpdates(goal: GoalInput, turn: AgentTurnPayload, workspace: TracerWorkspace): GoalInput {
  const nextContext = uniquePush(
    goal.contextNotes ? [goal.contextNotes] : [],
    turn.updates.contextToAdd,
    8,
  ).join('\n\n')

  workspace.verificationInput = uniquePush(
    workspace.verificationInput ? [workspace.verificationInput] : [],
    turn.updates.evidenceToAdd,
    8,
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

function composeReply(turn: AgentTurnPayload, outcomes: AgentActionOutcome[], runtime: RuntimeConnection | null): string {
  const executed = outcomes.filter((item) => item.status === 'executed')
  const skipped = outcomes.filter((item) => item.status === 'skipped')
  const parts = [turn.reply.trim()]

  if (executed.length > 0) {
    parts.push(`Acabei de executar: ${executed.map((item) => item.action).join(', ')}.`)
  }

  if (skipped.length > 0 && !runtime) {
    parts.push('Se voce conectar o runtime, eu gero artefatos reais nesta mesma conversa sem te empurrar para um fluxo engessado.')
  }

  if (turn.needsClarification && turn.clarificationQuestion) {
    parts.push(turn.clarificationQuestion)
  }

  return parts.join('\n\n')
}

export async function executeAgentTurn(
  workspace: TracerWorkspace,
  turn: AgentTurnPayload,
  runtime: RuntimeConnection | null,
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

  const reply = composeReply(turn, outcomes, runtime)
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
