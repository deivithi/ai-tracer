import {
  executionArtifactSchema,
  executionPayloadSchema,
  phaseArtifactSchema,
  phasePayloadSchema,
  planArtifactSchema,
  planPayloadSchema,
  verificationArtifactSchema,
  verificationPayloadSchema,
  type ExecutionArtifact,
  type GoalInput,
  type PhaseArtifact,
  type PlanArtifact,
  type VerificationArtifact,
} from './schemas'
import { buildExecutionPrompts, buildPhasePrompts, buildPlanPrompts, buildVerificationPrompts } from './prompts'
import { runStructuredPrompt } from './openrouter'
import type { RuntimeConnection } from './types'
import { createId, joinBullets, nowIso, sanitizeModelText } from './utils'

function truncate(value: string, max: number): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, max)
}

function normalizeTextCandidate(value: unknown, max: number): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = truncate(sanitizeModelText(value), max)
  return normalized.length > 0 ? normalized : null
}

function enforceText(value: unknown, fallback: string, min: number, max: number): string {
  const candidate = normalizeTextCandidate(value, max)
  if (candidate && candidate.length >= min) {
    return candidate
  }

  return truncate(fallback, max)
}

function enforceList(value: unknown, fallback: string[], min: number, max: number, itemMax = 220): string[] {
  const source = Array.isArray(value) ? value : []
  const normalized = source
    .map((item) => normalizeTextCandidate(item, itemMax))
    .filter((item): item is string => Boolean(item))

  const merged = normalized.length >= min ? normalized : [...normalized, ...fallback.map((item) => truncate(item, itemMax))]
  return Array.from(new Set(merged)).slice(0, max)
}

function fallbackContextSignals(goal: GoalInput): string[] {
  return [
    `Objetivo central: ${truncate(goal.objective, 180)}`,
    `Resultado desejado: ${truncate(goal.desiredOutcome, 180)}`,
    goal.constraints[0] ? `Restricao dominante: ${truncate(goal.constraints[0], 180)}` : 'Restricao dominante: manter a aplicacao leve e segura.',
  ]
}

function fallbackScopeBoundaries(goal: GoalInput): string[] {
  const fromGoal = goal.constraints.map((item) => `BOUNDARY: ${truncate(item, 180)}`)
  return [
    ...fromGoal,
    'BOUNDARY: nao expor segredos no bundle publicado.',
    'BOUNDARY: manter compatibilidade com deploy estatico em GitHub Pages.',
    'BOUNDARY: priorizar rastreabilidade e verificacao antes de automacao ampla.',
  ].slice(0, 5)
}

function fallbackWorkstreams(goal: GoalInput) {
  return [
    {
      name: 'Workspace e pipeline',
      goal: `Estruturar o loop spec-driven principal para atender: ${truncate(goal.desiredOutcome, 220)}`,
      surfaces: ['Goal input', 'Plan artifact', 'Phases artifact', 'Verification artifact'],
      deliverables: ['Fluxo objetivo -> plano operacional', 'Persistencia local do workspace', 'Feed de runs rastreavel'],
      acceptanceChecks: [
        'O usuario consegue sair do objetivo para um plano verificavel.',
        'Mudancas de estado sobrevivem a navegacao e reload.',
      ],
    },
    {
      name: 'Runtime e seguranca',
      goal: 'Conectar o runtime do modelo com controles de segredo, timeout e resposta estruturada.',
      surfaces: ['OpenRouter runtime', 'Session storage', 'CSP', 'Exportacao local'],
      deliverables: ['Conexao validada com o modelo', 'Chave restrita a sessao local', 'Exportacao do workspace em bundle'],
      acceptanceChecks: [
        'Nenhum segredo fica persistido no bundle publicado.',
        'Falhas de provider retornam mensagem clara e recuperavel.',
      ],
    },
  ]
}

function fallbackRisks(goal: GoalInput): Array<{ severity: 'critical' | 'major' | 'minor' | 'outdated'; title: string; mitigation: string }> {
  return [
    {
      severity: 'critical',
      title: 'Segredo exposto no cliente',
      mitigation: 'Manter a chave apenas em sessao local e bloquear qualquer persistencia no bundle exportado.',
    },
    {
      severity: 'major',
      title: 'Resposta parcial do modelo',
      mitigation: 'Usar schema validation, repair pass e defaults derivados do objetivo para fechar lacunas estruturais.',
    },
    {
      severity: 'minor',
      title: 'Escopo crescer alem do necessario',
      mitigation: `Prender o produto ao resultado desejado: ${truncate(goal.desiredOutcome, 180)}.`,
    },
  ]
}

