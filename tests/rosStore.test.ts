import { beforeEach, describe, expect, it } from 'vitest'
import { useRosStore } from '@/store/rosStore'

describe('useRosStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useRosStore.setState({ campaigns: [], activeCampaignId: null, contactsByCampaign: {}, campaignConfigById: {} })
  })

  it('isola a campanha e impede regressão de contato enviado', () => {
    const id = useRosStore.getState().createCampaign('ROS setembro', [{
      id: 'contact-1', firstName: 'Ana', lastName: '', fullName: 'Ana',
      email: 'ana@example.com', company: 'ACME', position: '', status: 'pending',
      generatedSubject: '', generatedBody: '', editedSubject: '', editedBody: '', sendAttempts: 0,
    }], {
      recruiterName: 'João', recruiterRole: 'Comercial', recruiterEmail: 'contato@recrutae.com.br',
      replyTo: 'contato@recrutae.com.br', recruiterLinkedin: '', recruiterWhatsapp: '',
      subjectTemplate: 'Conheça o ROS', emailTemplate: 'Olá, {{nome}}', varySubject: false, variationPercent: 6,
    })
    useRosStore.getState().updateContact(id, 'contact-1', { status: 'sent' })
    useRosStore.getState().updateContact(id, 'contact-1', { status: 'failed' })
    expect(useRosStore.getState().contactsByCampaign[id][0].status).toBe('sent')
    expect(localStorage.getItem('recrutae-clients-v1')).toBeNull()
  })
})
