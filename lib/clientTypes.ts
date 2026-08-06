export type ClientContactStatus =
  | 'pending'
  | 'generating'
  | 'ready'
  | 'approved'
  | 'sending'
  | 'sent'
  | 'failed'

export type ClientContact = {
  id: string
  firstName: string
  lastName: string
  fullName: string
  email: string
  company: string
  position: string
  status: ClientContactStatus
  generatedSubject: string
  generatedBody: string
  editedSubject: string
  editedBody: string
  sentAt?: string
  errorMessage?: string
  resendMessageId?: string
  sendAttempts: number
}

export type ClientCampaign = {
  id: string
  name: string
  createdAt: string
  status: 'draft' | 'generating' | 'ready' | 'sending' | 'completed'
  segment: string
  totalContacts: number
  approvedCount: number
  sentCount: number
  failedCount: number
}

export type ClientCampaignConfig = {
  recruiterName: string
  recruiterEmail: string  /** Cargo do recrutador — aparece na assinatura do email */
  recruiterRole: string
  /** LinkedIn do recrutador — aparece na assinatura do email */
  recruiterLinkedin?: string  /** E-mail pessoal do recrutador — usado como Reply-To nas respostas */
  replyTo: string
  segment: string
  emailTemplate: string
  /** Template base do assunto — a IA faz variação mínima para evitar spam */
  subjectTemplate?: string
}

export const CLIENT_SEGMENTS = [
  'Engineering & Construction (E&C)',
  'Heavy Civil & Infrastructure Concessions',
  'Utilities and Waste Management',
  'Mining & Metals',
  'Energy (Power, Renewables)',
  'Capital Goods – Linha Amarela',
  'Agribusiness & Forestry & Private Education',
  'Financial Services (Banking, Insurance, Fintechs)',
  'Consumer Goods – Linha Branca',
  'Consumer Goods – Linha Marrom',
  'Retail & Omnichannel Commerce',
  'Telecommunications & Connectivity',
  'Media, Entertainment & Content',
  'FMCG (Fast-Moving Consumer Goods)',
  'Technology & Software (B2B / B2C)',
  'Digital Platforms & SaaS',
  'Professional Services & Consulting',
  'Healthcare',
  'Advanced Manufacturing',
  'Facilities Management',
  'Automotive & Mobility',
  'Chemicals & Specialty Chemicals',
  'Pharma, Biotech & Life Sciences',
  'Logistics & Industrial Services',
] as const

export type ClientSegment = (typeof CLIENT_SEGMENTS)[number]

export type GenerateClientEmailRequest = {
  contact: ClientContact
  campaignId?: string
  recruiterName: string
  recruiterEmail: string
  /** Cargo do recrutador */
  recruiterRole?: string
  /** LinkedIn do recrutador */
  recruiterLinkedin?: string
  /** Opcional — sem segmento, o e-mail nao menciona setor algum. */
  segment?: string
  emailTemplate: string
  aiProvider?: 'openai' | 'groq'
  variationSeed?: number
}

export type SaveCampaignRequest = {
  campaign: ClientCampaign
  contacts: ClientContact[]
  config: ClientCampaignConfig
}

export type SaveCampaignResponse = {
  success: boolean
  error?: string
}

export type SendClientEmailRequest = {
  to: string
  subject: string
  body: string
  contactName: string
  recruiterName: string
  recruiterEmail: string
  recruiterRole?: string
  /** E-mail pessoal para Reply-To */
  replyTo?: string
  campaignId?: string
  contactEmail?: string
  contactId?: string
}

export type SendClientEmailResponse = {
  success: boolean
  messageId?: string
  error?: string
  alreadySent?: boolean
}