function fallbackApprovalGates(goal: GoalInput): string[] {
  const fromCriteria = goal.acceptanceCriteria.map((item) => `Validar: ${truncate(item, 180)}`)
  return [
    ...fromCriteria,
    'Confirmar que a navegacao e a persistencia local permanecem estaveis.',
    'Provar que o runtime responde sem expor segredos no deploy.',
  ].slice(0, 5)
}

function fallbackFirstMove(goal: GoalInput): string {
  return truncate(`Congelar o objetivo "${goal.objective}" em um plano auditavel e validar o runtime antes de abrir as fases.`, 480)
}

function coercePlanPayload(goal: GoalInput, value: unknown): unknown {
  const record = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  const fallbackStreams = fallbackWorkstreams(goal)
  const rawStreams = Array.isArray(record.workstreams) ? record.workstreams : []

  const workstreams = (rawStreams.length > 0 ? rawStreams : fallbackStreams)
    .slice(0, 5)
    .map((stream, index) => {
      const fallback = fallbackStreams[index] ?? fallbackStreams[fallbackStreams.length - 1]
      const source = typeof stream === 'object' && stream !== null ? (stream as Record<string, unknown>) : {}

      return {
        name: enforceText(source.name, fallback.name, 2, 120),
        goal: enforceText(source.goal, fallback.goal, 20, 320),
        surfaces: enforceList(source.surfaces, fallback.surfaces, 1, 5, 180),
        deliverables: enforceList(source.deliverables, fallback.deliverables, 2, 5, 220),
        acceptanceChecks: enforceList(source.acceptanceChecks, fallback.acceptanceChecks, 2, 5, 220),
      }
    })

  while (workstreams.length < 2) {
    const fallback = fallbackStreams[workstreams.length]
    workstreams.push(fallback)
  }

  const rawRisks = Array.isArray(record.risks) ? record.risks : []
  const risks = (rawRisks.length > 0 ? rawRisks : fallbackRisks(goal))
    .slice(0, 6)
    .map((risk, index) => {
      const fallback = fallbackRisks(goal)[index] ?? fallbackRisks(goal)[0]
      const source = typeof risk === 'object' && risk !== null ? (risk as Record<string, unknown>) : {}
      const severity = source.severity

      return {
        severity:
          severity === 'critical' || severity === 'major' || severity === 'minor' || severity === 'outdated'
            ? severity
            : fallback.severity,
        title: enforceText(source.title, fallback.title, 2, 120),
        mitigation: enforceText(source.mitigation, fallback.mitigation, 10, 220),
      }
    })

  while (risks.length < 2) {
    const fallback = fallbackRisks(goal)[risks.length] ?? fallbackRisks(goal)[0]
    risks.push(fallback)
  }

  return {
    title: enforceText(record.title, `Plano - ${truncate(goal.objective, 110)}`, 3, 140),
    executiveSummary: enforceText(
      record.executiveSummary,
      `Construir uma resposta operacional para ${truncate(goal.objective, 200)} com foco em rastreabilidade, seguranca e leveza.`,
      40,
      1400,
    ),
    productNorthStar: enforceText(record.productNorthStar, truncate(goal.desiredOutcome, 240), 20, 280),
    recommendedMode: record.recommendedMode === 'plan' || record.recommendedMode === 'phases' || record.recommendedMode === 'epic'
      ? record.recommendedMode
      : 'phases',
    contextSignals: enforceList(record.contextSignals, fallbackContextSignals(goal), 3, 8, 220),
    scopeBoundaries: enforceList(record.scopeBoundaries, fallbackScopeBoundaries(goal), 3, 8, 220),
    workstreams,
    risks,
    approvalGates: enforceList(record.approvalGates, fallbackApprovalGates(goal), 2, 6, 220),
    firstMove: enforceText(record.firstMove, fallbackFirstMove(goal), 10, 480),
  }
}

