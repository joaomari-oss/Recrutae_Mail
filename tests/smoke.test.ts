import { describe, expect, it } from 'vitest'

describe('test harness', () => {
  it('resolves the project alias', async () => {
    const { cn } = await import('@/lib/utils')
    expect(cn('a', false && 'b')).toBe('a')
  })
})
