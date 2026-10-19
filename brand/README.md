# Marca Freguês

Kit oficial da marca. Tudo aqui é a mesma identidade usada no app
(`lib/brand.ts`, `components/Logo.tsx`, `public/icons`).

## Ideia

**Freguês** é o cliente que volta. O nome resume o que o produto entrega ao
lojista: pedido direto, sem comissão, e um cliente que vira cliente fiel.

- **Slogan:** Seu cliente vira freguês.
- **Descrição curta:** Cardápio digital com pedido direto, sem comissão, e
  fidelidade que faz o cliente voltar.
- **Símbolo:** uma comanda (o papel do bloco de pedido) com a borda
  serrilhada de quando é destacada, o "F" no traço da caneta e o ponto
  amarelo do "tilim" de pedido novo.
- **Assinatura escrita:** sempre em minúsculas: **freguês**. No texto
  corrido, o nome próprio é "Freguês".

## Conteúdo da pasta

| Pasta | O que tem |
|---|---|
| `logo/` | Vetores (SVG), para impressão e qualquer tamanho. A palavra está em contornos, então não precisa da fonte instalada. |
| `png/logo/` | Os mesmos logos em PNG com fundo transparente (2000 px de largura; símbolos em 1024 px). |
| `png/icones/` | Ícones oficiais do app e do navegador, os mesmos de `public/icons` (app instalado, Apple, favicon, versão "maskable" para Android). |
| `redes-sociais/` | Avatar de perfil, capa (1500×500), imagem de compartilhamento de link (1200×630), post (1080×1080) e story (1080×1920). |
| `aplicacoes/` | Selo "Criado com Freguês" do rodapé do cardápio, paleta e tipografia. |
| `cores.css` / `tokens.json` | Cores e fontes prontas para usar em código ou ferramenta de design. |

### Qual logo usar

| Situação | Arquivo |
|---|---|
| Fundo claro (padrão) | `logo-horizontal` |
| Fundo azul ou escuro | `logo-horizontal-negativo` (branco: aparece "vazio" em fundo transparente, é assim mesmo) |
| Impressão em uma cor | `logo-horizontal-mono-preto` / `-mono-branco` |
| Espaço quadrado, avatar, carimbo | `simbolo-azul` (ou `simbolo-branco` em fundo azul) |
| Só a palavra, com o ponto amarelo | `palavra` / `palavra-negativo` |

## Cores

| Nome | HEX | RGB | Uso |
|---|---|---|---|
| Azul caneta | `#2340E0` | 35 64 224 | Marca, botões, links |
| Amarelo comanda | `#FFD43B` | 255 212 59 | Destaque, chamada para ação, ponto do símbolo |
| Nanquim | `#14172B` | 20 23 43 | Texto e títulos |
| Papel | `#F6F7FB` | 246 247 251 | Fundo |
| Verde confirmado | `#0B8A5F` | 11 138 95 | Sucesso, pedido aceito |

Proporção sugerida: muito papel e branco, azul como cor principal, amarelo
só em pequenos pontos de destaque (nunca texto amarelo sobre branco: não
tem contraste).

## Tipografia

Todas gratuitas (licença OFL), no Google Fonts:

- **Títulos:** [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque), ExtraBold (800), espaçamento −2,5%.
- **Texto:** [Figtree](https://fonts.google.com/specimen/Figtree), 400 a 700.
- **Números de pedido e valores:** [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono), 500/700.
- **Anotações (uso raro, tom de bilhete):** [Caveat](https://fonts.google.com/specimen/Caveat).

## Regras de uso do logo

- **Área de proteção:** deixe em volta do logo um espaço livre de pelo menos
  metade da altura do símbolo.
- **Tamanho mínimo:** símbolo com 24 px na tela (8 mm impresso); logo
  horizontal com 96 px de largura (25 mm impresso).
- **Não faça:** esticar ou achatar, trocar as cores fora da paleta, girar,
  pôr sombra ou contorno, escrever a palavra em outra fonte ou com
  maiúscula no logo, colocar o logo colorido sobre foto sem uma faixa de
  fundo.

## Voz

Próxima, direta e de balcão: fala como o dono de uma loja de bairro fala com
o cliente. Frases curtas, verbos de ação ("Peça", "Acompanhe", "Volte
sempre"). Sem jargão técnico com o lojista e sem promessas exageradas.

## A marca da loja vem primeiro

No cardápio, no app instalado e nas notificações, quem aparece é a **loja**
(logo, nome e cor dela). A marca Freguês aparece só no selo discreto do
rodapé: "Criado com freguês · Conheça" (`aplicacoes/selo-criado-com-fregues.png`),
que leva à landing com `?ref=` da loja.
