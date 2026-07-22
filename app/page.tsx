'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Menu, X, Smartphone, ShoppingCart, LineChart, Package, Store, Pizza, Shirt, ShoppingBag, ChevronRight, CheckCircle } from 'lucide-react'

export default function LandingPage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    setIsVisible(true)
  }, [])

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">C</span>
              </div>
              <span className="font-bold text-xl text-gray-900">Cardápio<span className="text-primary-500">SaaS</span></span>
            </div>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-8">
              <a href="#funcionalidades" className="text-gray-600 hover:text-gray-900 transition-colors">Funcionalidades</a>
              <a href="#para-quem" className="text-gray-600 hover:text-gray-900 transition-colors">Para quem é</a>
              <a href="#como-funciona" className="text-gray-600 hover:text-gray-900 transition-colors">Como funciona</a>
              <Link href="/login" className="text-gray-600 hover:text-gray-900 transition-colors">Acessar</Link>
              <Link href="/cadastro" className="btn-primary">
                Criar meu cardápio grátis
              </Link>
            </nav>

            {/* Mobile Menu Button */}
            <button
              className="md:hidden p-2 rounded-lg hover:bg-gray-100"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label={isMenuOpen ? 'Fechar menu' : 'Abrir menu'}
            >
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 animate-fade-in">
            <div className="px-4 py-4 space-y-3">
              <a href="#funcionalidades" className="block py-2 text-gray-600 hover:text-gray-900" onClick={() => setIsMenuOpen(false)}>Funcionalidades</a>
              <a href="#para-quem" className="block py-2 text-gray-600 hover:text-gray-900" onClick={() => setIsMenuOpen(false)}>Para quem é</a>
              <a href="#como-funciona" className="block py-2 text-gray-600 hover:text-gray-900" onClick={() => setIsMenuOpen(false)}>Como funciona</a>
              <Link href="/login" className="block py-2 text-gray-600 hover:text-gray-900" onClick={() => setIsMenuOpen(false)}>Acessar</Link>
              <Link href="/cadastro" className="btn-primary w-full text-center" onClick={() => setIsMenuOpen(false)}>
                Criar meu cardápio grátis
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-50 via-white to-blue-50" />
        <div className="absolute top-20 right-20 w-72 h-72 bg-primary-200/30 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-20 w-72 h-72 bg-blue-200/30 rounded-full blur-3xl" />
        
        <div className={`relative max-w-4xl mx-auto text-center transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
          <div className="inline-flex items-center gap-2 bg-primary-50 text-primary-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
            <CheckCircle size={16} />
            <span>100% gratuito • Sem taxas • Multi-empresa</span>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6">
            Crie seu{' '}
            <span className="text-primary-500">cardápio digital</span>
            {' '}grátis e receba pedidos direto no{' '}
            <span className="text-green-500">WhatsApp</span>
          </h1>
          <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
            Transforme seu negócio com um cardápio online profissional. 
            Seus clientes visualizam produtos, escolhem variações e enviam o pedido 
            completo para você pelo WhatsApp em segundos.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/cadastro" className="btn-primary text-lg px-8 py-4">
              Criar meu cardápio grátis
              <ChevronRight size={20} />
            </Link>
            <Link href="#como-funciona" className="btn-secondary text-lg px-8 py-4">
              Como funciona
            </Link>
          </div>
          <div className="mt-12 flex items-center justify-center gap-8 text-sm text-gray-500">
            <span>✅ Sem instalação</span>
            <span>🔒 Dados seguros</span>
            <span>📱 Compatível celular</span>
          </div>
        </div>
      </section>

      {/* Funcionalidades Section */}
      <section id="funcionalidades" className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Tudo que você precisa em um só lugar
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Ferramentas completas para gerenciar seu cardápio, pedidos e vendas.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: <Smartphone className="w-6 h-6" />,
                title: 'Cardápio Digital',
                description: 'Cardápio online profissional com fotos, descrições, preços e variações. Atualize em tempo real.',
                color: 'bg-green-100 text-green-600'
              },
              {
                icon: <ShoppingCart className="w-6 h-6" />,
                title: 'Pedidos via WhatsApp',
                description: 'Cliente monta o pedido completo e envia direto para seu WhatsApp com todos os detalhes.',
                color: 'bg-blue-100 text-blue-600'
              },
              {
                icon: <Package className="w-6 h-6" />,
                title: 'Controle de Estoque',
                description: 'Gerencie estoque em tempo real. Baixa automática ao confirmar pedidos.',
                color: 'bg-purple-100 text-purple-600'
              },
              {
                icon: <LineChart className="w-6 h-6" />,
                title: 'Financeiro Automático',
                description: 'Relatórios de faturamento diário, semanal e mensal. Gráficos e filtros por período.',
                color: 'bg-orange-100 text-orange-600'
              },
              {
                icon: <Store className="w-6 h-6" />,
                title: 'Balcão / PDV',
                description: 'Venda presencial rápida com busca de produtos e baixa de estoque automática.',
                color: 'bg-pink-100 text-pink-600'
              },
              {
                icon: <Smartphone className="w-6 h-6" />,
                title: 'PWA Instalável',
                description: 'Seu cardápio funciona como app no celular do cliente. Instalação em um clique.',
                color: 'bg-teal-100 text-teal-600'
              }
            ].map((feature, index) => (
              <div
                key={index}
                className="card-hover animate-fade-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className={`w-12 h-12 rounded-lg ${feature.color} flex items-center justify-center mb-4`}>
                  {feature.icon}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Para Quem Section */}
      <section id="para-quem" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Para quem é o Cardápio SaaS?
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Ideal para qualquer negócio que queira vender mais com um catálogo digital profissional.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
            {[
              { icon: <Pizza className="w-8 h-8" />, title: 'Pizzarias', desc: 'Cardápio com variações de sabores e tamanhos' },
              { icon: <Store className="w-8 h-8" />, title: 'Restaurantes', desc: 'Menu completo com fotos e descrições' },
              { icon: <ShoppingBag className="w-8 h-8" />, title: 'Lanchonetes', desc: 'Catálogo rápido para delivery' },
              { icon: <Shirt className="w-8 h-8" />, title: 'Lojas de Roupa', desc: 'Catálogo de produtos com variações' },
              { icon: <Package className="w-8 h-8" />, title: 'Mercados', desc: 'Lista de produtos com preços' }
            ].map((item, index) => (
              <div
                key={index}
                className="card-hover text-center animate-fade-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="w-16 h-16 bg-primary-50 rounded-full flex items-center justify-center mx-auto mb-4 text-primary-500">
                  {item.icon}
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">{item.title}</h3>
                <p className="text-sm text-gray-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Como Funciona Section */}
      <section id="como-funciona" className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Comece em 3 passos
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Rápido, simples e gratuito. Você começa a receber pedidos hoje mesmo.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '1',
                title: 'Crie sua conta',
                description: 'Cadastre-se gratuitamente com seu e-mail e informe os dados do seu estabelecimento.'
              },
              {
                step: '2',
                title: 'Monte seu cardápio',
                description: 'Adicione produtos, fotos, preços, categorias e variações. Tudo pelo painel intuitivo.'
              },
              {
                step: '3',
                title: 'Compartilhe e venda',
                description: 'Compartilhe o link do seu cardápio e comece a receber pedidos pelo WhatsApp!'
              }
            ].map((item, index) => (
              <div key={index} className="text-center animate-fade-in" style={{ animationDelay: `${index * 200}ms` }}>
                <div className="w-16 h-16 bg-primary-500 rounded-full flex items-center justify-center mx-auto mb-6">
                  <span className="text-2xl font-bold text-white">{item.step}</span>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{item.title}</h3>
                <p className="text-gray-600">{item.description}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <Link href="/cadastro" className="btn-primary text-lg px-8 py-4">
              Criar meu cardápio grátis agora
              <ChevronRight size={20} />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">C</span>
                </div>
                <span className="font-bold text-xl text-white">Cardápio<span className="text-primary-500">SaaS</span></span>
              </div>
              <p className="text-sm">
                Plataforma completa para criar e gerenciar seu cardápio digital. 
                Receba pedidos direto no WhatsApp.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Produto</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#funcionalidades" className="hover:text-white transition-colors">Funcionalidades</a></li>
                <li><a href="#para-quem" className="hover:text-white transition-colors">Para quem é</a></li>
                <li><a href="#como-funciona" className="hover:text-white transition-colors">Como funciona</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Suporte</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/login" className="hover:text-white transition-colors">Acessar painel</Link></li>
                <li><Link href="/cadastro" className="hover:text-white transition-colors">Criar conta</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <p>&copy; {new Date().getFullYear()} Cardápio SaaS. Todos os direitos reservados.</p>
            <div className="flex gap-4">
              <Link href="/termos" className="hover:text-white transition-colors">Termos de Uso</Link>
              <Link href="/privacidade" className="hover:text-white transition-colors">Privacidade</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
