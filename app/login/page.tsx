import { LoginClient } from './LoginClient'
import { getVisitorOffer } from '@/lib/signupOfferServer'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  return <LoginClient offer={await getVisitorOffer()} />
}
