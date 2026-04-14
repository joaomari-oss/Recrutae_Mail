import { NextResponse } from 'next/server'

export async function GET() {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY nao configurada.' }, { status: 500 })
  }

  try {
    // Use Resend REST API directly — SDK v3 doesn't have emails.list()
    const res = await fetch('https://api.resend.com/emails', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('[/api/recover] Resend API error:', res.status, errText)
      return NextResponse.json(
        { error: `Resend API retornou ${res.status}: ${errText.slice(0, 200)}` },
        { status: res.status }
      )
    }

    const data = await res.json()
    const emailList = data?.data || data || []

    if (!Array.isArray(emailList) || emailList.length === 0) {
      return NextResponse.json({ emails: [] })
    }

    // Map Resend emails to our SentEmail format
    const recoveredEmails = emailList
      .filter((e: any) => e.to && e.to.length > 0)
      .map((e: any) => ({
        id: e.id,
        campaignId: 'recovered',
        campaignName: 'Campanha Recuperada',
        candidateName: e.to?.[0] || '',
        company: '',
        email: e.to?.[0] || '',
        subject: e.subject || '(sem assunto)',
        body: '',
        status: e.last_event === 'bounced' || e.last_event === 'complained' ? 'failed' : 'sent',
        sentAt: e.created_at || new Date().toISOString(),
      }))

    return NextResponse.json({ emails: recoveredEmails })
  } catch (err) {
    console.error('[/api/recover] Error:', err)
    const message = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
