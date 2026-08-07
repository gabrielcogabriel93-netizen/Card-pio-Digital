import { test, expect } from '@playwright/test'

test.describe('Smoke tests', () => {
  test('landing page carrega e mostra o CTA principal', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('link', { name: /testar 7 dias grátis/i }).first()).toBeVisible()
  })

  test('link "Testar 7 dias grátis" leva para /cadastro', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /testar 7 dias grátis/i }).first().click()
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

// Cobertura do PWA: manifest, service worker e fallback offline não
// dependem de dados do Supabase (diferente do fluxo de carrinho/checkout,
// que precisa de uma loja e produtos reais num projeto de teste — fora do
// alcance deste CI, que roda com credenciais placeholder de propósito).
test.describe('PWA', () => {
  test('manifest.json é servido com os ícones any + maskable', async ({ request }) => {
    const response = await request.get('/manifest.json')
    expect(response.ok()).toBeTruthy()
    const manifest = await response.json()
    expect(manifest.name).toBe('CatalogAI - Cardápio Digital')
    expect(manifest.icons.some((i: { purpose: string }) => i.purpose === 'any')).toBe(true)
    expect(manifest.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true)
  })

  test('service worker é servido em /sw.js', async ({ request }) => {
    const response = await request.get('/sw.js')
    expect(response.ok()).toBeTruthy()
    expect(response.headers()['content-type']).toContain('javascript')
  })

  test('página /offline (fallback do service worker) carrega e mostra CTA', async ({ page }) => {
    await page.goto('/offline')
    await expect(page.getByRole('heading', { name: /sem conexão/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /tentar novamente/i })).toBeVisible()
  })
})

// Headers de segurança (next.config.js) — cobre a regressão mais fácil de
// derrubar sem perceber: alguém mexe no headers() e esquece de validar.
test.describe('Headers de segurança', () => {
  test('página pública vem com CSP, X-Frame-Options e HSTS', async ({ request }) => {
    const response = await request.get('/')
    const headers = response.headers()
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['strict-transport-security']).toContain('max-age=')
  })

  test('rota de API não recebe o CSP global (evita header duplicado)', async ({ request }) => {
    const response = await request.get('/api/admin/overview')
    expect(response.headers()['content-security-policy']).toBeUndefined()
  })
})
