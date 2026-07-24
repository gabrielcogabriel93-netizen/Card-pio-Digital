# Cardápio SaaS

Plataforma multi-tenant de cardápio digital: cada lojista cria sua conta, monta o
cardápio (categorias, produtos e variações), recebe pedidos online com envio
automático para o WhatsApp, atende no balcão/PDV e acompanha o financeiro —
tudo em um único painel.

## Stack

- **Next.js 14** (App Router) + **TypeScript** + **Tailwind CSS**
- **Supabase** (Postgres + Auth + Row Level Security) como backend
- PWA instalável (manifest + service worker)

## Funcionalidades

- **Landing page** institucional
- **Cadastro/Login** com Supabase Auth (suporta confirmação de e-mail opcional)
- **Painel do lojista**
  - Dashboard com pedidos pendentes, faturamento do dia, ticket médio e alerta de estoque baixo
  - Produtos: CRUD completo + **variações** (tamanho, sabor, adicionais) com preço adicional, obrigatoriedade e múltipla escolha
  - Categorias: CRUD com reordenação
  - Pedidos: Kanban (pendente → confirmado → em preparo → concluído/cancelado, ou um fluxo simplificado pendente→concluído para quem não tem preparo), baixa e estorno automático de estoque, geração de lançamento financeiro na confirmação, notificação push de novo pedido
  - Balcão/PDV: venda presencial com busca de produtos, variações, controle de estoque e forma de pagamento
  - Bairros: taxa de entrega própria por bairro cadastrado
  - Financeiro: entradas automáticas (pedidos confirmados/vendas de balcão) + lançamentos manuais de entrada/saída, filtros por período
  - Configurações: dados da loja, horário de funcionamento, loja aberta/fechada, link público, cor do tema (aplicada de verdade no cardápio, com trava de contraste automática), tipo de negócio, entrega/retirada
  - Cupons: percentual, valor fixo ou frete grátis
  - Relatórios (`/painel/relatorios`): produtos mais vendidos, horário de pico e ticket médio por período
  - WhatsApp (`/painel/whatsapp`): conecta o número da loja via QR Code (WPPConnect, servidor separado) e liga notificações automáticas 1-para-1 de status de pedido pro cliente, além de mensagem manual pros aniversariantes do dia
  - Domínio próprio (em Configurações): a loja pode apontar um domínio dela pro cardápio público, além do link padrão
  - Planos: aviso de sistema gratuito + CTA de "planos pagos em breve" + doação via PIX
  - Tutorial: como cada funcionalidade do painel funciona
- **Onboarding** (`/onboarding`): quiz de 3 perguntas logo após o cadastro que já deixa o painel configurado pro tipo de negócio
- **Cardápio público** (`/loja/[slug]`): navegação por categoria, variações, carrinho persistente, entrega (com busca de CEP e bairro por lista) ou retirada, e envio do pedido pronto via WhatsApp com link de acompanhamento
- **Meus Pedidos** (`/loja/[slug]/pedidos`): cliente consulta o histórico de pedidos pelo telefone, sem cadastro
- **Recuperação de senha** (`/login` → `/redefinir-senha`)
- **SEO**: sitemap dinâmico (`/sitemap.xml`), `robots.txt` dinâmico e dados estruturados (JSON-LD) por loja
- **PWA**: instalável no celular do lojista e do cliente, com notificações push

## Configuração

### 1. Crie um projeto no Supabase