function fallbackPhaseBreakdown(goal: GoalInput, plan: PlanArtifact) {
  return [
    {
      id: 'P1',
      title: 'Estruturar o control plane',
      goal: `Consolidar ${plan.title} em uma base navegavel e persistente.`,
      deliverable: 'Plano operacional estabilizado e pronto para decomposicao.',
      inputs: ['Objetivo consolidado', 'Restricoes do produto', 'Criterios de aceite'],
      outputs: ['Workspace persistido', 'Plano revisado', 'Decisoes de escopo congeladas'],
      tasks: ['Validar o objetivo e o North Star do produto.', 'Garantir persistencia local e navegacao segura entre as views.'],
      riskLevel: 'major' as const,
    },
    {
      id: 'P2',
      title: 'Empacotar execucao e auditoria',
      goal: `Preparar handoffs e verificacoes alinhados a ${truncate(goal.desiredOutcome, 180)}.`,
      deliverable: 'Pacote de execucao e trilha de verificacao prontos para uso.',
      inputs: ['Plano aprovado', 'Contexto do workspace', 'Runtime validado'],
      outputs: ['Phases artifact', 'Execution packet', 'Verification report'],
      tasks: ['Quebrar a entrega em fases com evidencias claras.', 'Preparar verificacao final com base em evidencias de implementacao.'],
      riskLevel: 'minor' as const,
    },
  ]
}

function coercePhasePayload(goal: GoalInput, plan: PlanArtifact, value: unknown): unknown {
  const record = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  const fallbackPhases = fallbackPhaseBreakdown(goal, plan)
  const rawPhases = Array.isArray(record.phases) ? record.phases : []

  const phases = (rawPhases.length > 0 ? rawPhases : fallbackPhases)
    .slice(0, 6)
    .map((phase, index) => {
      const fallback = fallbackPhases[index] ?? fallbackPhases[fallbackPhases.length - 1]
      const source = typeof phase === 'object' && phase !== null ? (phase as Record<string, unknown>) : {}
      const riskLevel = source.riskLevel

      return {
        id: enforceText(source.id, fallback.id, 2, 24),
        title: enforceText(source.title, fallback.title, 3, 120),
        goal: enforceText(source.goal, fallback.goal, 15, 240),
        deliverable: enforceText(source.deliverable, fallback.deliverable, 10, 240),
        inputs: enforceList(source.inputs, fallback.inputs, 1, 5, 180),
        outputs: enforceList(source.outputs, fallback.outputs, 1, 5, 180),
        tasks: enforceList(source.tasks, fallback.tasks, 2, 6, 220),
        riskLevel:
          riskLevel === 'critical' || riskLevel === 'major' || riskLevel === 'minor' || riskLevel === 'outdated'
            ? riskLevel
            : fallback.riskLevel,
      }
    })

  while (phases.length < 2) {
    const fallback = fallbackPhases[phases.length] ?? fallbackPhases[0]
    phases.push(fallback)
  }

  return {
    sequencingLogic: enforceText(
      record.sequencingLogic,
      `Organizar a entrega em fases para proteger o escopo de ${plan.title} e manter evidencias visiveis a cada etapa.`,
      30,
      1200,
    ),
    crossPhaseRisks: enforceList(
      record.crossPhaseRisks,
      ['Mudancas de escopo entre fases.', 'Dependencia excessiva de uma unica resposta do modelo.'],
      2,
      6,
      220,
    ),
    phases,
  }
}

function fallbackExecutionSteps(plan: PlanArtifact, phases: PhaseArtifact | null) {
  return [
    {
      label: 'Validar entrada',
      action: `Conferir se ${plan.title} esta coerente com o objetivo antes da execucao.`,
      expectedEvidence: 'Plano revisado, objetivo claro e restricoes confirmadas.',
      riskNote: 'Evitar iniciar a execucao com escopo ambiguo ou desatualizado.',
    },
    {
      label: 'Consolidar fases',
      action: phases ? 'Verificar se a decomposicao em fases cobre dependencias e entregaveis principais.' : 'Gerar ou revisar as fases antes do handoff.',
      expectedEvidence: 'Fases com deliverables, tarefas e riscos explicitos.',
      riskNote: 'Reduzir lacunas entre o plano e a ordem real de implementacao.',
    },
    {
      label: 'Montar handoff',
      action: 'Preparar prompts operacionais para agentes de execucao com criterio de evidencia.',
      expectedEvidence: 'Pacotes para Codex, Claude Code e Gemini prontos para copiar.',
      riskNote: 'Evitar handoffs vagos ou sem criterio de aceite observavel.',
    },
    {
      label: 'Preparar verificacao',
      action: 'Definir quais evidencias serao cobradas na auditoria final do trabalho.',
      expectedEvidence: 'Checklist de evidencias e guardrails de escopo registrados.',
      riskNote: 'Nao aprovar a entrega sem prova suficiente do comportamento esperado.',
    },
  ]
}

