import { expect, test } from '@playwright/test'

test('carrega o shell do AI Tracer em modo demo', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: /Agent chat control plane/i })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Converse, construa e audite no mesmo fluxo./i })).toBeVisible()
  await expect(page.getByLabel('Mensagem do agente')).toBeVisible()

  await page.getByLabel('Mensagem do agente').fill('Quero que voce transforme este produto em um agente menos roteirizado, mais inteligente e mais fluido.')
  await page.getByRole('button', { name: /Enviar ao agente/i }).click()

  await expect(page.locator('.chat-thread .chat-agent.chat-text').last()).toContainText(/Entendi:|conecte o runtime|vou guardar esse contexto/i)
})
