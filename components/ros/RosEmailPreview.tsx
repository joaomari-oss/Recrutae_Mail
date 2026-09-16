'use client'

import { renderOutreachEmail, type OutreachEmailInput } from '@/lib/outreach/emailHtml'

export type RosEmailPreviewProps = Omit<OutreachEmailInput, 'brand' | 'logoUrl'> & {
  logoUrl?: string
  title?: string
}

function resolvePreviewUrl(url: string): string {
  const baseUrl = typeof window === 'undefined'
    ? process.env.NEXT_PUBLIC_SITE_URL || 'https://mail.recrutae.com.br'
    : window.location.origin

  try {
    return new URL(url, baseUrl).toString()
  } catch {
    return url
  }
}

/** Visual preview backed by the exact HTML sent by the ROS delivery route. */
export function RosEmailPreview({ logoUrl = '/ros/recrutae-ros.png', title = 'Prévia do e-mail', ...input }: RosEmailPreviewProps) {
  const email = renderOutreachEmail({ ...input, brand: 'ros', logoUrl: resolvePreviewUrl(logoUrl) })

  return (
    <section aria-label={title} className="overflow-hidden rounded-lg border border-[#35334d] bg-[#0B0A18]">
      <div className="border-b border-[#35334d] px-4 py-3 font-mono text-xs text-[#F4F2ED]/70">{title}</div>
      <iframe
        title={title}
        srcDoc={email.html}
        sandbox=""
        className="block h-[620px] w-full border-0 bg-[#F4F2ED]"
      />
    </section>
  )
}
