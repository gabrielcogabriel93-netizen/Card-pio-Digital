// Mensagens de erro do Supabase Auth chegam em inglês ("Invalid login
// credentials", "User already registered"...). Traduz as conhecidas e
// cai num texto genérico em português para o resto.
const KNOWN: { match: RegExp; message: string }[] = [
  { match: /invalid login credentials/i, message: 'E-mail ou senha incorretos.' },
  { match: /email not confirmed/i, message: 'Confirme seu e-mail pelo link que enviamos antes de entrar.' },
  { match: /user already registered|already been registered/i, message: 'Já existe uma conta com esse e-mail. Entre ou recupere a senha.' },
  { match: /password should be at least/i, message: 'A senha precisa ter pelo menos 8 caracteres.' },
  { match: /weak password|password is too weak|pwned/i, message: 'Essa senha é fácil de adivinhar. Use uma mais forte.' },
  { match: /unable to validate email|invalid email|email address .* is invalid/i, message: 'E-mail inválido.' },
  { match: /rate limit|too many requests|security purposes/i, message: 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.' },
  { match: /new password should be different/i, message: 'A nova senha precisa ser diferente da atual.' },
  { match: /token has expired|otp expired|link is invalid/i, message: 'Esse link expirou. Peça um novo.' },
  { match: /failed to fetch|network/i, message: 'Sem conexão com o servidor. Confira sua internet.' },
]

export function translateAuthError(message: string | null | undefined): string {
  if (!message) return 'Algo deu errado. Tente novamente.'
  const known = KNOWN.find((k) => k.match.test(message))
  return known ? known.message : 'Algo deu errado. Tente novamente.'
}

// Destino depois do login vindo de ?redirect=...: só caminho interno
// (começa com "/" e não com "//"), para não virar redirecionamento
// aberto para outro site.
export function safeRedirectPath(value: string | null | undefined, fallback = '/'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback
  return value
}
