# Freguês

Plataforma multi-tenant de cardápio digital: cada lojista cria sua conta, monta o
cardápio (categorias, produtos e variações), recebe pedidos online no painel na
hora, atende no balcão/PDV e acompanha o financeiro. O cliente instala o app DA
LOJA (logo, nome e cor dela) e recebe o status do pedido e as mensagens da loja
por notificação, sem WhatsApp. A marca da plataforma fica em `lib/brand.ts`.

## Atualização da auditoria (migrations 044 a 051): como implantar

As migrations mudam como o pedido é gravado: o cardápio deixa de inserir
direto na tabela `orders` e passa a chamar `place_order`, que calcula preço,
desconto e frete no banco. Siga esta ordem:

1. **Variáveis novas na Vercel** (ver `.env.local.example`): `SECRETS_ENCRYPTION_KEY`
   (obrigatória, `openssl rand -hex 32`), `NEXT_PUBLIC_ROOT_DOMAIN` e, se quiser
   domínio próprio em 1 clique, `VERCEL_TOKEN` / `VERCEL_PROJECT_ID`.
2. **SQL Editor do Supabase, ANTES do deploy:** rode `044_estrutura_melhorias.sql` e
   depois `045_pedido_seguro.sql` e `047_balcao_na_fila.sql` (venda de balcão
   pode ir para a fila da aba Pedidos). As três convivem com o app antigo no ar (testado
   em `db-tests/transicao.test.mjs`). Se a 044 avisar "Há donos com mais de uma
   loja", resolva as duplicadas e rode de novo.
3. **Deploy do app** (push na branch de produção).
4. **SQL Editor, DEPOIS que o deploy estiver no ar:** rode `046_fechar_acesso_antigo.sql`.
   Ela fecha a gravação direta de pedidos e as funções antigas de cliente.
   Rode também `048_marca_fregues.sql` (cor padrão antiga vira o azul Freguês e
   a loja demo perde o nome antigo; o endereço antigo da demo redireciona) e
   `049_app_da_loja_notificacoes.sql` (aparelhos dos clientes, mensagens da loja,
   sugestão do dia e confirmação de aparelho pelo número do pedido). A 049 pode
   rodar a qualquer momento; sem ela, o app da loja e a página Notificações
   ficam sem dados. Depois rode `050_combo_pizza_regras.sql` (pizza no combo com
   sabores e adicionais conforme a regra do lojista) e `051_aviso_loja_aberta.sql`
   (aviso automático quando a loja abre). As duas podem rodar a qualquer momento.
5. **Stripe:** em Settings → Billing → Customer portal, ative o portal (botão
   "Gerenciar assinatura"). Assinaturas de divulgador criadas antes desta versão
   foram feitas com o split invertido: corrija cada uma no painel da Stripe
   (Subscription → Update → transfer_data com `amount_percent`).
6. **Subdomínio por loja (opcional):** DNS curinga `*.seudominio` apontando
   para a Vercel e o domínio curinga adicionado no projeto.
8. **Agendador (pg_cron da migration 029):** chama `/api/cron/advance-orders` a cada
   minuto (automação de pedidos e aviso de loja aberta pelo horário). Confira em
   `cron_health` se `last_run_at` é recente; se não, recrie o job com a URL do deploy
   e o mesmo `CRON_TRIGGER_SECRET` da Vercel. Sem ele, o aviso de abertura ainda sai
   quando o lojista liga "Aberta" ou está com o painel aberto.
7. **IA da sugestão do dia (opcional):** sem chave, o gerador próprio escreve as
   sugestões de graça. `ANTHROPIC_API_KEY` usa a Claude (pago por uso);
   `GEMINI_API_KEY` usa o Gemini (tem cota gratuita).

Erros: tudo que falha (servidor e navegador) aparece em **/admin/logs**.

Testes: `npm test` (unitários), `npm run test:db` (aplica todas as migrations
num Postgres em memória e testa as regras de segurança) e `npm run test:e2e`.

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
  - Notificações (`/painel/notificacoes`): mensagens da loja para os clientes no celular deles (todos, quem pediu nos últimos 30 dias, sumidos, aniversariantes ou um cliente), com foto do produto, histórico de entregues e cliques, lembrete de carrinho abandonado e a lista de aparelhos (app instalado, avisos ativos)
  - Divulgar (`/painel/divulgar`): sugestão do dia com a foto de um produto (post e story prontos, legenda, hashtags e texto de notificação) e artes com QR Code
  - Domínio próprio (em Configurações): a loja pode apontar um domínio dela pro cardápio público, além do link padrão
  - Planos: aviso de sistema gratuito + CTA de "planos pagos em breve" + doação via PIX
  - Tutorial: como cada funcionalidade do painel funciona
