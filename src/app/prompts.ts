import type { ExecutionArtifact, GoalInput, PhaseArtifact, PlanArtifact } from './schemas'

function serializeGoal(goal: GoalInput): string {
  const attachmentSummary = goal.attachments.length
    ? goal.attachments
        .map((file) => `### ${file.name} (${file.kind})\n${file.content.slice(0, 3_500)}`)
        .join('\n\n')
    : 'Nenhum arquivo anexado.'

  return JSON.stringify(
    {
      objective: goal.objective,
      desiredOutcome: goal.desiredOutcome,
      constraints: goal.constraints,
      acceptanceCriteria: goal.acceptanceCriteria,
      contextNotes: goal.contextNotes,
      attachmentSummary,
    },
    null,
    2,
  )
}

function serializeArtifact(artifact: PlanArtifact | PhaseArtifact | ExecutionArtifact): string {
  return JSON.stringify(
    {
      title: artifact.title,
      status: artifact.status,
      payload: artifact.payload,
    },
    null,
    2,
  )
}

export function buildPlanPrompts(goal: GoalInput): { system: string; user: string } {
  return {
    system: `Voce e o AI Tracer, um control plane spec-driven.
Seu trabalho e transformar um objetivo humano em um plano operacional auditavel.
Regras obrigatorias:
- responda em portugues do Brasil;
- retorne JSON puro;
- preencha todos os campos obrigatorios do schema;
- seja concreto, sem floreio;
- priorize coerencia, seguranca, leveza e verificabilidade;
- pense como arquiteto de produto e operacao, nao como redator de marketing.`,
    user: `Gere um plano operacional com os campos:
{
  "title": string,
  "executiveSummary": string,
  "productNorthStar": string,
  "recommendedMode": "plan" | "phases" | "epic",
  "contextSignals": string[],
  "scopeBoundaries": string[],
  "workstreams": [
    {
      "name": string,
      "goal": string,
      "surfaces": string[],
      "deliverables": string[],
      "acceptanceChecks": string[]
    }
  ],
  "risks": [
    {
      "severity": "critical" | "major" | "minor" | "outdated",
      "title": string,
      "mitigation": string
    }
  ],
  "approvalGates": string[],
  "firstMove": string
}

Todos os campos do objeto sao obrigatorios.

Baseie-se neste objetivo/contexto:
${serializeGoal(goal)}`,
  }
}

export function buildPhasePrompts(goal: GoalInput, plan: PlanArtifact): { system: string; user: string } {
  return {
    system: `Voce e o motor de decomposicao do AI Tracer.
Retorne JSON puro e organize a execucao em fases com dependencia clara.
Cada fase deve produzir um deliverable visivel e verificavel.
Preencha todos os campos obrigatorios do schema.`,
    user: `Gere um phase breakdown com os campos:
{
  "sequencingLogic": string,
  "crossPhaseRisks": string[],
  "phases": [
    {
      "id": string,
      "title": string,
      "goal": string,
      "deliverable": string,
      "inputs": string[],
      "outputs": string[],
      "tasks": string[],
      "riskLevel": "critical" | "major" | "minor" | "outdated"
    }
  ]
}

Todos os campos do objeto sao obrigatorios.

Objetivo:
${serializeGoal(goal)}

Plano base:
${serializeArtifact(plan)}`,
  }
}

export function buildExecutionPrompts(
  goal: GoalInput,
  plan: PlanArtifact,
  phases: PhaseArtifact | null,
): { system: string; user: string } {
  return {
    system: `Voce e o AI Tracer preparando um pacote de execucao para agentes de codigo.
Retorne JSON puro.
O resultado deve ser operacional, com checklist, passos, evidencias e handoff prompts prontos para Codex, Claude Code e Gemini.
Preencha todos os campos obrigatorios do schema.`,
    user: `Gere um pacote de execucao com os campos:
{
  "executionSummary": string,
  "operatorChecklist": string[],
  "executionSteps": [
    {
      "label": string,
      "action": string,
      "expectedEvidence": string,
      "riskNote": string
    }
  ],
  "evidenceRequired": string[],
  "outOfScopeGuardrails": string[],
  "handoffPackets": {
    "codex": string,
    "claude": string,
    "gemini": string
  }
}

Todos os campos do objeto sao obrigatorios.

Objetivo:
${serializeGoal(goal)}

Plano aprovado:
${serializeArtifact(plan)}

Fases:
${phases ? serializeArtifact(phases) : 'Nenhuma fase gerada ainda.'}`,
  }
}

export function buildVerificationPrompts(
  goal: GoalInput,
  plan: PlanArtifact,
  execution: ExecutionArtifact,
  implementationEvidence: string,
): { system: string; user: string } {
  return {
    system: `Voce e o verificador do AI Tracer.
Retorne JSON puro.
Compare a implementacao relatada com o plano original e classifique findings por severidade.
Decisao possivel: approve, rework ou block.
Preencha todos os campos obrigatorios do schema.`,
    user: `Gere um relatorio de verificacao com os campos:
{
  "decision": "approve" | "rework" | "block",
  "summary": string,
  "passes": string[],
  "gaps": string[],
  "findings": [
    {
      "severity": "critical" | "major" | "minor" | "outdated",
      "title": string,
      "description": string,
      "recommendedFix": string
    }
  ],
  "nextMove": string
}

Todos os campos do objeto sao obrigatorios.

Objetivo original:
${serializeGoal(goal)}

Plano:
${serializeArtifact(plan)}

Pacote de execucao:
${serializeArtifact(execution)}

Evidencia de implementacao para verificar:
${implementationEvidence.trim() || 'Nenhuma evidencia fornecida.'}`,
  }
}
