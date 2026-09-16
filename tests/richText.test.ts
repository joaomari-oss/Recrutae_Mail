import { describe, expect, it } from 'vitest'
import { renderInlineHtml, richTextToPlain, hasUnsafeLink } from '@/lib/outreach/richText'

const ACCENT = '#FBB900'

describe('marcação simples do corpo do e-mail', () => {
  it('converte negrito e link nomeado', () => {
    const html = renderInlineHtml('Veja o **Recrutaê OS** e [clique aqui](https://recrutae.com.br/os).', ACCENT)

    expect(html).toContain('<strong>Recrutaê OS</strong>')
    expect(html).toContain('href="https://recrutae.com.br/os"')
    expect(html).toContain('>clique aqui</a>')
  })

  it('mantém o auto-link de URL solta', () => {
    const html = renderInlineHtml('Acesse https://recrutae.com.br hoje', ACCENT)

    expect(html).toContain('href="https://recrutae.com.br"')
    expect(html).toContain('>https://recrutae.com.br</a>')
  })

  it('escapa HTML do usuário em texto, negrito e rótulo de link', () => {
    const html = renderInlineHtml(
      '<script>alert(1)</script> **<b>x</b>** [<img src=x onerror=alert(1)>](https://ok.com)',
      ACCENT,
    )

    expect(html).not.toContain('<script')
    expect(html).not.toContain('<b>')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('<strong>&lt;b&gt;x&lt;/b&gt;</strong>')
  })

  it('recusa esquemas perigosos e mantém o texto visível', () => {
    const html = renderInlineHtml('[clique](javascript:alert(1)) e [ok](data:text/html,x)', ACCENT)

    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('href="data:')
    expect(html).toContain('clique')
  })

  it('não deixa aspas escaparem do atributo href', () => {
    const html = renderInlineHtml('[x](https://ok.com/"onmouseover="alert(1))', ACCENT)

    expect(html).not.toMatch(/href="[^"]*"[a-z]/i)
  })

  it('preserva texto sem marcação', () => {
    expect(renderInlineHtml('Olá, Ana! Tudo bem?', ACCENT)).toBe('Olá, Ana! Tudo bem?')
  })

  it('reduz a marcação para texto puro legível', () => {
    expect(richTextToPlain('**Oferta** especial — [clique aqui](https://recrutae.com.br/os)'))
      .toBe('Oferta especial — clique aqui (https://recrutae.com.br/os)')
  })

  it('aponta links com esquema não permitido para a interface avisar', () => {
    expect(hasUnsafeLink('[x](https://ok.com)')).toBe(false)
    expect(hasUnsafeLink('[x](javascript:alert(1))')).toBe(true)
    expect(hasUnsafeLink('texto sem link')).toBe(false)
  })
})

describe('fidelidade preserva a marcação', () => {
  it('rejeita variação que remove negrito ou renomeia o link', async () => {
    const { validateRosVariation } = await import('@/lib/outreach/fidelity')
    const base = 'Conheça o **Recrutaê OS** agora.\n\n[Clique aqui](https://recrutae.com.br/os) para ver.'

    expect(validateRosVariation(base, 'Conheça o Recrutaê OS agora.\n\n[Clique aqui](https://recrutae.com.br/os) para ver.').ok).toBe(false)
    expect(validateRosVariation(base, 'Conheça o **Recrutaê OS** agora.\n\n[Veja aqui](https://recrutae.com.br/os) para ver.').ok).toBe(false)
  })

  it('aceita variação leve que mantém marcação, links e números', async () => {
    const { validateRosVariation } = await import('@/lib/outreach/fidelity')
    const base = 'Conheça o **Recrutaê OS** e reduza o tempo de contratação em 30%.\n\n[Clique aqui](https://recrutae.com.br/os) para conhecer a plataforma completa hoje mesmo.'
    const varied = 'Conheça o **Recrutaê OS** e reduza o tempo de contratação em 30%.\n\n[Clique aqui](https://recrutae.com.br/os) para conhecer a plataforma inteira hoje mesmo.'

    expect(validateRosVariation(base, varied).ok).toBe(true)
  })
})