- **Onboarding** (`/onboarding`): quiz de 3 perguntas logo após o cadastro que já deixa o painel configurado pro tipo de negócio
- **Cardápio público** (`/loja/[slug]`): navegação por categoria, variações, carrinho persistente, entrega (com busca de CEP e bairro por lista) ou retirada, e convite para instalar o app da loja e ativar os avisos do pedido (no iPhone, com o passo a passo de "Adicionar à Tela de Início")
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
25. ... `025` a `034` — pizza (tamanhos/sabores/adicionais), pagamento automático via Mercado Pago, impressão automática, automação de pedidos, assinatura da plataforma e comissões de divulgador. Confira o cabeçalho de cada arquivo em `migrations/` pro detalhe — a lista numerada acima ficou parada em 024 e não foi atualizada a cada rodada.
35. `035_rate_limit_consultas_publicas.sql` — limite de chamadas por estabelecimento nas consultas públicas por telefone (`get_orders_by_phone`, `get_customer_profile`), que antes não tinham nenhum

### 3. Configure as variáveis de ambiente

Copie `.env.local.example` para `.env.local` e preencha com os dados do seu projeto:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
NEXT_PUBLIC_APP_URL=http://localhost:3000

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

### 6. App da loja e notificações para o cliente

O WhatsApp automático saiu (risco de banimento e servidor separado). Tudo vai
por notificação do navegador, usando as mesmas chaves VAPID da seção 5:

- **App da loja:** o cardápio tem um manifest por loja (logo, nome e cor). Depois
  do pedido o cliente vê o convite para instalar e ativar os avisos. No iPhone
  o aviso só funciona com o app na tela inicial (iOS 16.4+), por isso o convite
  mostra o passo a passo.
- **Status do pedido:** a cada mudança no Kanban (ou na automação/Pix) o
  cliente recebe o aviso com o logo da loja e o número do pedido.
- **Mensagens da loja:** em **Painel → Notificações**, com limite de 3 envios em
  massa por dia para o cliente não desligar os avisos.
- **Aparelho novo:** o cliente confirma que o telefone é dele com o número de um
  pedido anterior (`verify_customer_by_order`).
- O selo "Criado com Freguês · Conheça" no rodapé do cardápio leva à landing
  com `?ref=slug-da-loja` (pode ser escondido em Configurações).

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
  painel/                  → área logada do lojista (produtos, categorias, pedidos, balcão, financeiro, configurações, relatórios, notificações, divulgar, planos)
  api/push/                → notificações: novo pedido (lojista), status do pedido, mensagens da loja (campaign) e cliques
  api/marketing/suggestion → sugestão de divulgação do dia
lib/supabase/              → clients Supabase (browser, server, middleware, admin)
lib/establishment.ts       → criação de estabelecimento com slug único
lib/paymentMethods.ts      → formas de pagamento compartilhadas (checkout público + painel)
lib/pix.ts                 → geração de payload Pix (EMV + CRC16) sem gateway
lib/customerPush.ts        → envio das notificações da loja para os clientes (públicos, limpeza de aparelhos)
lib/marketingAI.ts         → sugestão do dia (gerador próprio gratuito; Claude ou Gemini se houver chave)
lib/verifyEstablishmentOwner.ts → autorização das rotas de API do Mercado Pago
migrations/                → schema SQL + RLS + funções de estoque
types/                     → tipos compartilhados
public/                    → manifest, ícones e service worker do PWA
```

## Limitações conhecidas / próximos passos

- No iPhone, as notificações só chegam com o app da loja instalado na tela inicial (limitação do iOS, 16.4 ou mais novo).
- Domínio próprio por loja depende de configuração manual de DNS (CNAME) e cadastro do domínio na Vercel, além de `NEXT_PUBLIC_ROOT_DOMAIN` configurado — ver seção 7.
- Paginação (24 por página) só existe em Produtos por enquanto; Categorias/outras listagens continuam sem, mas o volume delas costuma ser pequeno o bastante pra não precisar.
- Upgrade de major do Next.js (14 → 15/16, corrige CVEs sem patch na 14.x) foi propositalmente deixado de fora desta rodada — é uma mudança de risco maior, ver auditoria.
- Ambiente de staging separado de produção (segundo projeto Supabase) ainda não existe — depende de criar a infraestrutura, fora do que dá pra fazer só no código.
