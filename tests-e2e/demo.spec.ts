import { expect, test } from '@playwright/test'

test('carrega o shell do AI Tracer em modo demo', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: /Mission control spec-driven/i })).toBeVisible()
  await expect(page.getByText(/Zero prompt drift/i)).toBeVisible()

  await page.getByRole('button', { name: /Abrir Goal Studio/i }).click()
  await expect(page.getByLabel('Objetivo central')).toBeVisible()
  await expect(page.getByLabel('Resultado desejado')).toBeVisible()
})
