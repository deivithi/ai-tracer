import { z } from 'zod'

const boundedText = (min: number, max: number) => z.string().trim().min(min).max(max)

export const artifactTypeSchema = z.enum(['plan', 'phases', 'execution', 'verification'])
export const severitySchema = z.enum(['critical', 'major', 'minor', 'outdated'])
export const runStageSchema = z.enum(['agent', 'connect', 'plan', 'phases', 'execution', 'verification', 'export'])
export const viewIdSchema = z.enum(['mission', 'goal', 'plan', 'phases', 'execution', 'verification', 'workspace'])
export const agentActionSchema = z.enum(['plan', 'phases', 'execution', 'verification', 'reset'])

export const attachmentSchema = z.object({
  id: boundedText(4, 80),
  name: boundedText(1, 140),
  kind: z.enum(['text', 'markdown', 'json', 'code']),
  content: z.string().max(150_000),
  size: z.number().int().nonnegative(),
})

export const chatMessageSchema = z.object({
  id: boundedText(4, 80),
  role: z.enum(['agent', 'user', 'system']),
  kind: z.enum(['text', 'artifact', 'status']),
  text: z.string().max(8_000),
  createdAt: boundedText(10, 40),
  artifactType: artifactTypeSchema.optional(),
  stage: runStageSchema.optional(),
})

export const goalInputSchema = z.object({
  objective: boundedText(10, 4_000),
  desiredOutcome: boundedText(10, 2_000),
  constraints: z.array(boundedText(1, 280)).max(12),
  acceptanceCriteria: z.array(boundedText(1, 280)).max(12),
  contextNotes: z.string().max(6_000).default(''),
  attachments: z.array(attachmentSchema).max(6),
})

export const agentTurnPayloadSchema = z.object({
  reply: boundedText(8, 2_400),
  understanding: z.string().trim().max(400).default(''),
  updates: z.object({
    objective: z.string().trim().max(4_000).default(''),
    desiredOutcome: z.string().trim().max(2_000).default(''),
    constraintsToAdd: z.array(boundedText(1, 280)).max(6).default([]),
    acceptanceCriteriaToAdd: z.array(boundedText(1, 280)).max(6).default([]),
    contextToAdd: z.array(boundedText(1, 600)).max(6).default([]),
    evidenceToAdd: z.array(boundedText(1, 600)).max(6).default([]),
  }),
  actions: z.array(agentActionSchema).max(4).default([]),
  focusView: viewIdSchema.default('mission'),
  needsClarification: z.boolean().default(false),
  clarificationQuestion: z.string().trim().max(400).default(''),
})

export const planPayloadSchema = z.object({
  title: boundedText(3, 140),
  executiveSummary: boundedText(40, 1_400),
  productNorthStar: boundedText(20, 280),
  recommendedMode: z.enum(['plan', 'phases', 'epic']),
  contextSignals: z.array(boundedText(1, 220)).min(3).max(8),
  scopeBoundaries: z.array(boundedText(1, 220)).min(3).max(8),
  workstreams: z
    .array(
      z.object({
        name: boundedText(2, 120),
        goal: boundedText(20, 320),
        surfaces: z.array(boundedText(1, 180)).min(1).max(5),
        deliverables: z.array(boundedText(1, 220)).min(2).max(5),
        acceptanceChecks: z.array(boundedText(1, 220)).min(2).max(5),
      }),
    )
    .min(2)
    .max(5),
  risks: z
    .array(
      z.object({
        severity: severitySchema,
        title: boundedText(2, 120),
        mitigation: boundedText(10, 220),
      }),
    )
    .min(2)
    .max(6),
  approvalGates: z.array(boundedText(1, 220)).min(2).max(6),
  firstMove: boundedText(10, 480),
})

export const phasePayloadSchema = z.object({
  sequencingLogic: boundedText(30, 1_200),
  crossPhaseRisks: z.array(boundedText(1, 220)).min(2).max(6),
  phases: z
    .array(
      z.object({
        id: boundedText(2, 24),
        title: boundedText(3, 120),
        goal: boundedText(15, 240),
        deliverable: boundedText(10, 240),
        inputs: z.array(boundedText(1, 180)).min(1).max(5),
        outputs: z.array(boundedText(1, 180)).min(1).max(5),
        tasks: z.array(boundedText(1, 220)).min(2).max(6),
        riskLevel: severitySchema,
      }),
    )
    .min(2)
    .max(6),
})

