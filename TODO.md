# Cardápio SaaS - TODO List

## FASE 1: Configuração Inicial e Banco de Dados
- [x] 1.1 - Inicializar projeto Next.js com TypeScript + Tailwind
- [x] 1.2 - Instalar dependências (supabase, @supabase/ssr, etc.)
- [x] 1.3 - Criar arquivos de configuração (.env, next.config, tailwind.config)
- [x] 1.4 - Criar migration SQL completa com RLS policies
- [x] 1.5 - Criar lib/supabase (client, server, middleware, admin)
- [x] 1.6 - Criar types/index.ts

## FASE 2: Autenticação e Layout
- [x] 2.1 - Criar páginas /cadastro e /login
- [x] 2.2 - Criar middleware de proteção de rotas
- [x] 2.3 - Criar layout do painel (sidebar + header)
- [x] 2.4 - Recuperação de senha (/redefinir-senha)
- [x] 2.5 - Fallback /completar-cadastro (confirmação de e-mail habilitada)

## FASE 3: Landing Page
- [x] 3.1 - Componentes da landing page (hero, features, como funciona, CTAs)
- [x] 3.2 - Página principal / (landing)

## FASE 4: Painel do Lojista
- [x] 4.1 - Dashboard (/painel) com cards de resumo
- [x] 4.2 - CRUD Produtos (/painel/produtos)
- [x] 4.3 - CRUD Categorias (/painel/categorias) com reordenação
- [x] 4.4 - Gerenciamento de Variações (grupos + opções por produto)
- [x] 4.5 - Pedidos Kanban (/painel/pedidos) com cancelamento/estorno de estoque
- [x] 4.6 - Balcão/PDV (/painel/balcao) com forma de pagamento e limite de estoque
- [x] 4.7 - Financeiro (/painel/financeiro) com lançamentos manuais (entrada/saída)
- [x] 4.8 - Configurações (/painel/configuracoes)

## FASE 5: Cardápio Público
- [x] 5.1 - Rota /loja/[slug] com produtos por categoria
- [x] 5.2 - Modal de variações
- [x] 5.3 - Carrinho lateral/flutuante
- [x] 5.4 - Envio via WhatsApp + salvamento do pedido

## FASE 6: PWA
- [x] 6.1 - manifest.json
- [x] 6.2 - Service worker
- [x] 6.3 - meta tags para PWA

## FASE 7: Finalização
- [x] 7.1 - README.md completo
- [x] 7.2 - Tratamento de erros e loading states
- [x] 7.3 - Responsividade mobile-first

## FASE 8: Regras de negócio e correções (revisão de comercialização)
- [x] 8.1 - Função de baixa/estorno de estoque no banco (`decrement_product_stock` / `increment_product_stock`)
- [x] 8.2 - Estorno de estoque e remoção do lançamento financeiro ao cancelar pedido confirmado/em preparo
- [x] 8.3 - Corrigir total do pedido para incluir o frete definido na confirmação
- [x] 8.4 - Unificar fonte do faturamento do Dashboard com a do Financeiro (financial_entries)
- [x] 8.5 - Corrigir cadastro (removida chamada admin inválida no client) + slug duplicado resolvido automaticamente
- [x] 8.6 - Corrigir classes Tailwind dinâmicas no Kanban (quebravam em produção)
- [x] 8.7 - Corrigir CSS base quebrado (`border-border` sem tema wireado) que impedia o build
- [x] 8.8 - Restringir colunas públicas do estabelecimento (owner_id/plan não expostos no cardápio público)
- [x] 8.9 - Política de RLS para exclusão de lançamentos financeiros

## Pendências conhecidas (fora do escopo desta rodada)
- [ ] Planos pagos / limites de uso por plano
- [ ] Upload de imagem direto (hoje é só por URL)
- [ ] Paginação em listagens grandes
- [ ] Ícones de marca reais (os atuais em public/icons são placeholders gerados)
