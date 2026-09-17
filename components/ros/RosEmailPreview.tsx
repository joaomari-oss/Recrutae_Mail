'use client'

import { useEffect, useState } from 'react'
import { renderOutreachEmail, type OutreachEmailInput } from '@/lib/outreach/emailHtml'
import { ROS_EMBLEM_DATA_URI } from '@/lib/ros/emblem'

export type RosEmailPreviewProps = Omit<OutreachEmailInput, 'brand' | 'logoUrl' | 'emblemUrl'> & {
  logoUrl?: string
  emblemUrl?: string
  title?: string
}

function resolvePreviewUrl(url: string): string {
  try {
    return new URL(url, window.location.origin).toString()
  } catch {
    return url
  }
}

/** Visual preview backed by the exact HTML sent by the ROS delivery route. */
export function RosEmailPreview({
  logoUrl = '/ros/recrutae-ros.png',
  emblemUrl = ROS_EMBLEM_DATA_URI,
  title = 'Prévia do e-mail',
  ...input
}: RosEmailPreviewProps) {
  const [previewLogoUrl, setPreviewLogoUrl] = useState(logoUrl)
  const [previewEmblemUrl, setPreviewEmblemUrl] = useState(emblemUrl)

  useEffect(() => {
    setPreviewLogoUrl(resolvePreviewUrl(logoUrl))
    // Um data: URI ja e absoluto; passa-lo pelo resolvedor o quebraria.
    setPreviewEmblemUrl(emblemUrl.startsWith('data:') ? emblemUrl : resolvePreviewUrl(emblemUrl))
  }, [logoUrl, emblemUrl])

  const email = renderOutreachEmail({ ...input, brand: 'ros', logoUrl: previewLogoUrl, emblemUrl: previewEmblemUrl })

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
