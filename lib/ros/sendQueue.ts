import type { RosContact } from '@/lib/rosTypes'

/** Status do contato no servidor, como a rota de campanhas devolve. */
export type RosServerContactStatus = {
  id: string
  status: RosContact['status'] | string
  sentAt?: string
  messageId?: string
  errorMessage?: string
}

export const INTERRUPTED_MESSAGE = 'Envio interrompido antes de concluir. Tente novamente.'

/**
 * Contatos que podem ser enviados agora.
 *
 * `sent` é terminal: nem um recarregamento da aba nem um reenvio de falhas o
 * recoloca aqui. `sending` fica de fora porque uma tentativa pode estar em voo.
 */
export function getRosSendQueue(contacts: RosContact[]): RosContact[] {
  return contacts.filter((contact) => contact.status === 'approved' || contact.status === 'failed')
}

/**
 * Ao reabrir a aba, um contato preso em `sending` só pode ser rebaixado depois
 * de confrontar o servidor: o envio pode ter concluído com a aba fechada.
 * Sem resposta sobre ele, nada muda — é melhor bloquear do que duplicar.
 */
export function reconcileSendingContacts(
  contacts: RosContact[],
  serverStatuses: RosServerContactStatus[],
): Array<{ id: string; updates: Partial<RosContact> }> {
  const byId = new Map(serverStatuses.map((row) => [row.id, row]))

  const updates: Array<{ id: string; updates: Partial<RosContact> }> = []

  for (const contact of contacts) {
    if (contact.status !== 'sending') continue
    const server = byId.get(contact.id)
    if (!server) continue

    if (server.status === 'sent') {
      updates.push({
        id: contact.id,
        updates: {
          status: 'sent' as const,
          sentAt: server.sentAt,
          resendMessageId: server.messageId,
        },
      })
      continue
    }
    // Ainda `sending` no servidor: a tentativa pode estar em voo, não mexer.
    if (server.status === 'sending') continue

    // O motivo real do servidor explica melhor do que a mensagem genérica.
    updates.push({
      id: contact.id,
      updates: { status: 'failed' as const, errorMessage: server.errorMessage || INTERRUPTED_MESSAGE },
    })
  }

  return updates
}

/** Motivo fixo para contato bloqueado por supressão — o resumo conta por ele. */
export const SUPPRESSED_MESSAGE = 'Endereço descadastrado ou suprimido — não recebeu o e-mail.'
