import { resolveTxt } from 'node:dns/promises'
import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { runRosPreflight } from '@/lib/ros/preflight'

export const dynamic = 'force-dynamic'

export async function GET() {
  const apiKey = process.env.RESEND_API_KEY
  const result = await runRosPreflight({
    env: process.env,
    listDomains: async () => {
      if (!apiKey) throw new Error('RESEND_API_KEY não configurada.')
      const resend = new Resend(apiKey)
      const response = await resend.domains.list()
      if (response.error) throw new Error(response.error.message)
      return (response.data?.data ?? []).map(domain => ({ name: domain.name, status: domain.status }))
    },
    resolveTxt,
  })
  return NextResponse.json(result, {
    status: result.canSend ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  })
}
