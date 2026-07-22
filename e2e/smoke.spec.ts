import { test, expect } from '@playwright/test'

test.describe('Smoke tests', () => {
  test('landing page carrega e mostra o CTA principal', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('link', { name: /criar meu cardápio grátis/i }).first()).toBeVisible()
  })

  test('link "Criar meu cardápio grátis" leva para /cadastro', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /criar meu cardápio grátis/i }).first().click()
    await expect(page).toHaveURL(/\/cadastro/)
  })

  test('página de login mostra o formulário', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByLabel(/e-mail/i)).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()
    await expect(page.getByRole('button', { name: /entrar/i })).toBeVisible()
  })

  test('página de cadastro mostra o passo 1 do formulário', async ({ page }) => {
    await page.goto('/cadastro')
    await expect(page.getByLabel(/seu nome/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /próximo passo/i })).toBeVisible()
  })

  test('cardápio público de uma loja inexistente mostra mensagem amigável', async ({ page }) => {
    await page.goto('/loja/loja-que-nao-existe-123456')
    await expect(page.getByText(/cardápio não encontrado/i)).toBeVisible()
  })

  test('rotas protegidas do painel redirecionam para /login sem sessão', async ({ page }) => {
    await page.goto('/painel')
    await expect(page).toHaveURL(/\/login/)
  })
})
