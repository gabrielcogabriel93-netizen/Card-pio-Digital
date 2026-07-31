import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const metadata = {
  title: 'Termos de Uso',
}

export default function TermosPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-8">
          <ArrowLeft size={16} />
          Voltar
        </Link>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">Termos de Uso</h1>
        <p className="text-sm text-gray-500 mb-8">Última atualização: {new Date().toLocaleDateString('pt-BR')}</p>

        <div className="prose prose-gray max-w-none space-y-6 text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">1. O que é o CatalogAI</h2>
            <p>
              O CatalogAI é uma plataforma que permite a lojistas criarem um cardápio digital,
              gerenciarem produtos, pedidos, estoque e financeiro do seu negócio, e receberem pedidos de
              clientes via WhatsApp.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">2. Cadastro e responsabilidade da conta</h2>
            <p>
              Ao criar uma conta, você garante que as informações fornecidas (nome, e-mail, dados do
              estabelecimento) são verdadeiras. Você é responsável por manter sua senha em sigilo e por
              todas as atividades realizadas na sua conta.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">3. Uso da plataforma</h2>
            <p>
              Você concorda em não usar o CatalogAI para fins ilegais, para publicar conteúdo
              enganoso, ofensivo ou que viole direitos de terceiros, nem para tentar acessar dados de
              outras lojas sem autorização.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">4. Pedidos e relação com os clientes</h2>
            <p>
              O CatalogAI é uma ferramenta de gestão e comunicação — o contrato de compra e venda é
              feito diretamente entre o lojista e o cliente final. Não somos parte dessa relação
              comercial: não garantimos a entrega, a qualidade dos produtos ou o cumprimento do pedido
              pelo lojista.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">5. Pagamento automático via Mercado Pago</h2>
            <p>
              O lojista pode, opcionalmente, conectar sua própria conta do Mercado Pago para aceitar Pix
              automático no cardápio. Nesse caso, o pagamento do cliente vai direto para a conta do
              lojista no Mercado Pago — o CatalogAI não recebe, não guarda e não tem acesso ao dinheiro do
              cliente em nenhum momento. Por facilitar essa integração, o CatalogAI recebe uma comissão
              fixa por pedido pago dessa forma, descontada automaticamente pelo próprio Mercado Pago no
              momento do pagamento (split).
            </p>
            <p className="mt-2">
              Disputas sobre o pagamento em si (estorno, contestação, falha na cobrança) são resolvidas
              entre o lojista, o cliente e o Mercado Pago, conforme os termos de uso do Mercado Pago — o
              CatalogAI não é parte dessa relação de pagamento, só disponibiliza a integração técnica.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">6. Disponibilidade do serviço</h2>
            <p>
              Fazemos o possível para manter a plataforma disponível, mas não garantimos operação
              ininterrupta. Manutenções, falhas de terceiros (ex: Supabase, Vercel, Mercado Pago) ou casos
              fortuitos podem causar indisponibilidade temporária.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">7. Cancelamento</h2>
            <p>
              Você pode encerrar sua conta a qualquer momento. Reservamo-nos o direito de suspender contas
              que violem estes termos.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">8. Alterações</h2>
            <p>
              Estes termos podem ser atualizados. Mudanças relevantes serão comunicadas pelos canais da
              plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">9. Contato</h2>
            <p>Dúvidas sobre estes termos podem ser enviadas para o suporte da plataforma.</p>
          </section>
        </div>

        <p className="text-sm text-gray-500 mt-10">
          Veja também nossa <Link href="/privacidade" className="text-primary-600 hover:underline">Política de Privacidade</Link>.
        </p>
      </div>
    </div>
  )
}
