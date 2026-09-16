import { describe, expect, it } from 'vitest'
import { getRosSendQueue, reconcileSendingContacts } from '@/lib/ros/sendQueue'
import type { RosContact } from '@/lib/rosTypes'

const base = {
  firstName: '', lastName: '', fullName: '', email: '', company: '', position: '',
  generatedSubject: '', generatedBody: '', editedSubject: '', editedBody: '', sendAttempts: 0,
}

const contact = (id: string, status: RosContact['status']): RosContact => ({ ...base, id, status })

describe('fila de envio ROS', () => {
  it('nunca recoloca contato enviado na fila', () => {
    expect(getRosSendQueue([contact('1', 'sent'), contact('2', 'failed')]))
      .toEqual([expect.objectContaining({ id: '2' })])
  })

  it('envia aprovados e reenvia apenas os que falharam', () => {
    const queue = getRosSendQueue([
      contact('1', 'approved'), contact('2', 'ready'), contact('3', 'failed'),
      contact('4', 'pending'), contact('5', 'sending'), contact('6', 'sent'),
    ])
    expect(queue.map((c) => c.id)).toEqual(['1', '3'])
  })

  it('preserva a ordem original da campanha', () => {
    const queue = getRosSendQueue([contact('c', 'failed'), contact('a', 'approved'), contact('b', 'approved')])
    expect(queue.map((c) => c.id)).toEqual(['c', 'a', 'b'])
  })
})

describe('reconciliação de contatos presos em envio', () => {
  it('confirma no servidor antes de rebaixar para falha', () => {
    const updates = reconcileSendingContacts(
      [contact('1', 'sending'), contact('2', 'sending'), contact('3', 'sending')],
      [
        { id: '1', status: 'sent', sentAt: '2026-09-16T10:00:00Z', messageId: 'm1' },
        { id: '2', status: 'approved' },
        // O contato 3 não voltou do servidor: continua indefinido, não vira falha.
      ],
    )

    expect(updates).toEqual([
      { id: '1', updates: { status: 'sent', sentAt: '2026-09-16T10:00:00Z', resendMessageId: 'm1' } },
      { id: '2', updates: { status: 'failed', errorMessage: 'Envio interrompido antes de concluir. Tente novamente.' } },
    ])
  })

  it('ignora contatos que não estavam em envio', () => {
    expect(reconcileSendingContacts([contact('1', 'approved')], [{ id: '1', status: 'approved' }])).toEqual([])
  })

  it('respeita o servidor quando ele já marcou o contato como enviando', () => {
    expect(reconcileSendingContacts([contact('1', 'sending')], [{ id: '1', status: 'sending' }])).toEqual([])
  })
})
