import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey, unauthorizedResponse } from '@/lib/api-auth'
import { checkRateLimit } from '@/lib/rate-limiter'

export async function GET(req: NextRequest) {
  if (!validateApiKey(req)) return unauthorizedResponse()

  const { allowed } = checkRateLimit('recover-global', 30, 60_000)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit excedido. Tente novamente em breve.' },
      { status: 429 }
    )
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY nao configurada.' }, { status: 500 })
  }

  try {
    // Paginate through all emails using cursor-based pagination (Resend uses 'after', not 'offset')
    const allRaw: any[] = []
    const limit = 100
    let after: string | undefined

    while (true) {
      const qs = new URLSearchParams({ limit: String(limit) })
      if (after) qs.set('after', after)

      const res = await fetch(
        `https://api.resend.com/emails?${qs}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      )

      if (!res.ok) {
        const errText = await res.text()
        console.error('[/api/recover] Resend API error:', res.status, errText)
        return NextResponse.json(
          { error: `Resend API retornou ${res.status}: ${errText.slice(0, 200)}` },
          { status: res.status }
        )
      }

      const data = await res.json()
      const page: any[] = data?.data || (Array.isArray(data) ? data : [])
      allRaw.push(...page)

      if (page.length < limit) break
      after = page[page.length - 1]?.id
      if (!after) break  // safety guard against infinite loop
      if (allRaw.length > 10_000) break  // hard cap
    }

    if (allRaw.length === 0) {
      return NextResponse.json({ emails: [] })
    }

    // 'sent' = accepted by recipient's mail server; 'delivered'/'opened'/'clicked' = confirmed delivery
    const SUCCESS_EVENTS = new Set(['sent', 'delivered', 'opened', 'clicked'])

    const recoveredEmails = allRaw
      .filter((e: any) => e.to && e.to.length > 0)
      .map((e: any) => ({
        id: e.id,
        resendMessageId: e.id,
        campaignId: 'recovered',
        campaignName: 'Campanha Recuperada',
        candidateName: e.to?.[0] || '',
        company: '',
        email: e.to?.[0] || '',
        subject: e.subject || '(sem assunto)',
        body: '',
        status: SUCCESS_EVENTS.has(e.last_event) ? 'sent' : 'failed',
        sentAt: e.created_at || new Date().toISOString(),
      }))

    return NextResponse.json({ emails: recoveredEmails })
  } catch (err) {
    console.error('[/api/recover] Error:', err)
    const message = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
