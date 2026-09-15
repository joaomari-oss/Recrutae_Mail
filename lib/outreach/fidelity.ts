export type VariationCheck =
  | { ok: true; changeRatio: number }
  | { ok: false; changeRatio: number; reason: string }

const TOKEN_RE = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu
const URL_RE = /https?:\/\/[^\s<>)\]}]+/gi
const NUMBER_RE = /(?<![\p{L}\p{N}])[-+−]?\d+(?:[.,]\d+)?%?(?![\p{L}\p{N}])/gu

function normalizedTokens(text: string): string[] {
  const normalized = text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
  return normalized.match(TOKEN_RE) ?? []
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

const CTA_ACTION_RE = /\b(?:convers\w*|falar\w*|call\w*|reuniao\w*|agend\w*|respond\w*|resposta\w*|retorn\w*|indic\w*|compartilh\w*)\b/

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function ctaClauses(text: string): string[][] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(normalizedTokens)
    .filter((tokens) => CTA_ACTION_RE.test(tokens.join(' ')))
}

function ctaStructureMatches(base: string, generated: string): boolean {
  const baseClauses = ctaClauses(base)
  const generatedClauses = ctaClauses(generated)
  if (baseClauses.length !== generatedClauses.length) return false
  if (!baseClauses.every((clause, index) => sameList(clause, generatedClauses[index]))) return false

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
