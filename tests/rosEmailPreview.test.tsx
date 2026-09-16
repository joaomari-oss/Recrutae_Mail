import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RosEmailPreview } from '@/components/ros/RosEmailPreview'

describe('RosEmailPreview', () => {
  it('resolve o logo padrão para uma URL absoluta aceita pelo renderer', () => {
    const { getByTitle } = render(
      <RosEmailPreview
        body="Olá"
        recruiterName="Ana"
        recruiterRole=""
        recruiterLinkedin=""
        recruiterWhatsapp=""
      />,
    )

    const preview = getByTitle('Prévia do e-mail') as HTMLIFrameElement
    expect(preview.srcdoc).toContain(`src="${new URL('/ros/recrutae-ros.png', window.location.origin).href}"`)
  })
})
