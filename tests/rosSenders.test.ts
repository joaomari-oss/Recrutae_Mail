import { describe, expect, it } from 'vitest'
import { DEFAULT_ROS_SENDER, isRosSenderEmail, listRosSenderOptions } from '@/lib/ros/senders'

describe('remetentes da divulgação', () => {
  it('aceita apenas endereços do domínio verificado', () => {
    expect(isRosSenderEmail('contato@recrutae.com.br')).toBe(true)
    expect(isRosSenderEmail('  Joao@Recrutae.com.br ')).toBe(true)
    expect(isRosSenderEmail('joao@recrutae.net.br')).toBe(false)
    expect(isRosSenderEmail('joao@gmail.com')).toBe(false)
    expect(isRosSenderEmail('joao@sub.recrutae.com.br')).toBe(false)
    expect(isRosSenderEmail('')).toBe(false)
  })

  it('monta a lista a partir do ambiente, sem inventar caixas', () => {
    expect(listRosSenderOptions({
      ROS_SENDER_OPTIONS: 'comercial@recrutae.com.br, Parcerias@Recrutae.com.br ,joao@gmail.com',
      ROS_FROM_EMAIL: 'contato@recrutae.com.br',
      RESEND_FROM_EMAIL: 'envio@recrutae.com.br',
    })).toEqual([
      'comercial@recrutae.com.br',
      'parcerias@recrutae.com.br',
      'contato@recrutae.com.br',
      'envio@recrutae.com.br',
    ])
  })

  it('sempre oferece ao menos o remetente padrão', () => {
    expect(listRosSenderOptions({})).toEqual([DEFAULT_ROS_SENDER])
    expect(listRosSenderOptions({ RESEND_FROM_EMAIL: 'outro@dominio.com' })).toEqual([DEFAULT_ROS_SENDER])
  })

  it('não repete o mesmo endereço em caixas diferentes', () => {
    expect(listRosSenderOptions({
      ROS_SENDER_OPTIONS: 'Contato@Recrutae.com.br',
      ROS_FROM_EMAIL: 'contato@recrutae.com.br',
    })).toEqual(['contato@recrutae.com.br'])
  })
})
