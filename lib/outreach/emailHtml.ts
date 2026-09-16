import { escapeHtml, renderInlineHtml, richTextToPlain, safeHttpUrl } from './richText'

export type OutreachEmailInput = {
  body: string
  recruiterName: string
  recruiterRole: string
  recruiterLinkedin: string
  recruiterWhatsapp: string
  brand: 'clients' | 'ros'
  logoUrl: string
  unsubscribeUrl?: string
  /** Assinatura ROS: endereço mostrado como contato. */
  recruiterEmail?: string
  /** Assinatura ROS: emblema circular do modelo. */
  emblemUrl?: string
  /** Assinatura ROS: site exibido na última linha. */
  siteUrl?: string
}

type BrandTheme = {
  accent: string
  dark: string
  label: string
  logoAlt: string
  outerBackground: string
  logoWidth: number
  signatureLabelColor: string
  signatureLabelFontSize: number
  signatureLabelLetterSpacing: string
  /** Pilha tipográfica do corpo — Clientes mantém a que já usava. */
  font: string
  /** Cor dos links no corpo. */
  bodyLinkColor: string
  cardRadius: string
  cardShadow: string
}

const CLIENTS_FONT = `'Helvetica Neue', Helvetica, Arial, sans-serif`
const ROS_FONT = 'Helvetica, Arial, sans-serif'

const CLIENTS_THEME: BrandTheme = {
  accent: '#F5A623',
  dark: '#1a1a2e',
  label: 'Recrutaê',
  logoAlt: 'Recrutaê',
  outerBackground: '#f5f5f7',
  logoWidth: 100,
  signatureLabelColor: '#F5A623',
  signatureLabelFontSize: 11,
  signatureLabelLetterSpacing: '1px',
  font: CLIENTS_FONT,
  bodyLinkColor: '#E8603A',
  cardRadius: '12px',
  cardShadow: '0 1px 3px rgba(0,0,0,0.08)',
}

const ROS_THEME: BrandTheme = {
  accent: '#FBB900',
  dark: '#211E43',
  label: 'Recrutaê | OS',
  logoAlt: 'Recrutaê | OS',
  outerBackground: '#F4F2ED',
  logoWidth: 58,
  signatureLabelColor: '#211E43',
  signatureLabelFontSize: 14,
  signatureLabelLetterSpacing: '0',
  font: ROS_FONT,
  bodyLinkColor: '#FBB900',
  cardRadius: '0',
  cardShadow: 'none',
}

const ROS_SITE_URL = 'https://www.recrutaeos.com.br'

/** `5511979796154` -> `+55 11 97979-6154`, como no modelo da assinatura. */
function formatBrazilianPhone(digits: string): string {
  const clean = digits.replace(/\D/g, '')
  const match = /^(\d{2})(\d{2})(\d{4,5})(\d{4})$/.exec(clean)
  if (!match) return clean ? `+${clean}` : ''
  const [, country, area, prefix, suffix] = match
  return `+${country} ${area} ${prefix}-${suffix}`
}

/**
 * Assinatura ROS no modelo aprovado: sobrancelha `rOS / RECRUTAÊ OPERATING
 * SYSTEM` sobre um filete, emblema à esquerda, barra âmbar e, à direita, nome,
 * cargo e os contatos. Só os dados mudam.
 */
