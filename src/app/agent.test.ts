import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDemoWorkspace } from './demo'
import { executeAgentTurn, processAgentTurn, runAgentTurn } from './agent'
import type { AgentTurnPayload } from './schemas'
import type { RuntimeConnection } from './types'

const runtime: RuntimeConnection = {
  apiKey: 'test-key',
  model: 'minimax/minimax-m2.7',
  provider: 'openrouter',
}

describe('agent turn engine', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    sessionStorage.clear()
  })

  it('interpreta linguagem natural e sugere plan quando o pedido e aberto e arquitetural', async () => {
    const workspace = createDemoWorkspace()

    const turn = await runAgentTurn(
      workspace,
      'Quero refazer este produto para que o agente entenda contexto livre, converse melhor e tome iniciativa sem parecer um formulario.',
      null,
    )

    expect(turn.reply.length).toBeGreaterThan(20)
    expect(turn.actions).toContain('plan')
    expect(turn.updates.objective.length).toBeGreaterThan(20)
  })

  it('executa plan e injeta resposta natural + artefato no thread', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: 'Plano Conversacional AI Tracer',
                  executiveSummary: 'Transformar o chat em um agente que entende pedidos livres, atualiza memoria e escolhe a proxima acao com mais autonomia.',
                  productNorthStar: 'Conversa fluida com inteligencia operacional real.',
                  recommendedMode: 'phases',
                  contextSignals: ['UX roteirizada demais', 'Precisamos de agente real', 'Fluxo precisa ser natural'],
                  scopeBoundaries: ['Sem segredo no bundle', 'GitHub Pages', 'OpenRouter no navegador'],
                  workstreams: [
                    {
                      name: 'Motor de turno',
                      goal: 'Criar entendimento, memoria e decisao de acoes.',
                      surfaces: ['Chat principal', 'Memoria operacional', 'Acoes internas'],
                      deliverables: ['Agent turn engine', 'Resposta natural', 'Acoes encadeadas'],
                      acceptanceChecks: ['Conversa sem prefixos', 'Acoes coerentes'],
                    },
                    {
                      name: 'Experiencia de chat',
                      goal: 'Remover sensacao de formulario e tornar a conversa mais fluida.',
                      surfaces: ['Composer', 'Timeline', 'Inspector'],
                      deliverables: ['Input livre', 'Quick actions secundarias', 'Mensagens menos roteirizadas'],
                      acceptanceChecks: ['UX fluida', 'Agente mais natural'],
                    },
                  ],
                  risks: [
                    { severity: 'major', title: 'Agente ficar superficial', mitigation: 'Exigir entendimento estruturado antes da acao.' },
                    { severity: 'minor', title: 'Excesso de automacao sem contexto', mitigation: 'Perguntar apenas quando houver bloqueio real.' },
                  ],
                  approvalGates: ['Validar conversa livre', 'Provar artefatos coerentes'],
                  firstMove: 'Trocar o parser de prefixos por um motor de turno do agente.',
                }),
              },
            },
          ],
        }),
      }),
    )

    const workspace = createDemoWorkspace()
    const turn: AgentTurnPayload = {
      reply: 'Entendi o problema. Vou reposicionar o chat como um agente que interpreta a conversa e decide o proximo passo sozinho.',
      understanding: 'O produto parece roteirizado e precisa de mais inteligencia conversacional.',
      updates: {
        objective: 'Refazer a experiencia do AI Tracer para um agente mais natural e inteligente.',
        desiredOutcome: 'Uma conversa fluida, com memoria operacional e decisoes mais autonomas.',
        constraintsToAdd: ['Sem voltar para uma UX de formulario'],
        acceptanceCriteriaToAdd: ['O agente responde de forma natural e operacional'],
        contextToAdd: ['O usuario rejeitou mensagens pre-configuradas.'],
        evidenceToAdd: [],
      },
      actions: ['plan'],
      focusView: 'plan',
      needsClarification: false,
      clarificationQuestion: '',
    }

    const resolution = await executeAgentTurn(workspace, turn, runtime)

    expect(resolution.workspace.goal.objective).toContain('agente mais natural')
    expect(resolution.workspace.artifacts.plan?.title).toBe('Plano Conversacional AI Tracer')
    expect(resolution.workspace.conversation.at(-2)?.kind).toBe('text')
    expect(resolution.workspace.conversation.at(-1)?.artifactType).toBe('plan')
    expect(resolution.finalView).toBe('plan')
  })

  it('persiste memoria longa local entre turnos em modo demo', async () => {
    const workspace = createDemoWorkspace()

    const firstTurn = await processAgentTurn(
      workspace,
      'Quero que voce lembre que a prioridade do produto e parecer um agente real, sem respostas roteirizadas.',
      null,
    )

    const secondTurn = await processAgentTurn(
      firstTurn.workspace,
      'Qual e a prioridade principal que eu defini para este produto?',
      null,
    )

    expect(firstTurn.workspace.memory.totalEntries).toBeGreaterThan(0)
    expect(secondTurn.workspace.memory.totalEntries).toBeGreaterThanOrEqual(firstTurn.workspace.memory.totalEntries)
    expect(secondTurn.workspace.memory.retrieved.length).toBeGreaterThan(0)
  })
})
