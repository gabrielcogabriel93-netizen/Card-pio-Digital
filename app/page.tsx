import { LandingPage } from '@/components/landing/LandingPage'
import { getVisitorOffer } from '@/lib/signupOfferServer'

// A oferta (teste grátis do admin ou campanha do link /p/codigo) já vem do
// servidor: o site nunca mostra "X dias grátis" quando não há teste.
export const dynamic = 'force-dynamic'

export default async function Home() {
  return <LandingPage offer={await getVisitorOffer()} />
}