Em [supabase.com](https://supabase.com), crie um novo projeto e anote a **Project URL**, a **anon key** e a **service_role key** (Project Settings → API).

### 2. Rode as migrations

No SQL Editor do Supabase, execute os arquivos da pasta `migrations/` **em ordem**:

1. `001_initial_schema.sql` — tabelas, índices e políticas de RLS
2. `002_stock_functions.sql` — funções de baixa/estorno de estoque
3. `003_financial_entries_delete_policy.sql` — permite excluir lançamentos financeiros manuais
4. `004_storage_uploads.sql` — bucket `uploads` e políticas para upload de fotos de produto/logo direto do dispositivo
5. `005_public_views.sql` — views públicas seguras (`public_establishments`, `public_products`) e taxa de entrega
6. `006_order_rate_limit.sql` — limite de pedidos por telefone/loja contra spam
7. `007_error_logs.sql` — tabela de log de erros críticos
8. `008_coupons.sql` — cupons de desconto
9. `009_order_tracking.sql` — acompanhamento público do pedido
10. `010_entrega_retirada.sql` — tipo de pedido (entrega/retirada) e endereço de entrega estruturado
11. `011_tipo_negocio_onboarding.sql` — tipo de negócio (com preparo/pronto/híbrido), toggle de acompanhamento detalhado e onboarding
12. `012_historico_pedidos_cliente.sql` — consulta de histórico de pedidos do cliente por telefone ("Meus Pedidos")
13. `013_taxa_entrega_por_bairro.sql` — bairros cadastrados pelo lojista com frete próprio
14. `014_push_subscriptions.sql` — inscrições de notificação push + trigger de novo pedido (⚠️ tem um passo manual — veja a seção "Notificações Push" abaixo antes de rodar)
15. `015_cupom_limite_por_cliente.sql` — limite de usos de cupom por telefone (ex: cupom de primeira compra), validado no carrinho e reforçado por trigger no banco
16. `016_perfil_cliente.sql` — perfil do cliente (nome + endereços salvos) vinculado ao telefone, sem conta/senha
17. `017_pagamento_cliente.sql` — `get_order_status` passa a devolver forma de pagamento, código do cupom e observações
18. `018_aniversario_cliente.sql` — data de nascimento no perfil + desconto automático de aniversário (opcional, configurável)
19. `019_sugestoes_carrinho.sql` — produtos em destaque (`is_featured`) e valor mínimo para frete grátis progressivo
20. `020_pix_automatico.sql` — chave Pix do lojista, pra gerar QR Code/copia-e-cola automaticamente no checkout
21. `021_lgpd_exclusao_dados.sql` — cliente pode apagar o próprio perfil salvo (nome, endereços) por telefone
22. `022_mais_vendido.sql` — cálculo real de produtos mais vendidos (30 dias) pro selo "🔥 Mais vendido" no cardápio
23. `023_whatsapp_notificacoes.sql` — coluna `whatsapp_notifications_enabled` (liga/desliga notificações automáticas de status via WhatsApp)
24. `024_dominio_proprio.sql` — coluna `custom_domain` por loja + view pública atualizada

### 3. Configure as variáveis de ambiente

Copie `.env.local.example` para `.env.local` e preencha com os dados do seu projeto:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Opcional — só se for usar notificações via WhatsApp (ver seção 6)
WHATSAPP_SERVER_URL=https://seu-servidor-whatsapp.exemplo.com
WHATSAPP_SERVER_SECRET=uma-string-aleatoria-compartilhada-com-o-servidor

# Opcional — só se for usar domínio próprio por loja (ver seção 7)
NEXT_PUBLIC_ROOT_DOMAIN=seuapp.vercel.app
```

> A `SUPABASE_SERVICE_ROLE_KEY` é usada pela rota de servidor
> `app/api/push/send` (precisa ler inscrições push de qualquer loja,
> ignorando RLS). Confira se o valor no seu `.env.local` é a **service_role
> key** de verdade (Project Settings → API) e não a anon key — as duas
> começam parecido, mas são bem diferentes em permissão. **Nunca** exponha
> essa chave no client.

### 4. Confirmação de e-mail (Authentication → Settings, no Supabase)

O app funciona nos dois modos:

- **Confirmação desativada** (mais simples para começar): o usuário já cria a
  loja e cai direto no painel após o cadastro.
- **Confirmação ativada**: após confirmar o e-mail, o usuário é levado para
  `/completar-cadastro` no primeiro acesso ao painel, onde finaliza a criação
  da loja (os dados informados no cadastro ficam salvos e são pré-preenchidos).

Para o e-mail de recuperação de senha funcionar, garanta que a **Site URL** e
as **Redirect URLs** (Authentication → URL Configuration) incluam a URL do seu
deploy (ex.: `https://seuapp.vercel.app/**`).

### 5. Notificações Push (opcional, mas recomendado)

Avisa o lojista de um pedido novo mesmo com o painel fechado (push de verdade,
não só o beep sonoro que só toca com a aba `/painel/pedidos` aberta). Tem duas
partes — o app (já pronto) e um passo manual no banco depois do deploy:

1. **Variáveis de ambiente**: já vêm preenchidas no `.env.local` local (chaves
   VAPID de exemplo geradas com `npx web-push generate-vapid-keys`). Em
   produção, gere seu próprio par e configure `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (um `mailto:` seu) e
   `PUSH_TRIGGER_SECRET` (uma string aleatória qualquer) nas variáveis de
   ambiente do deploy.
2. **Depois do primeiro deploy**, edite a função `notify_new_order_push` criada
   pela migration `014_push_subscriptions.sql` direto no SQL Editor do
   Supabase (`CREATE OR REPLACE FUNCTION ...`, mesmo texto da migration) e
   troque:
   - `https://SEU_DOMINIO_AQUI/api/push/send` pela URL real do seu deploy;
   - `SEU_PUSH_TRIGGER_SECRET_AQUI` pelo mesmo valor de `PUSH_TRIGGER_SECRET`
     configurado no passo 1.

   Sem esse ajuste, os pedidos continuam salvando normalmente — só a
   notificação automática não vai disparar (o trigger vai falhar silenciosamente
   ao tentar chamar uma URL que não existe). O lojista ativa a notificação pelo
   botão "Ativar notificações" na página Pedidos do painel, que já tem também
   um botão "Testar" pra confirmar que chegou sem precisar esperar um pedido de
   verdade.

### 6. Notificações via WhatsApp (opcional)

Avisa o cliente pelo WhatsApp quando o status do pedido dele muda ("Recebemos
seu pedido!", "Saiu para entrega!", etc.) — sempre 1 mensagem pra 1 cliente,
disparada manualmente pela ação do lojista no Kanban, nunca em massa. Usa
WPPConnect (automação não-oficial do WhatsApp) rodando num servidor **separado**
em `whatsapp-server/`, que **não roda no Vercel** (precisa de VPS — mantém um
Chromium aberto por sessão conectada). Leia `whatsapp-server/README.md` antes
de decidir usar: tem um aviso importante sobre risco de banimento do número.

Resumo:
1. Rode `migrations/023_whatsapp_notificacoes.sql`.
2. Suba `whatsapp-server/` numa VPS (passo a passo completo no README dela).
3. Configure `WHATSAPP_SERVER_URL` e `WHATSAPP_SERVER_SECRET` no app principal
   (mesmo valor do `API_SECRET` da VPS).
4. Cada loja conecta o próprio número em **Painel → WhatsApp** (QR Code) e liga
   o toggle de notificações automáticas.

Sem essas variáveis configuradas, a página `/painel/whatsapp` e o botão de
notificação simplesmente não funcionam — o resto do app continua normal.

### 7. Domínio próprio por loja (opcional)

Cada loja pode usar um domínio dela (ex: `cardapio.minhaloja.com.br`) em vez do
link padrão `/loja/[slug]`, preenchendo o campo em **Painel → Configurações**.
Isso sozinho não ativa nada — depois de rodar `migrations/024_dominio_proprio.sql`,
ainda é preciso, manualmente, por domínio:

1. Criar um registro **CNAME** no DNS do domínio apontando pra
   `cname.vercel-dns.com` (ou o valor que a Vercel indicar).
2. Adicionar esse mesmo domínio em **Vercel → seu projeto → Settings →
   Domains**.
3. Configurar `NEXT_PUBLIC_ROOT_DOMAIN` nas variáveis de ambiente com o
   domínio principal do seu app (ex: `seuapp.vercel.app` ou seu domínio
   próprio da plataforma) — é o que o middleware usa pra saber quando um
   request **não** é o app principal e vale a pena consultar o banco pra
   resolver um domínio de loja.

Sem `NEXT_PUBLIC_ROOT_DOMAIN` configurado, esse recurso fica inerte (nenhuma
consulta extra é feita) e o app se comporta como se a funcionalidade não
existisse.

### 8. Instale e rode

```bash
npm install
npm run dev
```

Acesse `http://localhost:3000`.

## Deploy (Vercel)

1. Suba o projeto para um repositório Git.
2. Importe o repositório na Vercel.
3. Configure as mesmas variáveis de ambiente do `.env.local` no painel da Vercel.
4. Deploy.

## Estrutura

```
app/
  page.tsx                 → landing page
  login/, cadastro/        → autenticação
  completar-cadastro/      → conclusão do cadastro (fallback p/ confirmação de e-mail)
  redefinir-senha/         → redefinição de senha
  loja/[slug]/             → cardápio público
  painel/                  → área logada do lojista (produtos, categorias, pedidos, balcão, financeiro, configurações, relatórios, whatsapp, planos)
  api/whatsapp/            → rotas proxy autenticadas pro servidor WhatsApp (status/start/logout/send)
lib/supabase/              → clients Supabase (browser, server, middleware, admin)
lib/establishment.ts       → criação de estabelecimento com slug único
lib/paymentMethods.ts      → formas de pagamento compartilhadas (checkout público + painel)
lib/pix.ts                 → geração de payload Pix (EMV + CRC16) sem gateway
lib/whatsappServer.ts      → cliente HTTP server-side pro whatsapp-server/
lib/verifyEstablishmentOwner.ts → autorização das rotas de API do WhatsApp
whatsapp-server/           → pacote Node separado (WPPConnect) — deploy próprio em VPS, ver seção 6
migrations/                → schema SQL + RLS + funções de estoque
types/                     → tipos compartilhados
public/                    → manifest, ícones e service worker do PWA
```

## Limitações conhecidas / próximos passos

- Os ícones em `public/icons/` são placeholders gerados automaticamente — troque por artes reais da marca antes de publicar em lojas de apps ou divulgar o link de instalação.
- Não há cobrança/gate de uso por plano implementado (campo `plan` existe no banco, mas hoje tudo é liberado gratuitamente) — a aba Planos só tem um CTA de contato pra quem quiser saber mais.
- Notificações via WhatsApp dependem de infraestrutura própria (VPS rodando `whatsapp-server/`, fora do Vercel) e usam automação não-oficial do WhatsApp (WPPConnect) — leia o aviso em `whatsapp-server/README.md` antes de ativar.
- Domínio próprio por loja depende de configuração manual de DNS (CNAME) e cadastro do domínio na Vercel, além de `NEXT_PUBLIC_ROOT_DOMAIN` configurado — ver seção 7.
- Não há paginação em listagens (produtos/pedidos); para catálogos muito grandes, considere adicionar.
- Uploads de imagem são feitos via URL — não há upload direto de arquivo para storage do Supabase.
