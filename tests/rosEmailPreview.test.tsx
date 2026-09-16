import { render } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { RosEmailPreview } from '@/components/ros/RosEmailPreview'

describe('RosEmailPreview', () => {
  const props = {
    body: 'Olá',
    recruiterName: 'Ana',
    recruiterRole: '',
    recruiterLinkedin: '',
    recruiterWhatsapp: '',
  }

  it('mantém SSR sem origem de fallback e resolve o logo após o mount', () => {
    vi.stubGlobal('window', undefined)
    const serverMarkup = renderToStaticMarkup(<RosEmailPreview {...props} />)
    vi.unstubAllGlobals()

    const browserInitialMarkup = renderToStaticMarkup(<RosEmailPreview {...props} />)
    expect(serverMarkup).not.toContain('mail.recrutae.com.br')
    expect(serverMarkup).toContain('RECRUTAÊ OPERATING SYSTEM')
    expect(browserInitialMarkup).toBe(serverMarkup)

    const { getByTitle } = render(<RosEmailPreview {...props} />)

    const preview = getByTitle('Prévia do e-mail') as HTMLIFrameElement
    // A assinatura do modelo usa o emblema circular, resolvido após o mount.
    expect(preview.srcdoc).toContain(`src="${new URL('/ros/ros-emblema.png', window.location.origin).href}"`)
  })
})
