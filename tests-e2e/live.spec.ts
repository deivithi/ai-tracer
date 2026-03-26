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

    await page.getByLabel('Mensagem do agente').fill('Objetivo: Planejar um produto AI Tracer robusto, seguro, leve e pronto para GitHub Pages.')
    await page.getByRole('button', { name: /Enviar ao agente/i }).click()
    await page.getByLabel('Mensagem do agente').fill('Resultado: Gerar um plano spec-driven utilizavel e auditavel.')
    await page.getByRole('button', { name: /Enviar ao agente/i }).click()
    await page.getByLabel('Mensagem do agente').fill('Restricao: Sem segredos no bundle')
    await page.getByRole('button', { name: /Enviar ao agente/i }).click()
    await page.getByLabel('Mensagem do agente').fill('Restricao: UI dark mode premium')
    await page.getByRole('button', { name: /Enviar ao agente/i }).click()
    await page.getByLabel('Mensagem do agente').fill('Criterio: Plano coerente')
    await page.getByRole('button', { name: /Enviar ao agente/i }).click()
    await page.getByLabel('Mensagem do agente').fill('Criterio: Fases rastreaveis')
    await page.getByRole('button', { name: /Enviar ao agente/i }).click()

    await page.getByRole('button', { name: /Gerar plan/i }).click()

    await expect(page.getByText(/Plano pronto:/i)).toBeVisible({ timeout: 180_000 })

    await page.getByRole('button', { name: /Gerar phases/i }).click()

    await expect(page.getByText(/Phases prontas:/i)).toBeVisible({ timeout: 180_000 })

    await page.getByRole('button', { name: /Gerar execution/i }).click()

    await expect(page.getByText(/Execution packet pronto:/i)).toBeVisible({ timeout: 180_000 })

    await page.getByLabel('Mensagem do agente').fill(
      'Evidencia: Implementacao simulada com fluxo plan -> phases -> execution persistido localmente, runtime validado via OpenRouter, exportacao disponivel e verificacao auditavel pronta para uso.',
    )
    await page.getByRole('button', { name: /Enviar ao agente/i }).click()
    await page.getByRole('button', { name: /Rodar verification/i }).click()

    await expect(page.getByText(/Verification /i)).toBeVisible({ timeout: 180_000 })
  })
})
