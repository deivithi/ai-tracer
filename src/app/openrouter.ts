import { z, type ZodType } from 'zod'
import type { RuntimeConnection } from './types'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const REQUEST_TIMEOUT_MS = 60_000

const openRouterResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.union([z.string(), z.array(z.unknown()), z.null()]).optional(),
        refusal: z.string().nullable().optional(),
        reasoning: z.string().nullable().optional(),
      }),
    }),
  ).min(1),
})

function normalizeContent(content: string | unknown[] | null | undefined): string {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }

        if (typeof item === 'object' && item && 'text' in item) {
          return String((item as { text?: unknown }).text ?? '')
        }

        return ''
      })
      .join('')
  }

  return ''
}

function extractJsonCandidate(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed
  }

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1)
  }

  throw new Error('A resposta do modelo nao retornou um objeto JSON valido.')
}

function summarizeSchemaError(error: z.ZodError): string {
  return JSON.stringify(
    error.issues.slice(0, 8).map((issue) => ({
      path: issue.path,
      message: issue.message,
      code: issue.code,
    })),
  )
}

function parseStructuredContent<T>(raw: string, schema: ZodType<T>, coerce?: (value: unknown) => unknown): T {
  const json = JSON.parse(extractJsonCandidate(raw)) as unknown
  const parsed = schema.safeParse(coerce ? coerce(json) : json)

  if (!parsed.success) {
    throw new Error(`Schema mismatch: ${summarizeSchemaError(parsed.error)}`)
  }

  return parsed.data
}

function parseApiError(status: number, body: unknown): string {
  const payload = typeof body === 'object' && body !== null ? body : {}
  const message =
    'error' in payload && typeof payload.error === 'object' && payload.error !== null && 'message' in payload.error
      ? String(payload.error.message)
      : 'Falha ao falar com o OpenRouter.'

  if (status === 401) {
    return 'Chave invalida ou sem permissao para o OpenRouter.'
  }

  if (status === 429) {
    return 'Limite de requisicoes atingido no OpenRouter. Tente novamente em instantes.'
  }

  return message
}

async function request(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  runtime: RuntimeConnection,
  options?: { maxTokens?: number; jsonMode?: boolean; temperature?: number },
) {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let response: Response

  try {
    response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${runtime.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-OpenRouter-Title': 'AI Tracer',
      },
      body: JSON.stringify({
        model: runtime.model,
        messages,
        temperature: options?.temperature ?? 0.2,
        max_tokens: options?.maxTokens ?? 900,
        ...(options?.jsonMode === false ? {} : { response_format: { type: 'json_object' } }),
        provider: {
          require_parameters: true,
          sort: 'throughput',
          data_collection: 'deny',
        },
      }),
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('O OpenRouter demorou mais do que o limite de 60 segundos para responder.')
    }

    throw error
  } finally {
    window.clearTimeout(timeoutId)
  }

  const json = (await response.json().catch(() => ({}))) as unknown
  if (!response.ok) {
    throw new Error(parseApiError(response.status, json))
  }

  return openRouterResponseSchema.parse(json)
}

export async function validateConnection(runtime: RuntimeConnection): Promise<void> {
  let lastError: Error | null = null
  let attemptsRemaining = 2

  while (attemptsRemaining > 0) {
    attemptsRemaining -= 1
    try {
      const response = await request(
        [
          { role: 'system', content: 'Responda sempre com um objeto JSON simples.' },
          { role: 'user', content: 'Retorne {"status":"ready","provider":"openrouter"}' },
        ],
        runtime,
        { maxTokens: 64, jsonMode: true },
      )

      const content = normalizeContent(response.choices[0]?.message.content)
      if (!content.trim()) {
        throw new Error('O modelo respondeu sem conteudo estruturado.')
      }

      const parsed = JSON.parse(extractJsonCandidate(content)) as { status?: string }
      if (parsed.status !== 'ready') {
        throw new Error('O modelo respondeu, mas a validacao do runtime nao retornou o estado esperado.')
      }

      return
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Falha desconhecida ao validar o runtime.')
    }
  }

  throw lastError ?? new Error('Nao foi possivel validar o runtime com o OpenRouter.')
}

export async function runStructuredPrompt<T>(
  runtime: RuntimeConnection,
  schema: ZodType<T>,
  prompts: { system: string; user: string },
  options?: { maxTokens?: number; coerce?: (value: unknown) => unknown },
): Promise<T> {
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: prompts.system },
    { role: 'user', content: prompts.user },
  ]

  const response = await request(messages, runtime, { maxTokens: options?.maxTokens })
  const raw = normalizeContent(response.choices[0]?.message.content)

  try {
    return parseStructuredContent(raw, schema, options?.coerce)
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Resposta invalida do modelo.'
    const repairResponse = await request(
      [
        ...messages,
        { role: 'assistant', content: raw },
        {
          role: 'user',
          content: `Sua resposta anterior nao atendeu o schema exigido. Corrija e retorne o objeto JSON completo novamente, sem markdown e sem comentarios.

Erros encontrados:
${details}`,
        },
      ],
      runtime,
      { maxTokens: options?.maxTokens ?? 1_400 },
    )

    const repairedRaw = normalizeContent(repairResponse.choices[0]?.message.content)

    try {
      return parseStructuredContent(repairedRaw, schema, options?.coerce)
    } catch (repairError) {
      const repairDetails = repairError instanceof Error ? repairError.message : 'Resposta invalida do modelo.'
      throw new Error(`Falha ao validar a resposta estruturada do modelo: ${repairDetails}`)
    }
  }
}

export async function runTextPrompt(
  runtime: RuntimeConnection,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options?: { maxTokens?: number; temperature?: number },
): Promise<string> {
  const response = await request(messages, runtime, {
    maxTokens: options?.maxTokens ?? 700,
    jsonMode: false,
    temperature: options?.temperature ?? 0.4,
  })

  const raw = normalizeContent(response.choices[0]?.message.content).trim()
  if (!raw) {
    throw new Error('O modelo respondeu sem texto para a mensagem conversacional.')
  }

  return raw
}
