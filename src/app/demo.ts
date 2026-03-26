import type { TracerWorkspace } from './schemas'
import { nowIso } from './utils'

export function createDemoWorkspace(): TracerWorkspace {
  const timestamp = nowIso()
  return {
    id: 'workspace-demo',
    name: 'AI Tracer Demo Workspace',
    mode: 'demo',
    createdAt: timestamp,
    updatedAt: timestamp,
    conversation: [
      {
        id: 'msg-demo-01',
        role: 'agent',
        kind: 'text',
        createdAt: timestamp,
        text: 'Sou o AI Tracer. Me diga naturalmente o que voce quer construir, corrigir, auditar ou organizar. Eu vou entender o contexto, atualizar a memoria e sugerir o proximo passo certo.',
      },
    ],
    goal: {
      objective: 'Construir uma plataforma spec-driven que transforme objetivos soltos em planos, fases, handoffs para agentes e verificacoes auditaveis.',
      desiredOutcome: 'Um produto leve, seguro e pronto para orientar execucao com IA sem depender de prompts soltos.',
      constraints: [
        'Interface dark mode tecnologica e premium',
        'Arquitetura compativel com GitHub Pages',
        'Segredos nao podem ser expostos no cliente publicado',
      ],
      acceptanceCriteria: [
        'Gerar plano, fases, pacote de execucao e verificacao',
        'Persistir runs localmente',
        'Permitir exportar todo o workspace em arquivos',
      ],
      contextNotes: 'Este workspace demo mostra o tipo de saida esperada antes da conexao com OpenRouter.',
      attachments: [],
    },
    verificationInput: 'Implementacao inicial com UI escura, cofre local da chave e pipeline goal -> plan -> execute -> verify.',
    artifacts: {
      plan: null,
      phases: null,
      execution: null,
      verification: null,
    },
    runs: [
      {
        id: 'run-demo-01',
        stage: 'plan',
        status: 'success',
        startedAt: timestamp,
        finishedAt: timestamp,
        summary: 'Workspace demo preparado para a primeira rodada live.',
        detail: 'Conecte sua chave do OpenRouter para substituir o demo por artefatos reais.',
      },
    ],
  }
}