function fallbackHandoffPackets(plan: PlanArtifact) {
  return {
    codex: `Implemente o escopo descrito em "${plan.title}" seguindo o plano, respeitando guardrails e devolvendo evidencias verificaveis no final.`,
    claude: `Execute o trabalho com base em "${plan.title}", preservando o escopo, documentando riscos e reportando evidencias objetivas de conclusao.`,
    gemini: `Use "${plan.title}" como contrato operacional, mantenha rastreabilidade das decisoes e produza uma saida verificavel contra o plano original.`,
  }
}

function coerceExecutionPayload(goal: GoalInput, plan: PlanArtifact, phases: PhaseArtifact | null, value: unknown): unknown {
  const record = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  const fallbackSteps = fallbackExecutionSteps(plan, phases)
  const rawSteps = Array.isArray(record.executionSteps) ? record.executionSteps : []

  const executionSteps = (rawSteps.length > 0 ? rawSteps : fallbackSteps)
    .slice(0, 8)
    .map((step, index) => {
      const fallback = fallbackSteps[index] ?? fallbackSteps[fallbackSteps.length - 1]
      const source = typeof step === 'object' && step !== null ? (step as Record<string, unknown>) : {}

      return {
        label: enforceText(source.label, fallback.label, 3, 120),
        action: enforceText(source.action, fallback.action, 10, 260),
        expectedEvidence: enforceText(source.expectedEvidence, fallback.expectedEvidence, 10, 220),
        riskNote: enforceText(source.riskNote, fallback.riskNote, 10, 220),
      }
    })

  while (executionSteps.length < 4) {
    const fallback = fallbackSteps[executionSteps.length] ?? fallbackSteps[0]
    executionSteps.push(fallback)
  }

  const fallbackPackets = fallbackHandoffPackets(plan)
  const sourcePackets =
    typeof record.handoffPackets === 'object' && record.handoffPackets !== null ? (record.handoffPackets as Record<string, unknown>) : {}

  return {
    executionSummary: enforceText(
      record.executionSummary,
      `Empacotar a execucao de ${plan.title} com checklist, passos, evidencias e handoffs reutilizaveis.`,
      30,
      1200,
    ),
    operatorChecklist: enforceList(
      record.operatorChecklist,
      [
        'Confirmar objetivo, restricoes e criterios de aceite.',
        'Validar runtime e disponibilidade do modelo.',
        'Gerar artefatos na ordem plan -> phases -> execution -> verification.',
        'Registrar evidencias antes de aprovar a entrega.',
      ],
      4,
      8,
      220,
    ),
    executionSteps,
    evidenceRequired: enforceList(
      record.evidenceRequired,
      ['Plano final aprovado', 'Fases consolidadas', 'Pacote de execucao pronto', 'Resumo de verificacao'],
      3,
      7,
      220,
    ),
    outOfScopeGuardrails: enforceList(
      record.outOfScopeGuardrails,
      [
        'Nao expor segredos no cliente.',
        'Nao desviar do escopo definido no plano.',
        `Nao comprometer o objetivo principal: ${truncate(goal.desiredOutcome, 180)}.`,
      ],
      3,
      7,
      220,
    ),
    handoffPackets: {
      codex: enforceText(sourcePackets.codex, fallbackPackets.codex, 40, 6000),
      claude: enforceText(sourcePackets.claude, fallbackPackets.claude, 40, 6000),
      gemini: enforceText(sourcePackets.gemini, fallbackPackets.gemini, 40, 6000),
    },
  }
}

