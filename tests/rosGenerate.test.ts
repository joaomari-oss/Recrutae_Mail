import { describe, expect, it, vi } from 'vitest'
import { personalizeRosEmail } from '@/lib/ros/generate'

const request = {
  contact: { id: 'contact-1', firstName: 'Ana', fullName: 'Ana', email: 'ana@example.com', company: '', position: '' },
  subjectTemplate: 'ROS para {{nome}}',
  emailTemplate: 'Olá, {{nome}}. Podemos conversar?',
  varySubject: false,
  variationSeed: 1,
} as const

describe('personalizeRosEmail', () => {
  it('usa o template preenchido quando a IA excede 8%', async () => {
    const result = await personalizeRosEmail(request, {
      callProvider: vi.fn().mockResolvedValue(JSON.stringify({ subject: 'Outro', body: 'Uma mensagem completamente diferente e inventada.' })),
    })

    expect(result.body).toBe('Olá, Ana. Podemos conversar?')
    expect(result.templateEnforced).toBe(true)
    expect(result.subject).toBe('ROS para Ana')
  })

  it('mantém o assunto preenchido sem variação e pede temperatura ROS ao provedor', async () => {
    const callProvider = vi.fn().mockResolvedValue(JSON.stringify({
      subject: 'Assunto ignorado',
      body: 'Olá, Ana! Esta é uma mensagem um pouco mais longa para manter a mesma intenção. Podemos conversar?',
    }))

    const result = await personalizeRosEmail({
      ...request,
      emailTemplate: 'Olá, {{nome}}! Esta é uma mensagem um pouco mais longa para manter a mesma intenção. Podemos conversar?',
    }, { callProvider })

    expect(result.subject).toBe('ROS para Ana')
    expect(callProvider).toHaveBeenCalledWith('openai', expect.objectContaining({ temperature: 0.35 }))
  })

  it('retorna o template preenchido em falha de provedor ou JSON inválido', async () => {
    const providerFailure = await personalizeRosEmail(request, { callProvider: vi.fn().mockRejectedValue(new Error('offline')) })
    const malformedJson = await personalizeRosEmail(request, { callProvider: vi.fn().mockResolvedValue('não é JSON') })

    expect(providerFailure).toMatchObject({ body: 'Olá, Ana. Podemos conversar?', subject: 'ROS para Ana', aiUnavailable: true })
    expect(malformedJson).toMatchObject({ body: 'Olá, Ana. Podemos conversar?', subject: 'ROS para Ana', aiUnavailable: true })
  })

  it('preserva o resultado quando o fallback troca OpenAI por Groq', async () => {
    const callProvider = vi.fn(async (provider: 'openai' | 'groq') => {
      if (provider === 'openai') throw new Error('quota exceeded')
      return JSON.stringify({ subject: 'ROS para Ana', body: 'Olá, Ana. Podemos conversar?' })
    })
    const runWithFallback = async (
      provider: 'openai' | 'groq',
      run: (candidate: 'openai' | 'groq') => Promise<string>
    ) => {
      try {
        return { result: await run(provider), usedProvider: provider, didFallback: false } as const
      } catch {
        return { result: await run('groq'), usedProvider: 'groq' as const, didFallback: true }
      }
    }

    const result = await personalizeRosEmail(request, { callProvider, runWithFallback })

    expect(result).toMatchObject({ body: 'Olá, Ana. Podemos conversar?', usedProvider: 'groq', didFallback: true })
    expect(callProvider).toHaveBeenNthCalledWith(1, 'openai', expect.any(Object))
    expect(callProvider).toHaveBeenNthCalledWith(2, 'groq', expect.any(Object))
  })
})
