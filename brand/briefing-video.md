# Briefing do vídeo — Freguês

Respostas ao questionário de produção. Itens marcados com **[DECISÃO DO
DONO]** ainda dependem de uma escolha do dono do produto.

## 1. Marca

- **Nome exato:** **Freguês**. Na assinatura visual, sempre em minúsculas:
  **freguês**. "CatalogAI" é o nome antigo e não deve aparecer no vídeo.
  Se o e-mail recebido ainda diz "CatalogAI", é um modelo de e-mail do
  Supabase ainda não atualizado. "Cardápio Digital" na URL é só o nome
  técnico do projeto na hospedagem, não é a marca.
- **Logo:** nesta pasta.
  - Vetor: `logo/logo-horizontal.svg` (fundo claro) e
    `logo/logo-horizontal-negativo.svg` (fundo azul ou escuro).
  - Símbolo: `logo/simbolo-azul.svg` e `logo/simbolo-branco.svg`.
  - PNG transparente: `png/logo/`.
  - A palavra está em contornos, então não precisa da fonte instalada.
- **Em uma frase:** *O Freguês dá a restaurantes e lojas um cardápio
  digital com a marca deles, recebe os pedidos direto no painel, sem
  comissão, e coloca o app da loja no celular do cliente para ele voltar a
  pedir.*
- **Slogan:** *Seu cliente vira freguês.*

## 2. Identidade visual (já definida, não precisa propor opções)

| Uso | Cor | HEX |
|---|---|---|
| Principal (marca, botões) | Azul caneta | `#2340E0` |
| Destaque (CTA, ponto do símbolo) | Amarelo comanda | `#FFD43B` |
| Texto e títulos | Nanquim | `#14172B` |
| **Fundo principal** | Papel | `#F6F7FB` (ou branco) |
| Sucesso, pedido aceito | Verde | `#0B8A5F` |

- **Fontes** (Google Fonts, licença OFL; no Remotion dá para usar
  `@remotion/google-fonts`):
  - Títulos: **Bricolage Grotesque ExtraBold** (800), espaçamento −2,5%.
  - Texto: **Figtree** (400 a 700).
  - Números de pedido e preços: **JetBrains Mono**.
- **Regra de cor:** nunca texto amarelo sobre branco (sem contraste).
- **Arquivos de apoio:** `cores.css`, `tokens.json`, `aplicacoes/paleta.png`,
  `aplicacoes/tipografia.png`, e peças prontas em `redes-sociais/`.
- Guia completo: `README.md`.

## 3. Funcionalidades (todas existem hoje no app)

Atenção: **"pedidos pelo WhatsApp" não existe mais** (saiu do produto) e
**não há IA para descrição de produtos**. Não use essas duas.

1. **Cardápio digital com a marca da loja.** Link próprio e QR Code de
   mesa. O cliente pede em poucos toques, sem cadastro, sem senha e sem
   baixar app de loja.
2. **Pedidos direto no painel, sem comissão.** O pedido chega na hora com
   campainha até alguém aceitar e notificação no celular do lojista, mesmo
   com o painel fechado.
3. **App da loja no celular do cliente.** O cliente instala o app com o logo
   e o nome da loja e recebe cada etapa do pedido por notificação (aceito,
   em preparo, saiu para entrega).
4. **Fale com seus clientes.** Notificações para todos os clientes, para
   aniversariantes, para quem sumiu e para quem deixou o carrinho parado,
   mais um aviso automático quando a loja abre. Tudo sem custo por mensagem.
5. **Fidelidade e cupons** (plano Completo). Pontos a cada compra trocados
   por recompensas, cupons de desconto e desconto de aniversário.
6. **Pix automático** (plano Completo). O cliente paga pelo Mercado Pago e o
   pedido é aceito sozinho quando o pagamento cai.
7. **Operação completa** (plano Completo). Balcão/PDV, mesas com comanda,
   estoque, financeiro e relatórios de mais vendidos e horário de pico.
8. **Divulgação do dia.** Todo dia, uma sugestão de post e story com a foto
   de um produto da loja, legenda pronta e QR Code.

**Números reais:** **[PENDENTE]**. Hoje são 10 lojas cadastradas e
cerca de 120 pedidos, incluindo contas e pedidos de teste. É pouco para
servir de prova e não deve ser usado. A cena de prova deve usar só números
que aparecem nas telas da conta demo.

Dado real que pode ser dito: **configuração em minutos.** No cadastro, um
questionário de 3 perguntas já deixa o painel ajustado ao tipo de negócio.

## 4. Telas

- **Conta demo:** a loja é a "Pizzaria Demo" (`/loja/pizzaria-demo`).
  Produtos, preços e endereço são fictícios. **Mas há pedidos com nome e
  telefone reais do dono:** "Gabriel Coutinho" e "Maria Silva Santos", ambos
  com o telefone (21) 97265-2314. **Borre ou não mostre esses pedidos**, ou
  peça ao dono para apagá-los antes das capturas. O pedido "Cliente Teste"
  (11) 98888-7777 é fictício.
- **Lado mostrado:** recomendo **os dois**. O cliente pede pelo celular
  (cardápio e acompanhamento do pedido) e o restaurante recebe no painel
  com alarme. Esse "ida e volta" é o que vende o produto.
  **[DECISÃO DO DONO]** se preferir só um lado.

## 5. Referência de movimento — [DECISÃO DO DONO]

Sugestão que combina com a marca: limpo e confiante, no estilo Linear ou
Stripe (cortes rápidos, interface em destaque e tipografia grande), com
toques de energia de TikTok no gancho dos primeiros 3 segundos.

## 6. ElevenLabs — [DECISÃO DO DONO]

O dono informa se tem a chave. Se tiver, ela vai no arquivo `.env` e nunca
no chat.

## 7. Voz e pronúncia

- **Voz:** **[DECISÃO DO DONO]** (feminina ou masculina). Sugestão: voz
  brasileira jovem, próxima e animada, sem tom de locutor de rádio.
- **Pronúncia de "Freguês":** fre-GUÊS. O "u" não soa (como em "português"),
  o "ê" é fechado e a sílaba forte é a última. IPA: /fɾeˈɡes/. Na fala
  carioca e em boa parte do Brasil soa "fre-GUÊIS". Em português, a
  ElevenLabs costuma acertar escrevendo "freguês"; se errar, tente "freguêis".

## 8. Pasta de trabalho — [DECISÃO DO DONO]

Escolher entre o ambiente na nuvem (com envio dos MP4 no final) e uma pasta
no computador do dono.

## Cena final

- **Chamada para ação:** "Teste 7 dias grátis", com o endereço do site.
  Hoje o endereço é `card-pio-digital-hazel.vercel.app`. Se o dono tiver
  domínio próprio ou @ do Instagram, use-os no lugar: **[DECISÃO DO DONO]**.
- **Teste e preços (reais):**
  - **7 dias grátis com tudo liberado, sem cartão de crédito.**
  - Essencial: **R$ 49,90/mês**.
  - Completo: **R$ 97/mês**.
  - Sem comissão sobre os pedidos. O Pix automático opcional cobra R$ 1 por
    pedido pago, além da taxa do Mercado Pago.
  - Não existe plano gratuito permanente.