function coerceVerificationPayload(plan: PlanArtifact, value: unknown): unknown {
  const record = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  const rawFindings = Array.isArray(record.findings) ? record.findings : []

  const findings = rawFindings.slice(0, 8).map((finding) => {
    const source = typeof finding === 'object' && finding !== null ? (finding as Record<string, unknown>) : {}
    const severity = source.severity

    return {
      severity: severity === 'critical' || severity === 'major' || severity === 'minor' || severity === 'outdated' ? severity : 'major',
      title: enforceText(source.title, 'Ponto a revisar antes da aprovacao', 2, 120),
      description: enforceText(source.description, `Revisar aderencia da entrega ao plano ${plan.title}.`, 10, 320),
      recommendedFix: enforceText(source.recommendedFix, 'Executar ajuste focado e rodar uma nova verificacao.', 10, 280),
    }
  })

  return {
    decision: record.decision === 'approve' || record.decision === 'rework' || record.decision === 'block' ? record.decision : 'rework',
    summary: enforceText(
      record.summary,
      `Comparar a entrega com ${plan.title} e decidir se ja existe evidencia suficiente para aprovacao.`,
      20,
      1000,
    ),
    passes: enforceList(record.passes, ['Plano, fases e pacote de execucao foram gerados e registrados.'], 0, 8, 220),
    gaps: enforceList(record.gaps, ['Ainda e preciso revisar a evidencia concreta da implementacao final.'], 0, 8, 220),
    findings,
    nextMove: enforceText(record.nextMove, 'Corrigir os gaps restantes e executar uma nova rodada de verificacao.', 10, 220),
  }
}

function artifactMarkdown(title: string, sections: Array<{ title: string; bullets?: string[]; body?: string }>): string {
  const content = sections
    .map((section) => {
      const parts = [`## ${section.title}`]
      if (section.body) {
        parts.push(section.body)
      }
      if (section.bullets?.length) {
        parts.push(joinBullets(section.bullets))
      }
      return parts.join('\n\n')
    })
    .join('\n\n')

  return `# ${title}\n\n${content}`
}

export async function generatePlan(goal: GoalInput, runtime: RuntimeConnection): Promise<PlanArtifact> {
  const payload = await runStructuredPrompt(runtime, planPayloadSchema, buildPlanPrompts(goal), {
    maxTokens: 1_400,
    coerce: (value) => coercePlanPayload(goal, value),
  })
  const timestamp = nowIso()
  return planArtifactSchema.parse({
    id: createId('plan'),
    type: 'plan',
    title: payload.title,
    status: 'ready',
    createdAt: timestamp,
    updatedAt: timestamp,
    markdown: artifactMarkdown(payload.title, [
      { title: 'Resumo Executivo', body: payload.executiveSummary },
      { title: 'North Star', body: payload.productNorthStar },
      { title: 'Sinais de Contexto', bullets: payload.contextSignals },
      { title: 'Fronteiras de Escopo', bullets: payload.scopeBoundaries },
      {
        title: 'Fluxos de Trabalho',
        body: payload.workstreams
          .map(
            (stream) =>
              `### ${stream.name}\n${stream.goal}\n\nSuperficies:\n${joinBullets(stream.surfaces)}\n\nEntregaveis:\n${joinBullets(
                stream.deliverables,
              )}\n\nAcceptance checks:\n${joinBullets(stream.acceptanceChecks)}`,
          )
          .join('\n\n'),
      },
      {
        title: 'Riscos',
        body: payload.risks.map((risk) => `### ${risk.severity.toUpperCase()} - ${risk.title}\n${risk.mitigation}`).join('\n\n'),
      },
      { title: 'Approval Gates', bullets: payload.approvalGates },
      { title: 'Primeiro Movimento', body: payload.firstMove },
    ]),
    payload,
  })
}

