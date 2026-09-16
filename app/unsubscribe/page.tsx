import Image from 'next/image'
import { verifyUnsubscribeToken } from '@/lib/outreach/unsubscribe'

type UnsubscribePageProps = {
  searchParams: { token?: string }
}

function validSecret(): string | null {
  const secret = process.env.UNSUBSCRIBE_SIGNING_SECRET
  return secret && new TextEncoder().encode(secret).byteLength >= 32 ? secret : null
}

export default async function UnsubscribePage({ searchParams }: UnsubscribePageProps) {
  const token = searchParams.token
  const secret = validSecret()
  let email: string | null = null

  if (token && secret) {
    try {
      email = (await verifyUnsubscribeToken(token, secret)).email
    } catch {
      email = null
    }
  }

  return (
    <main className="min-h-screen bg-[#0B0A18] px-4 py-12 text-[#F4F2ED] flex items-center justify-center">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#16152C] p-8 shadow-2xl animate-fade-up" style={{ animationFillMode: 'forwards' }}>
        <div className="mb-7 flex justify-center">
          <Image src="/brand/recrutae-ros.png" alt="Recrutaê OS" width={46} height={46} priority />
        </div>

        {email ? (
          <>
            <h1 className="font-display text-3xl font-semibold">Confirmar descadastro</h1>
            <p className="mt-3 text-sm leading-6 text-[#F4F2ED]/70">
              Você deixará de receber as divulgações do Recrutaê | OS em <strong className="font-medium text-[#F4F2ED]">{email}</strong>.
            </p>
            <form method="post" action={`/api/unsubscribe?token=${encodeURIComponent(token!)}`} className="mt-7">
              <button type="submit" className="w-full rounded-lg bg-[#FBB900] px-4 py-3 text-sm font-semibold text-[#0B0A18] transition hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-[#FBB900] focus:ring-offset-2 focus:ring-offset-[#16152C]">
                Confirmar descadastro
              </button>
            </form>
            <p className="mt-4 text-center text-xs text-[#F4F2ED]/45">Esta ação pode ser desfeita falando com a Recrutaê.</p>
          </>
        ) : (
          <>
            <h1 className="font-display text-3xl font-semibold">Link inválido</h1>
            <p className="mt-3 text-sm leading-6 text-[#F4F2ED]/70">Este link de descadastro é inválido ou expirou. Solicite um novo link no e-mail recebido.</p>
          </>
        )}
      </section>
    </main>
  )
}
