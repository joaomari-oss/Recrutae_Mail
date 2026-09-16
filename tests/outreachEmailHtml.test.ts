import { describe, expect, it } from 'vitest'
import { renderOutreachEmail } from '@/lib/outreach/emailHtml'

describe('email ROS', () => {
  it('renderiza o monograma e escapa dados do remetente', () => {
    const rendered = renderOutreachEmail({
      body: 'Olá!\n\nVeja https://recrutae.com.br/ros',
      recruiterName: '<João>',
      recruiterRole: 'Comercial',
      recruiterLinkedin: '',
      recruiterWhatsapp: '',
      brand: 'ros',
      logoUrl: 'https://mail.recrutae.com.br/ros/recrutae-ros.png',
      unsubscribeUrl: 'https://mail.recrutae.com.br/unsubscribe?token=abc',
    })

    expect(rendered.html).toContain('Recrutaê | OS')
    expect(rendered.html).toContain('recrutae-ros.png')
    expect(rendered.html).toContain('&lt;João&gt;')
    expect(rendered.html).not.toContain('<João>')
    expect(rendered.text).toContain('Descadastrar: https://mail.recrutae.com.br/unsubscribe?token=abc')
  })

  it('não cria links inseguros para os dados opcionais', () => {
    const rendered = renderOutreachEmail({
      body: '<script>alert(1)</script>\nhttps://recrutae.com.br/ros',
      recruiterName: 'Ana',
      recruiterRole: 'Operações',
      recruiterLinkedin: 'javascript:alert(1)',
      recruiterWhatsapp: 'not a URL',
      brand: 'ros',
      logoUrl: 'javascript:alert(1)',
    })

    expect(rendered.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(rendered.html).not.toContain('href="javascript:')
    expect(rendered.html).not.toContain('src="javascript:')
    expect(rendered.html).toContain('href="https://recrutae.com.br/ros"')
  })

  it('mantém a marca Recrutaê para Clientes e omite opcionais vazios', () => {
    const rendered = renderOutreachEmail({
      body: 'Olá',
      recruiterName: 'Ana',
      recruiterRole: '',
      recruiterLinkedin: '',
      recruiterWhatsapp: '',
      brand: 'clients',
      logoUrl: 'https://mail.recrutae.com.br/recrutae.webp',
    })

    expect(rendered.html).toContain('>Recrutaê<')
    expect(rendered.html).not.toContain('Recrutaê | OS')
    expect(rendered.html).not.toContain('LinkedIn')
    expect(rendered.html).not.toContain('WhatsApp')
  })

  it('preserva parâmetros de URL ao criar links seguros no corpo', () => {
    const rendered = renderOutreachEmail({
      body: 'Confira https://recrutae.com.br/ros?source=email&campaign=outreach',
      recruiterName: 'Ana', recruiterRole: '', recruiterLinkedin: '', recruiterWhatsapp: '',
      brand: 'ros', logoUrl: 'https://mail.recrutae.com.br/ros/recrutae-ros.png',
    })

    expect(rendered.html).toContain('href="https://recrutae.com.br/ros?source=email&amp;campaign=outreach"')
  })
})
