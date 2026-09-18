// Skeleton do cardápio público — a página real (page.tsx) busca
// estabelecimento + categorias + produtos no servidor antes de renderizar
// qualquer coisa. Sem isso, cliente com internet fraca (comum em quem
// escaneia QR Code de mesa dentro do estabelecimento) vê tela branca até
// tudo carregar. Formato imita o layout real (header + categorias +
// cards de produto) pra já dar a sensação de "app abrindo", não de erro.
export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50 animate-pulse">
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-gray-200 flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-40 bg-gray-200 rounded" />
            <div className="h-3 w-24 bg-gray-100 rounded" />
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4">
        <div className="flex gap-2 overflow-hidden mb-5">
          {[16, 20, 14, 24, 18].map((w, i) => (
            <div key={i} className="h-8 bg-gray-200 rounded-full flex-shrink-0" style={{ width: `${w * 4}px` }} />
          ))}
        </div>

        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-4 border border-gray-100 flex gap-4">
              <div className="w-20 h-20 rounded-lg bg-gray-200 flex-shrink-0" />
              <div className="flex-1 space-y-2 py-1">
                <div className="h-4 w-2/3 bg-gray-200 rounded" />
                <div className="h-3 w-full bg-gray-100 rounded" />
                <div className="h-3 w-1/3 bg-gray-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
