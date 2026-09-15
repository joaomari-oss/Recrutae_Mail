export type RosContactStatus = 'pending' | 'generating' | 'ready' | 'approved' | 'sending' | 'sent' | 'failed'
export type RosCampaignStatus = 'draft' | 'generating' | 'ready' | 'sending' | 'completed'

export type RosContact = {
  id: string
  firstName: string
  lastName: string
  fullName: string
  email: string
  company: string
  position: string
  status: RosContactStatus
  generatedSubject: string
  generatedBody: string
  editedSubject: string
  editedBody: string
  sentAt?: string
  errorMessage?: string
  resendMessageId?: string
  sendAttempts: number
}

export type RosCampaign = {
  id: string
  name: string
  createdAt: string
  campaignKind: 'ros'
  status: RosCampaignStatus
  totalContacts: number
  approvedCount: number
  sentCount: number
  failedCount: number
}

export type RosCampaignConfig = {
  recruiterName: string
  recruiterRole: string
  recruiterEmail: string
  replyTo: string
  recruiterLinkedin: string
  recruiterWhatsapp: string
  subjectTemplate: string
  emailTemplate: string
  varySubject: boolean
  variationPercent: 5 | 6 | 7 | 8
}

export type GenerateRosEmailRequest = {
  contact: Pick<RosContact, 'id' | 'firstName' | 'lastName' | 'fullName' | 'email' | 'company' | 'position'>
  campaignId?: string
  subjectTemplate: string
  emailTemplate: string
  varySubject: boolean
  variationSeed: number
  aiProvider?: 'openai' | 'groq'
}

export type SendRosEmailRequest = {
  campaignId: string
  contactId: string
  to: string
  subject: string
  body: string
  recruiterName: string
  recruiterRole: string
  recruiterEmail: string
  replyTo: string
  recruiterLinkedin: string
  recruiterWhatsapp: string
}
