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
    expect(rendered.html).toContain('Para não receber mais emails, responda com "cancelar".')
    expect(rendered.html).toContain('width="100"')
    expect(rendered.html).toContain('background-color:#f5f5f7')
    // Acabamentos restaurados do desenho anterior de Clientes.
    expect(rendered.html).toContain('letter-spacing:1px;text-transform:uppercase;color:#F5A623;">Recrutaê</p>')
    expect(rendered.html).toContain('border-radius:12px')
    expect(rendered.html).toContain('box-shadow:0 1px 3px rgba(0,0,0,0.08)')
    expect(rendered.html).toContain("'Helvetica Neue', Helvetica, Arial, sans-serif")
  })

  it('preserva parâmetros de URL ao criar links seguros no corpo', () => {
    const rendered = renderOutreachEmail({
      body: 'Confira https://recrutae.com.br/ros?source=email&campaign=outreach',
      recruiterName: 'Ana', recruiterRole: '', recruiterLinkedin: '', recruiterWhatsapp: '',
      brand: 'ros', logoUrl: 'https://mail.recrutae.com.br/ros/recrutae-ros.png',
    })

    expect(rendered.html).toContain('href="https://recrutae.com.br/ros?source=email&amp;campaign=outreach"')
  })

  it('mantém o layout fluido e a marca ROS em tinta escura', () => {
    const rendered = renderOutreachEmail({
      body: 'Olá', recruiterName: 'Ana', recruiterRole: '', recruiterLinkedin: '', recruiterWhatsapp: '',
      brand: 'ros', logoUrl: 'https://mail.recrutae.com.br/ros/recrutae-ros.png',
    })

    expect(rendered.html).toContain('width="100%" style="width:100%;max-width:600px;')
    expect(rendered.html).not.toContain('width="600"')
    // A assinatura ROS segue o modelo: sobrancelha, filete e barra âmbar.
    expect(rendered.html).toContain('RECRUTAÊ OPERATING SYSTEM')
    expect(rendered.html).toContain('border-left:2px solid #FBB900')
    expect(rendered.html).toContain('border-bottom:1px solid #D9D7D0')
    expect(rendered.html).not.toContain('Para não receber mais emails, responda com "cancelar".')
  })
})

describe('assinatura de Clientes com WhatsApp', () => {
  it('transforma o número em link clicável no HTML e no texto', async () => {
    const { renderOutreachEmail } = await import('@/lib/outreach/emailHtml')

    const rendered = renderOutreachEmail({
      body: 'Olá!', recruiterName: 'João', recruiterRole: 'Comercial',
      recruiterLinkedin: 'https://linkedin.com/in/joao', recruiterWhatsapp: '5511999999999',
      brand: 'clients', logoUrl: 'https://mail.recrutae.com.br/recrutae.webp',
    })

    expect(rendered.html).toContain('href="https://wa.me/5511999999999"')
    expect(rendered.html).toContain('>WhatsApp</a>')
    expect(rendered.text).toContain('WhatsApp: https://wa.me/5511999999999')
    expect(rendered.html).toContain('href="https://linkedin.com/in/joao"')
  })

  it('aceita o número já em formato de URL e omite quando vazio', async () => {
    const { renderOutreachEmail } = await import('@/lib/outreach/emailHtml')
    const base = {
      body: 'Olá!', recruiterName: 'João', recruiterRole: '', recruiterLinkedin: '',
      brand: 'clients' as const, logoUrl: 'https://mail.recrutae.com.br/recrutae.webp',
    }

    expect(renderOutreachEmail({ ...base, recruiterWhatsapp: 'https://wa.me/5511888888888' }).html)
      .toContain('href="https://wa.me/5511888888888"')
    expect(renderOutreachEmail({ ...base, recruiterWhatsapp: '' }).html).not.toContain('wa.me')
  })
})

