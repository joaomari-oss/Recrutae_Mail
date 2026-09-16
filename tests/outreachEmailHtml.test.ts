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
    expect(rendered.html).toContain('font-size:11px;line-height:1.4;font-weight:700;letter-spacing:0.8px;color:#F5A623;">Recrutaê</p>')
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
    expect(rendered.html).toContain('font-size:14px;line-height:1.4;font-weight:700;letter-spacing:0;color:#0B0A18;">Recrutaê | OS</p>')
    expect(rendered.html).not.toContain('Para não receber mais emails, responda com "cancelar".')
  })
})

describe('assinatura com WhatsApp', () => {
  it('transforma o número em link clicável no HTML e no texto', async () => {
    const { renderOutreachEmail } = await import('@/lib/outreach/emailHtml')

    const rendered = renderOutreachEmail({
      body: 'Olá!', recruiterName: 'João', recruiterRole: 'Comercial',
      recruiterLinkedin: 'https://linkedin.com/in/joao', recruiterWhatsapp: '5511999999999',
      brand: 'ros', logoUrl: 'https://mail.recrutae.com.br/ros/recrutae-ros.png',
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
      brand: 'ros' as const, logoUrl: 'https://mail.recrutae.com.br/ros/recrutae-ros.png',
    }

    expect(renderOutreachEmail({ ...base, recruiterWhatsapp: 'https://wa.me/5511888888888' }).html)
      .toContain('href="https://wa.me/5511888888888"')
    expect(renderOutreachEmail({ ...base, recruiterWhatsapp: '' }).html).not.toContain('wa.me')
  })
})

describe('assinatura sem repetição', () => {
  it('não repete a marca quando o remetente não tem nome', async () => {
    const { renderOutreachEmail } = await import('@/lib/outreach/emailHtml')

    const rendered = renderOutreachEmail({
      body: 'Olá!', recruiterName: '', recruiterRole: '', recruiterLinkedin: '',
      recruiterWhatsapp: '', brand: 'ros', logoUrl: 'https://mail.recrutae.com.br/ros/recrutae-ros.png',
    })

    // Conta só o texto visível: o alt da logo também traz a marca.
    expect(rendered.html.match(/>Recrutaê \| OS</g)).toHaveLength(1)
  })

  it('mostra nome e marca quando o remetente tem nome', async () => {
    const { renderOutreachEmail } = await import('@/lib/outreach/emailHtml')

    const rendered = renderOutreachEmail({
      body: 'Olá!', recruiterName: 'João Mari', recruiterRole: '', recruiterLinkedin: '',
      recruiterWhatsapp: '', brand: 'ros', logoUrl: 'https://mail.recrutae.com.br/ros/recrutae-ros.png',
    })

    expect(rendered.html).toContain('João Mari')
    // Conta só o texto visível: o alt da logo também traz a marca.
    expect(rendered.html.match(/>Recrutaê \| OS</g)).toHaveLength(1)
  })
})
