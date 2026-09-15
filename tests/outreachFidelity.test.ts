import { describe, expect, it } from 'vitest'
import { validateRosVariation } from '@/lib/outreach/fidelity'

describe('fidelidade ROS', () => {
  const base = 'Olá, Ana!\n\nConheça o ROS em https://recrutae.com.br/ros.\n\nPodemos conversar por 15 minutos?'

  it('aceita uma variação lexical abaixo do limite', () => {
    const source = 'Olá, Ana! Conheça a solução ROS para a sua equipe hoje. Podemos conversar sobre isso quando for melhor para você?'
    const variation = 'Olá, Ana! Conheça a solução ROS para sua equipe hoje. Podemos conversar sobre isso quando for melhor para você?'

    expect(validateRosVariation(source, variation)).toEqual({ ok: true, changeRatio: expect.any(Number) })
  })

  it('rejeita mudança de URL e número', () => {
    expect(validateRosVariation(base, base.replace('/ros', '/precos')).ok).toBe(false)
    expect(validateRosVariation(base, base.replace('15', '30')).ok).toBe(false)
    expect(validateRosVariation('O investimento é de 15%.', 'O investimento é de 15.').ok).toBe(false)
    expect(validateRosVariation('O investimento é de 15%.', 'O investimento é de -15%.').ok).toBe(false)
    expect(validateRosVariation('O investimento é de 15%.', 'O investimento é de −15%.').ok).toBe(false)
  })

  it('rejeita parágrafos e CTA alterados mesmo dentro do limite lexical', () => {
    const source = 'Olá, Ana!\n\nConheça o ROS para seu time.\n\nGostaria muito de saber se podemos conversar por 15 minutos ainda nesta semana?'
    const alteredCta = 'Olá, Ana!\n\nConheça o ROS para seu time.\n\nGostaria muito de saber se podemos responder por 15 minutos ainda nesta semana?'

    expect(validateRosVariation(source, alteredCta)).toMatchObject({ ok: false, reason: expect.stringMatching(/CTA/) })
    expect(validateRosVariation(source, source.replace('\n\n', '\n')).ok).toBe(false)
  })

  it('rejeita negação inserida na cláusula de CTA mesmo abaixo de 8%', () => {
    const source = 'Olá Ana esta mensagem preserva todos os detalhes importantes do ROS para sua equipe nesta semana. Podemos conversar amanhã?'
    const negated = 'Olá Ana esta mensagem preserva todos os detalhes importantes do ROS para sua equipe nesta semana. Podemos não conversar amanhã?'

    expect(validateRosVariation(source, negated)).toMatchObject({ ok: false, reason: expect.stringMatching(/CTA/) })
  })

  it('calcula duas mudanças em vinte palavras portuguesas como 10%', () => {
    const source = 'ação órgão função solução posição conexão coração informação decisão reunião atenção operação condição relação gestão produção previsão avaliação comunicação situação'
    const generated = 'teste prova função solução posição conexão coração informação decisão reunião atenção operação condição relação gestão produção previsão avaliação comunicação situação'

    const result = validateRosVariation(source, generated)
    expect(result.ok).toBe(false)
    expect(result.changeRatio).toBeCloseTo(0.1)
  })
})
