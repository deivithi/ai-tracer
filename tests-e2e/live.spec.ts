import { expect, test } from '@playwright/test'

const apiKey = process.env.OPENROUTER_API_KEY
const model = process.env.OPENROUTER_MODEL || 'minimax/minimax-m2.7'

test.describe('live flow', () => {
  test.skip(!apiKey, 'OPENROUTER_API_KEY nao configurada para o smoke live.')

  test('executa o fluxo live de ponta a ponta', async ({ page }) => {
    test.setTimeout(600_000)

    await page.addInitScript(() => {
      localStorage.clear()
      sessionStorage.clear()
    })

    await page.goto('/')

    await page.getByLabel('Chave OpenRouter').fill(apiKey ?? '')
    await page.getByLabel('Modelo default').fill(model)
    await page.getByRole('button', { name: /conectar runtime|revalidar runtime/i }).click()
    await expect(page.getByText('Runtime conectado', { exact: true })).toBeVisible({ timeout: 45_000 })

    await page.getByLabel('Mensagem do agente').fill(
      'Quero transformar o AI Tracer em um agente realmente inteligente, com conversa fluida, memoria operacional e menos mensagens roteirizadas.',
    )
    await page.getByRole('button', { name: /Enviar ao agente/i }).click()
    await expect(page.locator('.chat-thread .chat-agent.chat-text').last()).toContainText(/agente|memoria|fase|plano/i, { timeout: 90_000 })

    await page.getByLabel('Mensagem do agente').fill('O resultado desejado e um agente capaz de entender linguagem natural, agir com autonomia e manter a conversa coerente.')
    await page.getByRole('button', { name: /Enviar ao agente/i }).click()
    await page.getByLabel('Mensagem do agente').fill('Nao podemos expor segredos no bundle publicado.')
    await page.getByRole('button', { name: /Enviar ao agente/i }).click()
    await page.getByLabel('Mensagem do agente').fill('A interface precisa continuar dark mode premium e leve.')
    await page.getByRole('button', { name: /Enviar ao agente/i }).click()
    await page.getByLabel('Mensagem do agente').fill('O agente deve responder de forma natural e operacional.')
    await page.getByRole('button', { name: /Enviar ao agente/i }).click()
    await page.getByLabel('Mensagem do agente').fill('Tambem quero fases e verificacao rastreaveis.')
    await page.getByRole('button', { name: /Enviar ao agente/i }).click()

    await page.getByRole('button', { name: /Planejar/i }).click()

    await expect(page.locator('.chat-artifact-tag').filter({ hasText: 'Plan' }).last()).toBeVisible({ timeout: 180_000 })

    await page.getByRole('button', { name: /Fases/i }).click()

    await expect(page.locator('.chat-artifact-tag').filter({ hasText: 'Phases' }).last()).toBeVisible({ timeout: 180_000 })

    await page.getByRole('button', { name: /Execucao/i }).click()

    await expect(page.locator('.chat-artifact-tag').filter({ hasText: 'Execution' }).last()).toBeVisible({ timeout: 180_000 })

    await page.getByLabel('Mensagem do agente').fill(
      'Tenho a seguinte evidencia: implementacao simulada com memoria operacional, plano, fases, execution e runtime validado via OpenRouter.',
    )
    await page.getByRole('button', { name: /Enviar ao agente/i }).click()
    await page.getByRole('button', { name: /Verificar/i }).click()

    await expect(page.locator('.chat-artifact-tag').filter({ hasText: 'Verification' }).last()).toBeVisible({ timeout: 180_000 })
  })
})
