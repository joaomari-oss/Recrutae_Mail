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
}

const CLIENTS_THEME: BrandTheme = {
  accent: '#F5A623',
  dark: '#1a1a2e',
  label: 'Recrutaê',
  logoAlt: 'Recrutaê',
  outerBackground: '#f5f5f7',
  logoWidth: 100,
  signatureLabelColor: '#F5A623',
  signatureLabelFontSize: 11,
  signatureLabelLetterSpacing: '0.8px',
}

const ROS_THEME: BrandTheme = {
  accent: '#FBB900',
  dark: '#0B0A18',
  label: 'Recrutaê | OS',
  logoAlt: 'Recrutaê | OS',
  outerBackground: '#F4F2ED',
  logoWidth: 58,
  signatureLabelColor: '#0B0A18',
  signatureLabelFontSize: 14,
  signatureLabelLetterSpacing: '0',
}

function safeImageUrl(value: string): string | null {
  const httpUrl = safeHttpUrl(value)
  if (httpUrl) return httpUrl

  return /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(value)
    ? value
    : null
}

function renderBody(body: string, accent: string): string {
  return body.split(/\r?\n/).map((line) => {
    if (!line.trim()) {
      return '<p style="margin:0 0 8px 0;line-height:1.7;">&nbsp;</p>'
    }

    return `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.75;color:#1A1A2E;">${renderInlineHtml(line, accent)}</p>`
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
  const lines = [richTextToPlain(input.body.trim()), '', input.recruiterName || theme.label]

  if (input.recruiterRole.trim()) lines.push(input.recruiterRole.trim())
  lines.push(theme.label)
  if (safeHttpUrl(input.recruiterLinkedin)) lines.push(`LinkedIn: ${input.recruiterLinkedin}`)
  const whatsapp = whatsappUrl(input.recruiterWhatsapp)
  if (safeHttpUrl(whatsapp)) lines.push(`WhatsApp: ${whatsapp}`)
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
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;max-width:600px;margin:0 auto;background-color:#FFFFFF;border-collapse:separate;border-spacing:0;">
  <tr><td style="height:4px;background-color:${theme.dark};font-size:1px;line-height:1px;">&nbsp;</td></tr>
  <tr><td style="padding:36px 40px 32px;font-family:Helvetica,Arial,sans-serif;">${renderBody(input.body, theme.accent)}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:32px;border-top:1px solid #E5E5EA;"><tr><td style="padding-top:22px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="padding-right:14px;vertical-align:middle;">${logo}</td>
        <td style="padding-left:14px;border-left:3px solid ${theme.accent};vertical-align:middle;">
          <p style="margin:0;font-size:15px;line-height:1.3;font-weight:700;color:${theme.dark};">${name}</p>
          ${role ? `<p style="margin:3px 0 0;font-size:13px;line-height:1.4;color:#6B7280;">${role}</p>` : ''}
          <p style="margin:6px 0 0;font-size:${theme.signatureLabelFontSize}px;line-height:1.4;font-weight:700;letter-spacing:${theme.signatureLabelLetterSpacing};color:${theme.signatureLabelColor};">${theme.label}</p>
          ${contacts ? `<p style="margin:7px 0 0;">${contacts}</p>` : ''}
        </td>
      </tr></table>
    </td></tr></table>
  </td></tr>
  <tr><td style="padding:16px 40px;background-color:#F9F9FB;border-top:1px solid #E5E5EA;font-family:Helvetica,Arial,sans-serif;">${unsubscribe}</td></tr>
</table>
</td></tr></table>
</body>
</html>`,
    text: renderText(input, theme),
  }
}
