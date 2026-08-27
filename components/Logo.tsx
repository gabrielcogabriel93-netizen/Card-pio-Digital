// Ícone da marca CatalogAI: o "C" abre em dentes de garfo no topo e
// termina em ponta de faca na base. Funciona primeiro como uma letra de
// marca (não grita "restaurante"), então serve tanto pra comida quanto
// pra loja de roupa, papelaria etc. — só depois de olhar duas vezes é
// que a referência a talher aparece.
//
// `fill="currentColor"` no fundo: no painel/landing herda `text-primary-500`
// (verde institucional fixo); no cardápio público, herda a cor de marca de
// cada loja via `--color-primary-500` (ver lib/theme.ts).
export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 96 96"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      <rect width="96" height="96" rx="21" fill="currentColor" />
      <path
        d="M 66 30 C 60 22 51 18 43 18 C 27 18 16 30 16 48 C 16 66 27 78 43 78 C 51 78 60 74 66 66"
        fill="none"
        stroke="#ffffff"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <g stroke="#ffffff" strokeWidth="4.6" strokeLinecap="round">
        <line x1="60" y1="26" x2="66" y2="19" />
        <line x1="65.5" y1="30.5" x2="73" y2="25" />
      </g>
      <path d="M 60 70 L 74 79 C 76 80.2 78.3 78.5 77.6 76.1 L 74.4 65.4 Z" fill="#ffffff" />
    </svg>
  )
}
