import { CadastroClient } from './CadastroClient'
import { getVisitorOffer } from '@/lib/signupOfferServer'

// Oferta do servidor (teste grátis do admin ou campanha do link).
export const dynamic = 'force-dynamic'

export default async function CadastroPage() {
  return <CadastroClient offer={await getVisitorOffer()} />
}
