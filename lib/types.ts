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
  aiProvider: AIProvider
}

export type SentEmail = {
  id: string
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
}

export type SendEmailResponse = {
  success: boolean
  messageId?: string
  error?: string
}