describe('assinatura ROS segue o modelo aprovado', () => {
  const base = {
    body: 'Olá!',
    recruiterName: 'Leandro Mari',
    recruiterRole: 'Founder',
    recruiterLinkedin: '',
    recruiterWhatsapp: '5511979796154',
    brand: 'ros' as const,
    logoUrl: 'https://mail.recrutae.com.br/ros/recrutae-ros.png',
    emblemUrl: 'https://mail.recrutae.com.br/ros/ros-emblema.png',
    recruiterEmail: 'leandromari@recrutae.com.br',
  }

  it('monta sobrancelha, emblema, nome, cargo e contatos', async () => {
    const { renderOutreachEmail } = await import('@/lib/outreach/emailHtml')
    const rendered = renderOutreachEmail(base)

    expect(rendered.html).toContain('rOS')
    expect(rendered.html).toContain('RECRUTAÊ OPERATING SYSTEM')
    expect(rendered.html).toContain('ros-emblema.png')
    expect(rendered.html).toContain('>Leandro Mari</p>')
    expect(rendered.html).toContain('>Founder</p>')
    expect(rendered.html).toContain('+55 11 97979-6154')
    expect(rendered.html).toContain('href="mailto:leandromari@recrutae.com.br"')
    expect(rendered.html).toContain('>www.recrutaeos.com.br</a>')
  })

  it('repete os mesmos dados na versão em texto', async () => {
    const { renderOutreachEmail } = await import('@/lib/outreach/emailHtml')
    const { text } = renderOutreachEmail(base)

    expect(text).toContain('rOS / RECRUTAÊ OPERATING SYSTEM')
    expect(text).toContain('Leandro Mari')
    expect(text).toContain('Founder')
    expect(text).toContain('+55 11 97979-6154')
    expect(text).toContain('leandromari@recrutae.com.br')
    expect(text).toContain('www.recrutaeos.com.br')
  })

  it('omite telefone e e-mail quando não informados, mantendo o site', async () => {
    const { renderOutreachEmail } = await import('@/lib/outreach/emailHtml')
    const rendered = renderOutreachEmail({ ...base, recruiterWhatsapp: '', recruiterEmail: '' })

    expect(rendered.html).not.toContain('mailto:')
    expect(rendered.html).not.toContain('+55')
    expect(rendered.html).toContain('>www.recrutaeos.com.br</a>')
  })

  it('aceita um site diferente sem quebrar o modelo', async () => {
    const { renderOutreachEmail } = await import('@/lib/outreach/emailHtml')
    const rendered = renderOutreachEmail({ ...base, siteUrl: 'https://recrutae.com.br/os' })

    expect(rendered.html).toContain('href="https://recrutae.com.br/os"')
    expect(rendered.html).toContain('>recrutae.com.br/os</a>')
  })
})

describe('assinatura de Clientes sem repetição', () => {
  it('não repete a marca quando o remetente não tem nome', async () => {
    const { renderOutreachEmail } = await import('@/lib/outreach/emailHtml')

    const rendered = renderOutreachEmail({
      body: 'Olá!', recruiterName: '', recruiterRole: '', recruiterLinkedin: '',
      recruiterWhatsapp: '', brand: 'clients', logoUrl: 'https://mail.recrutae.com.br/recrutae.webp',
    })

    // Conta só o texto visível: o alt da logo também traz a marca.
    expect(rendered.html.match(/>Recrutaê</g)).toHaveLength(1)
  })

  it('mostra nome e marca quando o remetente tem nome', async () => {
    const { renderOutreachEmail } = await import('@/lib/outreach/emailHtml')

    const rendered = renderOutreachEmail({
      body: 'Olá!', recruiterName: 'João Mari', recruiterRole: '', recruiterLinkedin: '',
      recruiterWhatsapp: '', brand: 'clients', logoUrl: 'https://mail.recrutae.com.br/recrutae.webp',
    })

    expect(rendered.html).toContain('João Mari')
    // Conta só o texto visível: o alt da logo também traz a marca.
    expect(rendered.html.match(/>Recrutaê</g)).toHaveLength(1)
  })
})
