export type CandidateStatus =
  | 'pending'
  | 'generating'
  | 'ready'
  | 'approved'
  | 'sending'
  | 'sent'
  | 'failed'

export type CampaignStatus = 'draft' | 'generating' | 'ready' | 'sending' | 'completed'

export type Candidate = {
  id: string
  firstName: string
  lastName: string
  fullName: string
  title: string
  company: string
  email: string
  linkedinUrl: string
  status: CandidateStatus
  generatedSubject: string
  generatedBody: string
  editedSubject: string
  editedBody: string
  sentAt?: string
  errorMessage?: string
  /** Resend message ID returned after a successful send — proof of delivery */
  resendMessageId?: string
  /** Session ID of the tab/browser that sent this email */
  sentBySessionId?: string
  /** Number of send attempts — capped at MAX_SEND_ATTEMPTS */
  sendAttempts: number
}

export type Campaign = {
  id: string
  name: string
  createdAt: string
  status: CampaignStatus
  totalCandidates: number
  approvedCount: number
  sentCount: number
  failedCount: number
}

export type AIProvider = 'openai' | 'groq'

export type CampaignConfig = {
  role: string
  jobDescription: string
  link: string
  hiringCompany: string
  recruiterName: string
  recruiterCompany: string
  recruiterLinkedin: string
  /** Cargo do recrutador — aparece na assinatura do email */
  recruiterRole?: string
  /** Email pessoal do recrutador — usado como Reply-To em todos os emails da campanha */
  replyTo: string
  aiProvider: AIProvider
}

export type SentEmail = {
  id: string
  /** Resend message ID (re_xxx) — used to dedup on sync */
  resendMessageId?: string
  campaignId: string
  campaignName: string
  candidateName: string
  company: string
  email: string
  subject: string
  body: string
  status: 'sent' | 'failed'
  errorMessage?: string
  sentAt: string
  /** Session ID of the tab/browser that triggered the send */
  sentBySessionId?: string
}

/** Email open event received via Resend webhook and stored in Supabase */
export type EmailOpenEvent = {
  id: string
  message_id: string
  campaign_id: string | null
  recipient_email: string | null
  event_type: string
  received_at: string
}

export type GenerateEmailRequest = {
  candidate: Candidate
  role: string
  jobDescription: string
  link: string
  hiringCompany: string
  recruiterName: string
  recruiterCompany: string
  recruiterLinkedin: string
  /** Cargo do recrutador — aparece na assinatura */
  recruiterRole?: string
  aiProvider?: AIProvider
}

export type GenerateEmailResponse = {
  subject: string
  body: string
  error?: string
  quotaExceeded?: boolean
}

export type SendEmailRequest = {
  to: string
  subject: string
  body: string
  candidateName: string
  recruiterName?: string
  recruiterRole?: string
  recruiterCompany?: string
  /** Reply-To header — respostas do candidato vão para este email */
  replyTo?: string
  /** Used server-side for idempotency — prevents duplicate sends */
  campaignId?: string
  /** Used server-side for idempotency — prevents duplicate sends */
  candidateEmail?: string
}

export type SendEmailResponse = {
  success: boolean
  messageId?: string
  error?: string
  /** True if this email was already sent in a previous request */
  alreadySent?: boolean
}