export const executionPayloadSchema = z.object({
  executionSummary: boundedText(30, 1_200),
  operatorChecklist: z.array(boundedText(1, 220)).min(4).max(8),
  executionSteps: z
    .array(
      z.object({
        label: boundedText(3, 120),
        action: boundedText(10, 260),
        expectedEvidence: boundedText(10, 220),
        riskNote: boundedText(10, 220),
      }),
    )
    .min(4)
    .max(8),
  evidenceRequired: z.array(boundedText(1, 220)).min(3).max(7),
  outOfScopeGuardrails: z.array(boundedText(1, 220)).min(3).max(7),
  handoffPackets: z.object({
    codex: boundedText(40, 6_000),
    claude: boundedText(40, 6_000),
    gemini: boundedText(40, 6_000),
  }),
})

export const verificationPayloadSchema = z.object({
  decision: z.enum(['approve', 'rework', 'block']),
  summary: boundedText(20, 1_000),
  passes: z.array(boundedText(1, 220)).max(8),
  gaps: z.array(boundedText(1, 220)).max(8),
  findings: z.array(
    z.object({
      severity: severitySchema,
      title: boundedText(2, 120),
      description: boundedText(10, 320),
      recommendedFix: boundedText(10, 280),
    }),
  ).max(8),
  nextMove: boundedText(10, 220),
})

export const artifactMetaSchema = z.object({
  id: boundedText(4, 80),
  type: artifactTypeSchema,
  title: boundedText(3, 140),
  status: z.enum(['draft', 'ready', 'verified']),
  createdAt: boundedText(10, 40),
  updatedAt: boundedText(10, 40),
  markdown: z.string().min(10).max(20_000),
})

export const planArtifactSchema = artifactMetaSchema.extend({
  type: z.literal('plan'),
  payload: planPayloadSchema,
})

export const phaseArtifactSchema = artifactMetaSchema.extend({
  type: z.literal('phases'),
  payload: phasePayloadSchema,
})

export const executionArtifactSchema = artifactMetaSchema.extend({
  type: z.literal('execution'),
  payload: executionPayloadSchema,
})

export const verificationArtifactSchema = artifactMetaSchema.extend({
  type: z.literal('verification'),
  payload: verificationPayloadSchema,
})

export const runRecordSchema = z.object({
  id: boundedText(4, 80),
  stage: runStageSchema,
  status: z.enum(['success', 'error']),
  startedAt: boundedText(10, 40),
  finishedAt: boundedText(10, 40),
  summary: boundedText(2, 280),
  detail: z.string().max(4_000).default(''),
})

export const workspaceSchema = z.object({
  id: boundedText(4, 80),
  name: boundedText(3, 140),
  mode: z.enum(['demo', 'live']),
  createdAt: boundedText(10, 40),
  updatedAt: boundedText(10, 40),
  conversation: z.array(chatMessageSchema).max(200).default([]),
  goal: goalInputSchema,
  verificationInput: z.string().max(8_000).default(''),
  artifacts: z.object({
    plan: planArtifactSchema.nullable(),
    phases: phaseArtifactSchema.nullable(),
    execution: executionArtifactSchema.nullable(),
    verification: verificationArtifactSchema.nullable(),
  }),
  runs: z.array(runRecordSchema).max(60),
})

export type AttachmentRecord = z.infer<typeof attachmentSchema>
export type ChatMessage = z.infer<typeof chatMessageSchema>
export type GoalInput = z.infer<typeof goalInputSchema>
export type AgentAction = z.infer<typeof agentActionSchema>
export type AgentTurnPayload = z.infer<typeof agentTurnPayloadSchema>
export type PlanPayload = z.infer<typeof planPayloadSchema>
export type PhasePayload = z.infer<typeof phasePayloadSchema>
export type ExecutionPayload = z.infer<typeof executionPayloadSchema>
export type VerificationPayload = z.infer<typeof verificationPayloadSchema>
export type PlanArtifact = z.infer<typeof planArtifactSchema>
export type PhaseArtifact = z.infer<typeof phaseArtifactSchema>
export type ExecutionArtifact = z.infer<typeof executionArtifactSchema>
export type VerificationArtifact = z.infer<typeof verificationArtifactSchema>
export type RunRecord = z.infer<typeof runRecordSchema>
export type TracerWorkspace = z.infer<typeof workspaceSchema>
