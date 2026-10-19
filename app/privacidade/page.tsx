import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const metadata = {
  title: 'Política de Privacidade',
}

export default function PrivacidadePage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-8">
          <ArrowLeft size={16} />
          Voltar
        </Link>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">Política de Privacidade</h1>
        <p className="text-sm text-gray-500 mb-8">Última atualização: 19/10/2026</p>

        <div className="prose prose-gray max-w-none space-y-6 text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">1. Quais dados coletamos</h2>
            <p><strong>Do lojista:</strong> nome, e-mail, senha (criptografada), nome do estabelecimento, telefone e endereço da loja, e os dados de pagamento da assinatura (processados pela Stripe ou pelo Mercado Pago, nunca guardamos o número do cartão).</p>
            <p><strong>Do cliente final</strong>, ao fazer um pedido pelo cardápio público: nome, telefone, endereço de entrega (quando houver), itens do pedido e, se ele quiser, data de aniversário para o desconto da loja.</p>
            <p><strong>Do aparelho do cliente</strong>, quando ele instala o app da loja ou ativa as notificações: o endereço técnico de envio de notificações gerado pelo navegador, o tipo de aparelho (iPhone, Android ou computador), se o app está instalado e a data da última visita. Isso só existe para aquela loja e serve para mandar os avisos do pedido e as mensagens da loja.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">2. Para que usamos esses dados</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Criar e manter sua conta e a operação do seu estabelecimento na plataforma;</li>
              <li>Processar e exibir pedidos entre o cliente final e o lojista;</li>
              <li>Avisar o lojista de pedidos novos e avisar o cliente sobre o status do pedido por notificação;</li>
              <li>Permitir que a loja envie mensagens aos clientes que ativaram as notificações (ofertas, aniversário, loja aberta). O cliente pode desativar a qualquer momento nas configurações do navegador ou do celular;</li>
              <li>Gerar sugestões de divulgação para o lojista a partir dos produtos do cardápio (nome, descrição, preço). Quando a loja usa um serviço de IA (Anthropic ou Google), só esses dados de produtos são enviados, nunca dados de clientes;</li>
              <li>Gerar relatórios financeiros e de estoque para o próprio lojista;</li>
              <li>Registrar erros técnicos para manter o sistema funcionando corretamente.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">3. Quem tem acesso</h2>
            <p>
              Os dados de pedidos e clientes de uma loja ficam visíveis apenas para o lojista responsável
              por aquele estabelecimento — nunca para outros lojistas cadastrados na plataforma. Dados
              públicos do cardápio (nome da loja, produtos, preços) são visíveis a qualquer visitante do
              link público, como esperado para um cardápio digital.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">4. Onde os dados ficam armazenados</h2>
            <p>
              Utilizamos o Supabase (banco de dados) e a Vercel (hospedagem) como provedores de
              tecnologia, e a Stripe e o Mercado Pago para pagamentos. As notificações passam pelos
              serviços de envio do próprio navegador (Google, Apple, Mozilla, Microsoft). Não vendemos nem
              compartilhamos seus dados com terceiros para fins de publicidade.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">5. Seus direitos (LGPD)</h2>
            <p>
              Você pode solicitar a qualquer momento a confirmação, correção ou exclusão dos seus dados
              pessoais. O cliente final pode apagar os próprios dados de uma loja em &quot;Meus pedidos&quot;
              (Apagar meus dados nesta loja). Lojistas podem editar ou remover produtos, pedidos e
              configurações diretamente pelo painel. Para exclusão completa da conta, entre em contato com o
              suporte pela página Planos do painel.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">6. Cookies e sessão</h2>
            <p>
              Usamos cookies estritamente necessários para manter você conectado ao painel e guardamos no
              próprio aparelho do cliente o carrinho, o último pedido e o identificador do app da loja. Não
              usamos cookies de rastreamento publicitário.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">7. Alterações</h2>
            <p>Esta política pode ser atualizada. Mudanças relevantes serão comunicadas pelos canais da plataforma.</p>
          </section>
        </div>

        <p className="text-sm text-gray-500 mt-10">
          Veja também nossos <Link href="/termos" className="text-primary-600 hover:underline">Termos de Uso</Link>.
        </p>
      </div>
    </div>
  )
}
