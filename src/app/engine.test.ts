import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateExecution, generatePlan } from './engine'
import type { GoalInput } from './schemas'
import type { RuntimeConnection } from './types'

const runtime: RuntimeConnection = {
  apiKey: 'test-key',
  model: 'minimax/minimax-m2.7',
  provider: 'openrouter',
}

const goal: GoalInput = {
  objective: 'Construir o AI Tracer do zero.',
  desiredOutcome: 'Produto funcional em GitHub Pages.',
  constraints: ['Sem segredo no frontend'],
  acceptanceCriteria: ['Gerar plano e verificacao'],
  contextNotes: 'Projeto novo.',
  attachments: [],
}

describe('engine', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('gera um artefato de plano valido a partir de JSON do modelo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: 'Plano AI Tracer',
                  executiveSummary: 'Resumo executivo com foco em produto, seguranca e verificabilidade.',
                  productNorthStar: 'Criar um control plane auditavel e elegante.',
                  recommendedMode: 'phases',
                  contextSignals: ['Projeto greenfield', 'GitHub Pages', 'BYOK em runtime'],
                  scopeBoundaries: ['Sem segredo no bundle', 'MVP de artefatos', 'Persistencia local'],
                  workstreams: [
                    {
                      name: 'Control plane',
                      goal: 'Estruturar artefatos essenciais do fluxo.',
                      surfaces: ['Goal Studio', 'Plan', 'Verify'],
                      deliverables: ['Contrato de plano', 'Pacote de execucao'],
                      acceptanceChecks: ['Plano coerente', 'Handoff acionavel'],
                    },
                    {
                      name: 'Experiencia visual',
                      goal: 'Elevar a leitura do produto com UI premium.',
                      surfaces: ['Hero', 'Sidebar', 'Workspace'],
                      deliverables: ['Design dark mode', 'Feed operacional'],
                      acceptanceChecks: ['Boa hierarquia', 'Responsivo'],
                    },
                  ],
                  risks: [
                    { severity: 'major', title: 'Segredo exposto', mitigation: 'Manter a chave apenas em sessao local.' },
                    { severity: 'minor', title: 'Drift entre artefatos', mitigation: 'Resetar dependencias ao regenerar.' },
                  ],
                  approvalGates: ['Validar modelo antes do primeiro run', 'Auditar findings antes do deploy'],
                  firstMove: 'Gerar o plano e estabilizar o contrato antes de montar as fases.',
                }),
              },
            },
          ],
        }),
      }),
    )

    const artifact = await generatePlan(
      goal,
      runtime,
    )

    expect(artifact.type).toBe('plan')
    expect(artifact.status).toBe('ready')
    expect(artifact.markdown).toContain('Plano AI Tracer')
    expect(artifact.payload.workstreams).toHaveLength(2)
  })

  it('preenche lacunas do plano quando o modelo omite campos operacionais', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: 'Plano parcial',
                  executiveSummary: 'Resumo executivo suficiente para o schema base funcionar com a camada de coercao do motor.',
                  productNorthStar: 'Control plane auditavel.',
                  recommendedMode: 'phases',
                  contextSignals: ['Greenfield', 'Deploy estatico', 'OpenRouter'],
                  scopeBoundaries: ['Sem backend', 'Persistencia local', 'GitHub Pages'],
                  workstreams: [
                    {
                      name: 'Fluxo central',
                      goal: 'Gerar artefatos principais.',
                      surfaces: ['Goal', 'Plan'],
                      deliverables: ['Plano inicial', 'Workspace persistido'],
                      acceptanceChecks: ['Plano pronto', 'Persistencia funcional'],
                    },
                  ],
                }),
              },
            },
          ],
        }),
      }),
    )

    const artifact = await generatePlan(goal, runtime)

    expect(artifact.payload.approvalGates.length).toBeGreaterThanOrEqual(2)
    expect(artifact.payload.firstMove.length).toBeGreaterThanOrEqual(10)
    expect(artifact.payload.risks.length).toBeGreaterThanOrEqual(2)
    expect(artifact.payload.workstreams.length).toBeGreaterThanOrEqual(2)
  })

  it('normaliza o pacote de execucao quando o modelo devolve passos quebrados', async () => {
    const fetchMock = vi.fn()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: 'Plano base',
                executiveSummary: 'Resumo executivo com foco em produto, seguranca e verificabilidade.',
                productNorthStar: 'Criar um control plane auditavel e elegante.',
                recommendedMode: 'phases',
                contextSignals: ['Projeto greenfield', 'GitHub Pages', 'BYOK em runtime'],
                scopeBoundaries: ['Sem segredo no bundle', 'MVP de artefatos', 'Persistencia local'],
                workstreams: [
                  {
                    name: 'Control plane',
                    goal: 'Estruturar artefatos essenciais do fluxo.',
                    surfaces: ['Goal Studio', 'Plan', 'Verify'],
                    deliverables: ['Contrato de plano', 'Pacote de execucao'],
                    acceptanceChecks: ['Plano coerente', 'Handoff acionavel'],
                  },
                  {
                    name: 'Experiencia visual',
                    goal: 'Elevar a leitura do produto com UI premium.',
                    surfaces: ['Hero', 'Sidebar', 'Workspace'],
                    deliverables: ['Design dark mode', 'Feed operacional'],
                    acceptanceChecks: ['Boa hierarquia', 'Responsivo'],
                  },
                ],
                risks: [
                  { severity: 'major', title: 'Segredo exposto', mitigation: 'Manter a chave apenas em sessao local.' },
                  { severity: 'minor', title: 'Drift entre artefatos', mitigation: 'Resetar dependencias ao regenerar.' },
                ],
                approvalGates: ['Validar modelo antes do primeiro run', 'Auditar findings antes do deploy'],
                firstMove: 'Gerar o plano e estabilizar o contrato antes de montar as fases.',
              }),
            },
          },
        ],
      }),
    })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                executionSummary: 'Resumo da execucao cobrindo checklist, passos e handoff operacional.',
                operatorChecklist: ['Validar objetivo', 'Checar runtime', 'Gerar artefatos', 'Auditar saida'],
                executionSteps: [
                  { label: 'A', action: 'Executar', expectedEvidence: 'OK', riskNote: '' },
                  { label: 'B', action: 'Executar novamente', expectedEvidence: 'OK', riskNote: 'baixo' },
                  { label: 'C', action: 'Mais uma acao', expectedEvidence: 'OK', riskNote: '' },
                  { label: 'D', action: 'Outra acao', expectedEvidence: 'OK', riskNote: '' },
                  { label: 'E', action: 'Outra acao', expectedEvidence: 'OK', riskNote: '' },
                  { label: 'F', action: 'Outra acao', expectedEvidence: 'OK', riskNote: '' },
                  { label: 'G', action: 'Outra acao', expectedEvidence: 'OK', riskNote: '' },
                  { label: 'H', action: 'Outra acao', expectedEvidence: 'OK', riskNote: '' },
                  { label: 'I', action: 'Outra acao', expectedEvidence: 'OK', riskNote: '' },
                ],
                evidenceRequired: ['Plano'],
                outOfScopeGuardrails: ['Sem segredo', 'Sem drift', 'Sem escopo extra'],
                handoffPackets: {
                  codex: 'Prompt curto demais',
                  claude: 'Prompt curto demais',
                  gemini: 'Prompt curto demais',
                },
              }),
            },
          },
        ],
      }),
    })

    vi.stubGlobal(
      'fetch',
      fetchMock,
    )

    const plan = await generatePlan(goal, runtime)
    const artifact = await generateExecution(goal, plan, null, runtime)

    expect(artifact.payload.executionSteps.length).toBeLessThanOrEqual(8)
    expect(artifact.payload.executionSteps.every((step) => step.riskNote.length >= 10)).toBe(true)
    expect(artifact.payload.operatorChecklist.length).toBeGreaterThanOrEqual(4)
    expect(artifact.payload.handoffPackets.codex.length).toBeGreaterThanOrEqual(40)
  })
})
