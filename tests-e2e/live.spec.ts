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

    await page.goto('/#goal')

    await page.getByLabel('Chave OpenRouter').fill(apiKey ?? '')
    await page.getByLabel('Modelo default').fill(model)
    await page.getByRole('button', { name: /conectar runtime|revalidar runtime/i }).click()
    await expect(page.getByText(/Runtime conectado/i)).toBeVisible({ timeout: 45_000 })

    await page.getByLabel('Objetivo central').fill('Planejar um produto AI Tracer robusto, seguro, leve e pronto para GitHub Pages.')
    await page.getByLabel('Resultado desejado').fill('Gerar um plano spec-driven utilizavel e auditavel.')
    await page.getByLabel('Restricoes').fill('Sem segredos no bundle\nUI dark mode premium\nPersistencia local')
    await page.getByLabel('Criterios de aceite').fill('Plano coerente\nFases rastreaveis\nVerificacao auditavel')

    await page.locator('button.nav-item').filter({ hasText: 'Plan' }).click()
    await page.getByRole('button', { name: /gerar plano/i }).click()

    await expect(page.getByText(/Artifact ready/i)).toBeVisible({ timeout: 180_000 })
    await expect(page.getByText(/Plano gerado\./i)).toBeVisible()

    await page.locator('button.nav-item').filter({ hasText: 'Phases' }).click()
    await page.getByRole('button', { name: /gerar fases/i }).click()

    await expect(page.getByText(/Sequencing logic/i)).toBeVisible({ timeout: 180_000 })
    await expect(page.getByText(/Fases geradas\./i)).toBeVisible()

    await page.locator('button.nav-item').filter({ hasText: 'Execute' }).click()
    await page.getByRole('button', { name: /gerar execucao/i }).click()

    await expect(page.getByText(/Execution summary/i)).toBeVisible({ timeout: 180_000 })
    await expect(page.getByText(/Pacote de execucao gerado\./i)).toBeVisible()

    await page.locator('button.nav-item').filter({ hasText: 'Verify' }).click()
    await page.getByLabel('Evidencia de implementacao').fill(
      'Implementacao simulada: fluxo plan -> phases -> execution persistido localmente, runtime validado via OpenRouter, exportacao disponivel e verificacao auditavel pronta para uso.',
    )
    await page.getByRole('button', { name: /rodar verificacao/i }).click()

    await expect(page.getByText(/Decision/i)).toBeVisible({ timeout: 180_000 })
    await expect(page.getByText(/Verificacao concluida\./i)).toBeVisible()
  })
})
