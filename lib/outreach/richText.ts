/**
 * Marcação mínima do corpo dos e-mails.
 *
 * Só dois recursos, os que o operador realmente pede: negrito `**assim**` e
 * link nomeado `[clique aqui](https://…)`. Nada de HTML cru — o texto do
 * usuário é sempre escapado antes de entrar no documento, e apenas `http:` e
 * `https:` viram âncora. URLs soltas continuam sendo autolinkadas.
 */

const LINK_RE = /\[([^\]\n]*)\]\(([^)\s]+)\)/
const BOLD_RE = /\*\*([^*\n]+)\*\*/
const BARE_URL_RE = /https?:\/\/[^\s<>)\]}]+/
/** Pontuação final não pertence à URL — `veja https://x.com.` não vira href com ponto. */
const TRAILING_PUNCTUATION = /[.,;:!?]+$/

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Valida o esquema e devolve a URL exatamente como foi escrita.
 * `new URL().toString()` normalizaria `https://site.com` para `https://site.com/`,
 * trocando o texto visível por algo que o operador não digitou.
 */
export function safeHttpUrl(value: string): string | null {
  const raw = value.trim()
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' || url.protocol === 'http:' ? raw : null
  } catch {
    return null
  }
}

type Match = { index: number; length: number; render: () => string }

function anchor(url: string, label: string, accent: string): string {
  return `<a href="${escapeHtml(url)}" style="color:${accent};text-decoration:underline;font-weight:600;">${label}</a>`
}

/**
 * Negrito dentro do rótulo de um link. Iterativo de propósito: um rótulo com
 * milhares de marcadores estouraria a pilha numa versão recursiva, e esse texto
 * vem do operador.
 */
function renderBoldOnly(value: string): string {
  let rest = value
  let html = ''
  for (;;) {
    const match = BOLD_RE.exec(rest)
    if (!match) return html + escapeHtml(rest)
    html += escapeHtml(rest.slice(0, match.index)) + `<strong>${escapeHtml(match[1])}</strong>`
    rest = rest.slice(match.index + match[0].length)
  }
}

/** Links (nomeados e soltos) dentro de um trecho em negrito, sem aninhar negrito. */
function renderLinksOnly(value: string, accent: string): string {
  let rest = value
  let html = ''
  for (;;) {
    const link = LINK_RE.exec(rest)
    const bare = BARE_URL_RE.exec(rest)
    const first = link && bare ? (link.index <= bare.index ? 'link' : 'bare') : link ? 'link' : bare ? 'bare' : null
    if (!first) return html + escapeHtml(rest)

    if (first === 'link' && link) {
      const url = safeHttpUrl(link[2])
      const label = link[1].trim()
      html += escapeHtml(rest.slice(0, link.index))
        + (url ? anchor(url, escapeHtml(label) || escapeHtml(url), accent) : escapeHtml(label))
      rest = rest.slice(link.index + link[0].length)
    } else if (bare) {
      const raw = bare[0].replace(TRAILING_PUNCTUATION, '')
      const url = safeHttpUrl(raw)
      html += escapeHtml(rest.slice(0, bare.index))
        + (url ? anchor(url, escapeHtml(url), accent) : escapeHtml(raw))
      rest = rest.slice(bare.index + raw.length)
    }
  }
}

function nextMatch(value: string, accent: string): Match | null {
  const candidates: Match[] = []

  const link = LINK_RE.exec(value)
  if (link) {
    const url = safeHttpUrl(link[2])
    const label = link[1].trim()
    candidates.push({
      index: link.index,
      length: link[0].length,
      // Esquema não permitido: o rótulo continua visível, sem âncora.
      render: () => (url ? anchor(url, renderBoldOnly(label) || escapeHtml(url), accent) : renderBoldOnly(label)),
    })
  }

  const bold = BOLD_RE.exec(value)
  if (bold) {
    candidates.push({
      index: bold.index,
      length: bold[0].length,
      // `**[Clique aqui](url)**` precisa sair como link em negrito; sem isso a
      // marcação apareceria literal e o endereço ficaria morto no e-mail.
      render: () => `<strong>${renderLinksOnly(bold[1], accent)}</strong>`,
    })
  }

  const bare = BARE_URL_RE.exec(value)
  if (bare) {
    const raw = bare[0].replace(TRAILING_PUNCTUATION, '')
    const url = safeHttpUrl(raw)
    candidates.push({
      index: bare.index,
      length: raw.length,
      render: () => (url ? anchor(url, escapeHtml(url), accent) : escapeHtml(raw)),
    })
  }

  if (!candidates.length) return null
  return candidates.reduce((earliest, candidate) =>
    candidate.index < earliest.index ? candidate : earliest)
}

/** Converte uma linha do corpo em HTML seguro, aplicando a marcação suportada. */
export function renderInlineHtml(value: string, accent: string): string {
  let rest = value
  let html = ''

  while (rest) {
    const match = nextMatch(rest, accent)
    if (!match) return html + escapeHtml(rest)
    html += escapeHtml(rest.slice(0, match.index)) + match.render()
    rest = rest.slice(match.index + match.length)
  }

  return html
}

/** Versão text/plain: sem marcadores, com a URL entre parênteses após o rótulo. */
export function richTextToPlain(value: string): string {
  return value
    .replace(/\[([^\]\n]*)\]\(([^)\s]+)\)/g, (_full, label: string, url: string) => {
      const safe = safeHttpUrl(url)
      const text = label.trim().replace(/\*\*/g, '')
      if (!safe) return text
      return text ? `${text} (${safe})` : safe
    })
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
}

/** Há link nomeado com esquema fora de http/https? A interface avisa antes do envio. */
export function hasUnsafeLink(value: string): boolean {
  for (const match of value.matchAll(/\[([^\]\n]*)\]\(([^)\s]+)\)/g)) {
    if (!safeHttpUrl(match[2])) return true
  }
  return false
}