export async function generatePhases(goal: GoalInput, plan: PlanArtifact, runtime: RuntimeConnection): Promise<PhaseArtifact> {
  const payload = await runStructuredPrompt(runtime, phasePayloadSchema, buildPhasePrompts(goal, plan), {
    maxTokens: 1_300,
    coerce: (value) => coercePhasePayload(goal, plan, value),
  })
  const timestamp = nowIso()
  return phaseArtifactSchema.parse({
    id: createId('phases'),
    type: 'phases',
    title: `Fases - ${plan.title}`,
    status: 'ready',
    createdAt: timestamp,
    updatedAt: timestamp,
    markdown: artifactMarkdown(`Fases - ${plan.title}`, [
      { title: 'Logica de Sequenciamento', body: payload.sequencingLogic },
      { title: 'Riscos Cross-Phase', bullets: payload.crossPhaseRisks },
      {
        title: 'Breakdown',
        body: payload.phases
          .map(
            (phase) =>
              `### ${phase.id} - ${phase.title}\n${phase.goal}\n\nDeliverable: ${phase.deliverable}\n\nInputs:\n${joinBullets(
                phase.inputs,
              )}\n\nOutputs:\n${joinBullets(phase.outputs)}\n\nTasks:\n${joinBullets(phase.tasks)}\n\nRisco: ${phase.riskLevel.toUpperCase()}`,
          )
          .join('\n\n'),
      },
    ]),
    payload,
  })
}

export async function generateExecution(
  goal: GoalInput,
  plan: PlanArtifact,
  phases: PhaseArtifact | null,
  runtime: RuntimeConnection,
): Promise<ExecutionArtifact> {
  const payload = await runStructuredPrompt(runtime, executionPayloadSchema, buildExecutionPrompts(goal, plan, phases), {
    maxTokens: 1_800,
    coerce: (value) => coerceExecutionPayload(goal, plan, phases, value),
  })
  const timestamp = nowIso()
  return executionArtifactSchema.parse({
    id: createId('exec'),
    type: 'execution',
    title: `Pacote de Execucao - ${plan.title}`,
    status: 'ready',
    createdAt: timestamp,
    updatedAt: timestamp,
    markdown: artifactMarkdown(`Pacote de Execucao - ${plan.title}`, [
      { title: 'Resumo', body: payload.executionSummary },
      { title: 'Checklist do Operador', bullets: payload.operatorChecklist },
      {
        title: 'Passos',
        body: payload.executionSteps
          .map(
            (step) =>
              `### ${step.label}\nAcao: ${step.action}\n\nEvidencia esperada: ${step.expectedEvidence}\n\nRisco: ${step.riskNote}`,
          )
          .join('\n\n'),
      },
      { title: 'Evidencias Obrigatorias', bullets: payload.evidenceRequired },
      { title: 'Guardrails de Escopo', bullets: payload.outOfScopeGuardrails },
      {
        title: 'Handoff Packets',
        body: `### Codex\n${payload.handoffPackets.codex}\n\n### Claude Code\n${payload.handoffPackets.claude}\n\n### Gemini\n${payload.handoffPackets.gemini}`,
      },
    ]),
    payload,
  })
}

export async function generateVerification(
  goal: GoalInput,
  plan: PlanArtifact,
  execution: ExecutionArtifact,
  implementationEvidence: string,
  runtime: RuntimeConnection,
): Promise<VerificationArtifact> {
  const payload = await runStructuredPrompt(
    runtime,
    verificationPayloadSchema,
    buildVerificationPrompts(goal, plan, execution, implementationEvidence),
    {
      maxTokens: 1_300,
      coerce: (value) => coerceVerificationPayload(plan, value),
    },
  )
  const timestamp = nowIso()
  return verificationArtifactSchema.parse({
    id: createId('verify'),
    type: 'verification',
    title: `Verificacao - ${plan.title}`,
    status: payload.decision === 'approve' ? 'verified' : 'ready',
    createdAt: timestamp,
    updatedAt: timestamp,
    markdown: artifactMarkdown(`Verificacao - ${plan.title}`, [
      { title: 'Decisao', body: `${payload.decision.toUpperCase()} - ${payload.summary}` },
      { title: 'Pontos aprovados', bullets: payload.passes },
      { title: 'Lacunas', bullets: payload.gaps },
      {
        title: 'Findings',
        body: payload.findings
          .map(
            (finding) =>
              `### ${finding.severity.toUpperCase()} - ${finding.title}\n${finding.description}\n\nCorrecao sugerida: ${finding.recommendedFix}`,
          )
          .join('\n\n'),
      },
      { title: 'Proximo Movimento', body: payload.nextMove },
    ]),
    payload,
  })
}