function renderRosSignature(input: OutreachEmailInput, theme: BrandTheme): string {
  const name = escapeHtml(input.recruiterName.trim() || theme.label)
  const role = escapeHtml(input.recruiterRole.trim())
  const emblem = safeImageUrl(input.emblemUrl ?? '') ?? safeImageUrl(input.logoUrl)
  const phone = formatBrazilianPhone(input.recruiterWhatsapp)
  const email = input.recruiterEmail?.trim() ?? ''
  const site = safeHttpUrl(input.siteUrl ?? ROS_SITE_URL) ?? ROS_SITE_URL
  const siteLabel = site.replace(/^https?:\/\//i, '').replace(/\/$/, '')
  const linkedin = safeHttpUrl(input.recruiterLinkedin)

  const contactLine = (content: string) =>
    `<p style="margin:0 0 4px;font-family:${theme.font};font-size:13px;line-height:1.7;color:#4B4A63;">${content}</p>`

  const contacts = [
    phone ? contactLine(escapeHtml(phone)) : '',
    email ? contactLine(`<a href="mailto:${escapeHtml(email)}" style="color:#4B4A63;text-decoration:none;">${escapeHtml(email)}</a>`) : '',
    contactLine(`<a href="${escapeHtml(site)}" style="color:#4B4A63;text-decoration:none;">${escapeHtml(siteLabel)}</a>`),
    linkedin ? contactLine(`<a href="${escapeHtml(linkedin)}" style="color:#4B4A63;text-decoration:none;">LinkedIn</a>`) : '',
  ].filter(Boolean).join('')

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:34px;">
      <tr><td style="padding-bottom:8px;border-bottom:1px solid #D9D7D0;">
        <span style="font-family:'Courier New',Courier,monospace;font-size:10px;letter-spacing:2px;color:${theme.dark};">rOS</span><span style="font-family:'Courier New',Courier,monospace;font-size:10px;letter-spacing:2px;color:#9A98A8;">&nbsp;&nbsp;/&nbsp;&nbsp;RECRUTAÊ OPERATING SYSTEM</span>
      </td></tr>
      <tr><td style="padding-top:20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          ${emblem ? `<td style="padding-right:22px;vertical-align:middle;"><img src="${escapeHtml(emblem)}" alt="${theme.logoAlt}" width="72" style="display:block;border:0;width:72px;height:auto;max-width:72px;" /></td>` : ''}
          <td style="padding-left:22px;border-left:2px solid ${theme.accent};vertical-align:middle;">
            <p style="margin:0;font-family:${theme.font};font-size:21px;line-height:1.25;color:${theme.dark};">${name}</p>
            ${role ? `<p style="margin:3px 0 0;font-family:${theme.font};font-size:13px;line-height:1.5;color:#8A889B;">${role}</p>` : ''}
            <div style="height:14px;line-height:14px;font-size:1px;">&nbsp;</div>
            ${contacts}
          </td>
        </tr></table>
      </td></tr>
    </table>`
}

function safeImageUrl(value: string): string | null {
  const httpUrl = safeHttpUrl(value)
  if (httpUrl) return httpUrl

  return /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(value)
    ? value
    : null
}

function renderBody(body: string, theme: BrandTheme): string {
  return body.split(/\r?\n/).map((line) => {
    if (!line.trim()) {
      return `<p style="margin:0 0 8px 0;font-family:${theme.font};line-height:1.7;">&nbsp;</p>`
    }

    return `<p style="margin:0 0 16px 0;font-family:${theme.font};font-size:15px;line-height:1.75;color:${theme.dark};">${renderInlineHtml(line, theme.bodyLinkColor)}</p>`
  }).join('')
}

/**
 * A composição guarda o WhatsApp só com dígitos; o link precisa de um endereço.
 * Sem esta conversão o contato some da assinatura sem nenhum aviso.
 */
function whatsappUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const digits = trimmed.replace(/\D/g, '')
  return /^https?:\/\//i.test(trimmed) ? trimmed : digits ? `https://wa.me/${digits}` : ''
}

function renderOptionalLink(label: string, value: string, accent: string): string {
  const url = safeHttpUrl(value)
  if (!url) return ''

  const escapedUrl = escapeHtml(url)
  return `<a href="${escapedUrl}" style="color:${accent};text-decoration:none;font-size:12px;line-height:1.6;">${label}</a>`
}

function renderText(input: OutreachEmailInput, theme: BrandTheme): string {
  const lines = [richTextToPlain(input.body.trim()), '']

  if (input.brand === 'ros') {
    lines.push('rOS / RECRUTAÊ OPERATING SYSTEM', '')
    lines.push(input.recruiterName.trim() || theme.label)
    if (input.recruiterRole.trim()) lines.push(input.recruiterRole.trim())
    const phone = formatBrazilianPhone(input.recruiterWhatsapp)
    if (phone) lines.push(phone)
    if (input.recruiterEmail?.trim()) lines.push(input.recruiterEmail.trim())
    const site = safeHttpUrl(input.siteUrl ?? ROS_SITE_URL) ?? ROS_SITE_URL
    lines.push(site.replace(/^https?:\/\//i, '').replace(/\/$/, ''))
    if (safeHttpUrl(input.recruiterLinkedin)) lines.push(`LinkedIn: ${input.recruiterLinkedin}`)
  } else {
    lines.push(input.recruiterName || theme.label)
    if (input.recruiterRole.trim()) lines.push(input.recruiterRole.trim())
    lines.push(theme.label)
    if (safeHttpUrl(input.recruiterLinkedin)) lines.push(`LinkedIn: ${input.recruiterLinkedin}`)
    const whatsapp = whatsappUrl(input.recruiterWhatsapp)
    if (safeHttpUrl(whatsapp)) lines.push(`WhatsApp: ${whatsapp}`)
  }

  if (safeHttpUrl(input.unsubscribeUrl ?? '')) lines.push('', `Descadastrar: ${input.unsubscribeUrl}`)

  return lines.join('\n')
}

/**
 * Renders the single email layout used by Clientes and Divulgação ROS.
 * All content potentially entered by users is escaped before insertion into HTML.
 */
export function renderOutreachEmail(input: OutreachEmailInput): { html: string; text: string } {
  const theme = input.brand === 'ros' ? ROS_THEME : CLIENTS_THEME
  const name = escapeHtml(input.recruiterName.trim() || theme.label)
  const role = escapeHtml(input.recruiterRole.trim())
  const logoUrl = safeImageUrl(input.logoUrl)
  const unsubscribeUrl = safeHttpUrl(input.unsubscribeUrl ?? '')
  const logo = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${theme.logoAlt}" width="${theme.logoWidth}" style="display:block;border:0;width:${theme.logoWidth}px;height:auto;max-width:${theme.logoWidth}px;" />`
    : `<span style="font-size:14px;font-weight:700;color:${theme.dark};">${theme.label}</span>`
  const contacts = [
    renderOptionalLink('LinkedIn', input.recruiterLinkedin, theme.accent),
    renderOptionalLink('WhatsApp', whatsappUrl(input.recruiterWhatsapp), theme.accent),
  ].filter(Boolean).join('<span style="padding:0 6px;color:#9CA3AF;">·</span>')

  const signature = input.brand === 'ros' ? renderRosSignature(input, theme) : `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:32px;border-top:1px solid #E5E5EA;"><tr><td style="padding-top:22px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="padding-right:14px;vertical-align:middle;">${logo}</td>
        <td style="padding-left:14px;border-left:3px solid ${theme.accent};vertical-align:middle;">
          <p style="margin:0;font-family:${theme.font};font-size:15px;line-height:1.3;font-weight:700;color:${theme.dark};">${name}</p>
          ${role ? `<p style="margin:3px 0 0;font-family:${theme.font};font-size:13px;line-height:1.4;color:#6B7280;">${role}</p>` : ''}
          ${name === escapeHtml(theme.label) ? '' : `<p style="margin:6px 0 0;font-family:${theme.font};font-size:${theme.signatureLabelFontSize}px;line-height:1.4;font-weight:700;letter-spacing:${theme.signatureLabelLetterSpacing};text-transform:uppercase;color:${theme.signatureLabelColor};">${theme.label}</p>`}
          ${contacts ? `<p style="margin:7px 0 0;">${contacts}</p>` : ''}
        </td>
      </tr></table>
    </td></tr></table>`

  const unsubscribe = unsubscribeUrl
    ? `<p style="margin:12px 0 0;font-size:11px;line-height:1.5;color:#6B7280;text-align:center;">Não quer mais receber estes e-mails? <a href="${escapeHtml(unsubscribeUrl)}" style="color:${theme.accent};text-decoration:underline;">Descadastre-se</a>.</p>`
    : input.brand === 'clients'
      ? '<p style="margin:0;font-size:11px;line-height:1.5;color:#6B7280;text-align:center;">Você recebeu este email pois seu perfil foi identificado como relevante.<br />Para não receber mais emails, responda com "cancelar".</p>'
      : '<p style="margin:0;font-size:11px;line-height:1.5;color:#6B7280;text-align:center;">Você recebeu este e-mail pois seu perfil foi identificado como relevante.</p>'

  return {
    html: `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="x-apple-disable-message-reformatting" />
</head>
<body style="margin:0;padding:0;background-color:${theme.outerBackground};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background-color:${theme.outerBackground};"><tr><td style="padding:32px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;max-width:600px;margin:0 auto;background-color:#FFFFFF;border-collapse:separate;border-spacing:0;border-radius:${theme.cardRadius};overflow:hidden;box-shadow:${theme.cardShadow};">
  <tr><td style="height:4px;background-color:${theme.dark};font-size:1px;line-height:1px;">&nbsp;</td></tr>
  <tr><td style="padding:36px 40px 32px;font-family:${theme.font};">${renderBody(input.body, theme)}
    ${signature}
  </td></tr>
  <tr><td style="padding:16px 40px;background-color:#F9F9FB;border-top:1px solid #E5E5EA;font-family:${theme.font};">${unsubscribe}</td></tr>
</table>
</td></tr></table>
</body>
</html>`,
    text: renderText(input, theme),
  }
}
