export type VariationCheck =
  | { ok: true; changeRatio: number }
  | { ok: false; changeRatio: number; reason: string }

const TOKEN_RE = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu
const URL_RE = /https?:\/\/[^\s<>)\]}]+/gi
const NUMBER_RE = /(?<![\p{L}\p{N}])\d+(?:[.,]\d+)?%?(?![\p{L}\p{N}])/gu

function normalizedTokens(text: string): string[] {
  return (text.normalize('NFD').match(TOKEN_RE) ?? [])
    .map((token) => token.replace(/[\u0300-\u036f]/g, '').toLowerCase())
}

function urls(text: string): string[] {
  return (text.match(URL_RE) ?? []).map((url) => url.replace(/[.,;:!?]+$/, ''))
}

function numbers(text: string): string[] {
  return text.match(NUMBER_RE) ?? []
}

function paragraphs(text: string): string[] {
  return text.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean)
}

function lcsLength(left: string[], right: string[]): number {
  let previous = new Array(right.length + 1).fill(0)

  for (const leftToken of left) {
    const current = new Array(right.length + 1).fill(0)
    for (let index = 1; index <= right.length; index += 1) {
      current[index] = leftToken === right[index - 1]
        ? previous[index - 1] + 1
        : Math.max(previous[index], current[index - 1])
    }
    previous = current
  }

  return previous[right.length]
}

type CtaAction = 'meeting' | 'reply' | 'share'

function ctaActions(text: string): CtaAction[] {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const actions: CtaAction[] = []
  if (/\b(convers|falar|call|reuniao|agend)/.test(normalized)) actions.push('meeting')
  if (/\b(respond|resposta|retorn)/.test(normalized)) actions.push('reply')
  if (/\b(indic|compartilh)/.test(normalized)) actions.push('share')
  return actions
}

function sameList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function ctaStructureMatches(base: string, generated: string): boolean {
  const baseActions = ctaActions(base)
  const generatedActions = ctaActions(generated)
  if (!sameList(baseActions, generatedActions)) return false

  const questionCount = (text: string) => (text.match(/\?/g) ?? []).length
  return questionCount(base) === questionCount(generated)
}

/**
 * Garante que a variação gerada não altere o conteúdo que o recrutador aprovou.
 * O LCS mede mudança lexical, enquanto invariantes impedem que links, números,
 * parágrafos e CTA sejam modificados mesmo em uma alteração curta.
 */
export function validateRosVariation(
  base: string,
  generated: string,
  maxChangeRatio = 0.08
): VariationCheck {
  const source = base.trim()
  const candidate = generated.trim()
  const sourceTokens = normalizedTokens(source)
  const generatedTokens = normalizedTokens(candidate)

  if (!source || !candidate || !sourceTokens.length || !generatedTokens.length) {
    return { ok: false, changeRatio: 1, reason: 'texto vazio' }
  }

  const unchanged = lcsLength(sourceTokens, generatedTokens)
  const changeRatio = 1 - unchanged / Math.max(sourceTokens.length, generatedTokens.length)

  if (!sameList(urls(source), urls(candidate))) {
    return { ok: false, changeRatio, reason: 'URLs foram alteradas' }
  }
  if (!sameList(numbers(source), numbers(candidate))) {
    return { ok: false, changeRatio, reason: 'números foram alterados' }
  }
  if (paragraphs(source).length !== paragraphs(candidate).length) {
    return { ok: false, changeRatio, reason: 'quantidade de parágrafos foi alterada' }
  }
  if (!ctaStructureMatches(source, candidate)) {
    return { ok: false, changeRatio, reason: 'CTA teve significado ou estrutura alterados' }
  }
  if (changeRatio > maxChangeRatio) {
    return { ok: false, changeRatio, reason: `variação lexical excede ${Math.round(maxChangeRatio * 100)}%` }
  }

  return { ok: true, changeRatio }
}
