// Busca de endereço por CEP via ViaCEP (API pública, gratuita, sem chave).
// Só preenche rua/bairro pra reduzir digitação — o cliente ainda pode
// editar tudo depois, então uma falha ou CEP não encontrado não trava o
// pedido, só deixa de autocompletar.

export interface CepResult {
  street: string
  neighborhood: string
}

export async function lookupCep(cep: string): Promise<CepResult | null> {
  const digits = cep.replace(/\D/g, '')
  if (digits.length !== 8) return null

  try {
    const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
    if (!response.ok) return null

    const data = await response.json()
    if (data.erro) return null

    return {
      street: data.logradouro || '',
      neighborhood: data.bairro || '',
    }
  } catch {
    return null
  }
}

export function formatCep(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 5) return digits
  return `${digits.slice(0, 5)}-${digits.slice(5)}`
}
