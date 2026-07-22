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
  - Pedidos: Kanban (pendente → confirmado → em preparo → concluído/cancelado), baixa e estorno automático de estoque, geração de lançamento financeiro na confirmação
  - Balcão/PDV: venda presencial com busca de produtos, variações, controle de estoque e forma de pagamento
  - Financeiro: entradas automáticas (pedidos confirmados/vendas de balcão) + lançamentos manuais de entrada/saída, filtros por período
  - Configurações: dados da loja, horário de funcionamento, loja aberta/fechada, link público, cor do tema
- **Cardápio público** (`/loja/[slug]`): navegação por categoria, variações, carrinho e envio do pedido pronto via WhatsApp
- **Recuperação de senha** (`/login` → `/redefinir-senha`)
- **PWA**: instalável no celular do lojista e do cliente

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

### 3. Configure as variáveis de ambiente

Copie `.env.local.example` para `.env.local` e preencha com os dados do seu projeto:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

> A `SUPABASE_SERVICE_ROLE_KEY` não é usada pelo código atual (todas as rotas
> rodam no client com a `anon key` + RLS), mas fica reservada para futuras
> rotas de servidor/admin. **Nunca** exponha essa chave no client.

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

### 5. Instale e rode

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
  painel/                  → área logada do lojista (produtos, categorias, pedidos, balcão, financeiro, configurações)
lib/supabase/              → clients Supabase (browser, server, middleware, admin)
lib/establishment.ts       → criação de estabelecimento com slug único
migrations/                → schema SQL + RLS + funções de estoque
types/                     → tipos compartilhados
public/                    → manifest, ícones e service worker do PWA
```

## Limitações conhecidas / próximos passos

- Os ícones em `public/icons/` são placeholders gerados automaticamente — troque por artes reais da marca antes de publicar em lojas de apps ou divulgar o link de instalação.
- Não há planos pagos/limites por plano implementados (campo `plan` existe no banco, mas sem cobrança ou gate de uso).
- Não há paginação em listagens (produtos/pedidos); para catálogos muito grandes, considere adicionar.
- Uploads de imagem são feitos via URL — não há upload direto de arquivo para storage do Supabase.
