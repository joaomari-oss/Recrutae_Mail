# Plano de Ação — Multi-Usuário com Login Compartilhado

> **Contexto:** Múltiplos recrutadores acessam o Recrutaê Mail com o mesmo login. Não há backend/banco de dados — apenas localStorage + API routes do Next.js. Este documento é um plano de ação completo para garantir estabilidade, segurança e ausência de conflitos nessa arquitetura.

---

## Índice

1. [Análise de Riscos](#1-análise-de-riscos)
2. [Estratégia de Isolamento de Dados](#2-estratégia-de-isolamento-de-dados)
3. [Controle de Concorrência (CRÍTICO)](#3-controle-de-concorrência-crítico)
4. [Sistema de Segurança de Envio](#4-sistema-de-segurança-de-envio)
5. [Estratégia de Gerenciamento de Estado](#5-estratégia-de-gerenciamento-de-estado)
6. [Controle de Sessão](#6-controle-de-sessão)
7. [Hardening de Segurança](#7-hardening-de-segurança)
8. [Tratamento de Erros](#8-tratamento-de-erros)
9. [Plano de Implementação Mínimo](#9-plano-de-implementação-mínimo)

---

## 1. Análise de Riscos

### 1.1 Sobrescrita de Dados (CRÍTICO)

| Risco | Severidade | Probabilidade |
|-------|-----------|---------------|
| Usuário A cria campanha, Usuário B abre app → localStorage de B não tem a campanha de A | **Alta** | **Certa** |
| Usuário A edita e-mail, Usuário B edita o mesmo e-mail → último a salvar vence | **Alta** | **Alta** |
| Zustand `persist` serializa toda a store → qualquer write sobrescreve o estado inteiro de outro usuário no mesmo navegador | **Alta** | **Certa (mesmo navegador)** |

**Causa raiz:** localStorage é **por-origem** (domínio + porta), NÃO por sessão ou por aba. Todos os usuários no mesmo navegador/domínio compartilham exatamente o mesmo localStorage. Usuários em navegadores diferentes (ou máquinas diferentes) têm localStorage completamente isolados, ou seja, **não veem as campanhas um do outro**.

### 1.2 Conflitos de Uso Simultâneo

| Risco | Severidade | Probabilidade |
|-------|-----------|---------------|
| Duas abas no mesmo navegador: ambas leem o estado, ambas escrevem → race condition | **Alta** | **Alta** |
| Duas máquinas diferentes: localStorage separado, mas ambos chamam `/api/send` para o mesmo candidato | **Crítica** | **Média** |
| Usuário inicia envio, fecha aba → estado fica em `sending` para sempre | **Média** | **Alta** |

### 1.3 Envio Duplicado de E-mails (CRÍTICO)

| Risco | Severidade | Probabilidade |
|-------|-----------|---------------|
| Usuário A clica "Enviar" → rede lenta → clica de novo → 2 chamadas `/api/send` para o mesmo candidato | **Crítica** | **Média** |
| Dois usuários em máquinas diferentes enviam a mesma campanha (re-import do CSV com mesmos e-mails) | **Crítica** | **Média** |
| Retry após falha de rede, mas o e-mail já foi enviado pelo Resend (resposta perdida) | **Alta** | **Baixa** |

### 1.4 Estado Inconsistente na UI

| Risco | Severidade | Probabilidade |
|-------|-----------|---------------|
| Aba 1 muda candidato para `sent`, Aba 2 ainda mostra `approved` | **Média** | **Certa (multi-aba)** |
| localStorage atualizado por Aba 1, Zustand da Aba 2 não rehydrata automaticamente | **Média** | **Certa** |
| Página `/sent` mostra contagem diferente do `/campaigns` | **Baixa** | **Média** |

### 1.5 Limitações do localStorage

| Limitação | Impacto |
|-----------|---------|
| ~5-10 MB por origem | Limite atingido com ~50-100 campanhas grandes (500+ candidatos cada) |
| Síncrono — bloqueia thread principal | Lentidão em stores grandes |
| Sem expiração automática | Dados acumulam indefinidamente |
| Sem controle de concorrência nativo | Impossível fazer lock atômico |
| Acessível via DevTools | Qualquer pessoa com acesso ao navegador vê tudo |

### 1.6 Vulnerabilidades de Segurança

| Vulnerabilidade | Severidade |
|----------------|-----------|
| API routes `/api/send` e `/api/generate` são públicas — qualquer pessoa com a URL pode chamar | **Crítica** |
| Sem rate limiting → abuso para spam em massa | **Crítica** |
| API keys (Resend, OpenAI) em `.env.local` — seguras no server, mas sem proteção contra chamadas externas | **Alta** |
| localStorage legível por qualquer extensão de navegador ou XSS | **Média** |
| Sem auditoria de quem enviou o quê | **Média** |

---

## 2. Estratégia de Isolamento de Dados

### 2.1 Princípio: Isolamento por Campanha

Cada campanha é uma **unidade independente e auto-contida**. Nenhuma operação em uma campanha deve afetar outra. O `campaignId` é a chave primária de tudo.

### 2.2 IDs Únicos Globalmente

**Problema atual:** `campaign-${Date.now()}` pode colidir se dois usuários criarem no mesmo milissegundo.

**Solução:** Usar `crypto.randomUUID()` (disponível em todos os browsers modernos).

```typescript
// ANTES
const id = `campaign-${Date.now()}`

// DEPOIS
const id = `campaign-${crypto.randomUUID()}`
```

Aplicar o mesmo padrão para:
- `candidateId`: já vem do CSV, mas adicionar prefixo de campanha
- `sentEmailId`: usar `crypto.randomUUID()` ao invés de `sent-${Date.now()}-${candidate.id}`

### 2.3 Estrutura de Dados Proposta (Atualizada)

```typescript
// lib/types.ts — Adições

/** Metadata de controle para cada campanha */
type CampaignMeta = {
  /** ID da sessão (aba/navegador) que está controlando o envio */
  sendingSessionId: string | null
  /** Timestamp ISO de quando o lock foi adquirido */
  sendingLockedAt: string | null
  /** Timeout do lock em ms (ex: 5 minutos) */
  sendingLockTimeoutMs: number
}

/** Candidato com tracking de envio */
type Candidate = {
  // ... campos existentes ...

  /** ID único do envio no Resend (prova de que foi enviado) */
  resendMessageId?: string
  /** Hash do conteúdo enviado (para detectar duplicatas) */
  sentContentHash?: string
  /** ID da sessão que realizou o envio */
  sentBySessionId?: string
  /** Número de tentativas de envio */
  sendAttempts: number
}

/** Campanha com metadata de controle */
type Campaign = {
  // ... campos existentes ...
  meta: CampaignMeta
}
```

### 2.4 Separação de Responsabilidades no Store

```
Store Zustand (localStorage "recrutae-v2")
├── campaigns[]                    → Metadata de campanhas
├── candidatesByCampaign{}         → Candidatos indexados por campaignId
├── campaignConfigById{}           → Config de IA/recrutador por campanha
├── sentEmails[]                   → Histórico global de envios
└── sessionId                      → ID único desta sessão (aba/navegador)

Server-side (em memória / Map no processo Node)
├── sendingLocks{}                 → Locks de envio por campanha
├── sentEmailRegistry{}            → Registry de e-mails já enviados (email+campaignId)
└── rateLimitCounters{}            → Contadores de rate limit
```

### 2.5 Deduplicação de Candidatos

Ao importar CSV, verificar se já existe candidato com o **mesmo e-mail** na mesma campanha:

```typescript
function deduplicateCandidates(newCandidates: Candidate[], existing: Candidate[]): Candidate[] {
  const existingEmails = new Set(existing.map(c => c.email.toLowerCase()))
  return newCandidates.filter(c => !existingEmails.has(c.email.toLowerCase()))
}
```

---

## 3. Controle de Concorrência (CRÍTICO)

### 3.1 O Problema Fundamental

localStorage não tem transações atômicas. O Zustand `persist` lê ao iniciar e escreve a cada mudança, mas duas abas podem sobrescrever uma à outra. Além disso, **dois navegadores/máquinas diferentes não compartilham localStorage**, ou seja, podem enviar a mesma campanha em paralelo sem saber.

### 3.2 Solução: Lock de Envio Server-Side (API Route)

Criar um mecanismo de lock **no servidor** (em memória do processo Node) para garantir que apenas uma sessão por vez possa enviar uma campanha.

#### 3.2.1 Nova API Route: `/api/campaign-lock`

```typescript
// app/api/campaign-lock/route.ts

// Map em memória (persiste enquanto o processo estiver rodando)
const locks = new Map<string, { sessionId: string; lockedAt: number; timeoutMs: number }>()

const DEFAULT_LOCK_TIMEOUT = 5 * 60 * 1000 // 5 minutos

export async function POST(req: NextRequest) {
  const { campaignId, sessionId, action } = await req.json()

  if (action === 'acquire') {
    const existing = locks.get(campaignId)
    const now = Date.now()

    // Se já está locked por outra sessão e não expirou
    if (existing && existing.sessionId !== sessionId) {
      if (now - existing.lockedAt < existing.timeoutMs) {
        return NextResponse.json({
          success: false,
          error: 'Campanha está sendo enviada por outro usuário.',
          lockedBy: existing.sessionId,
          lockedAt: new Date(existing.lockedAt).toISOString(),
        }, { status: 409 }) // Conflict
      }
      // Lock expirado → libera
    }

    locks.set(campaignId, { sessionId, lockedAt: now, timeoutMs: DEFAULT_LOCK_TIMEOUT })
    return NextResponse.json({ success: true, lockedUntil: new Date(now + DEFAULT_LOCK_TIMEOUT).toISOString() })
  }

  if (action === 'release') {
    const existing = locks.get(campaignId)
    if (existing?.sessionId === sessionId) {
      locks.delete(campaignId)
    }
    return NextResponse.json({ success: true })
  }

  if (action === 'heartbeat') {
    const existing = locks.get(campaignId)
    if (existing?.sessionId === sessionId) {
      existing.lockedAt = Date.now() // renova
      return NextResponse.json({ success: true })
    }
    return NextResponse.json({ success: false, error: 'Lock não pertence a esta sessão.' }, { status: 403 })
  }

  return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })
}
```

#### 3.2.2 Fluxo de Envio com Lock

```
1. Usuário clica "Enviar Todos"
2. Client gera/usa sessionId (crypto.randomUUID(), armazenado na sessão)
3. POST /api/campaign-lock { campaignId, sessionId, action: 'acquire' }
   ├── 200 OK → prossegue
   └── 409 Conflict → mostra toast "Campanha sendo enviada por outro usuário"
4. Inicia loop de envio
5. A cada 60 segundos: POST /api/campaign-lock { action: 'heartbeat' }
6. Ao finalizar: POST /api/campaign-lock { action: 'release' }
7. Se aba fechar sem release → lock expira em 5 minutos automaticamente
```

#### 3.2.3 Heartbeat no Client

```typescript
// No SendingPage, durante o envio
useEffect(() => {
  if (!isSending || !campaignId) return

  const interval = setInterval(async () => {
    try {
      await fetch('/api/campaign-lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId,
          sessionId: getSessionId(),
          action: 'heartbeat',
        }),
      })
    } catch { /* se falhar, o lock expira naturalmente */ }
  }, 60_000)

  return () => clearInterval(interval)
}, [isSending, campaignId])
```

### 3.3 Proteção Multi-Aba (Mesmo Navegador)

Para múltiplas abas no **mesmo** navegador (compartilham localStorage):

#### 3.3.1 BroadcastChannel API

```typescript
// lib/broadcast.ts

const CHANNEL_NAME = 'recrutae-sync'

export function createBroadcast() {
  if (typeof window === 'undefined') return null
  return new BroadcastChannel(CHANNEL_NAME)
}

export type SyncMessage =
  | { type: 'CAMPAIGN_SENDING_STARTED'; campaignId: string; sessionId: string }
  | { type: 'CAMPAIGN_SENDING_FINISHED'; campaignId: string }
  | { type: 'CANDIDATE_STATUS_CHANGED'; campaignId: string; candidateId: string; status: string }
  | { type: 'STORE_UPDATED'; timestamp: number }
```

#### 3.3.2 Zustand com Sync entre Abas

```typescript
// No store, escutar mensagens do BroadcastChannel:
if (typeof window !== 'undefined') {
  const channel = new BroadcastChannel('recrutae-sync')
  channel.onmessage = (event) => {
    if (event.data.type === 'STORE_UPDATED') {
      // Re-read de localStorage e aplicar ao Zustand
      useAppStore.persist.rehydrate()
    }
  }
}
```

Após cada write no store, enviar notificação:

```typescript
// Wrapper no middleware persist do Zustand
const originalSetItem = storage.setItem
storage.setItem = (name, value) => {
  originalSetItem(name, value)
  const channel = new BroadcastChannel('recrutae-sync')
  channel.postMessage({ type: 'STORE_UPDATED', timestamp: Date.now() })
  channel.close()
}
```

### 3.4 Proteção Contra Clique Duplo

```typescript
// Simples flag no componente:
const [isSubmitting, setIsSubmitting] = useState(false)

const handleSendAll = async () => {
  if (isSubmitting) return
  setIsSubmitting(true)
  try { /* ... envio ... */ }
  finally { setIsSubmitting(false) }
}

// Botão:
<Button disabled={isSubmitting || isSending} onClick={handleSendAll}>
```

---

## 4. Sistema de Segurança de Envio

### 4.1 Transições de Status Válidas

Definir uma **máquina de estados** que impede transições inválidas:

```typescript
// lib/statusMachine.ts

const VALID_TRANSITIONS: Record<CandidateStatus, CandidateStatus[]> = {
  pending:     ['generating', 'failed'],
  generating:  ['ready', 'failed'],
  ready:       ['approved', 'pending'],       // pending = regenerar
  approved:    ['sending', 'ready'],           // ready = desaprovar
  sending:     ['sent', 'failed'],
  sent:        [],                              // estado final — NUNCA volta
  failed:      ['pending', 'approved'],         // retry = voltar a pending ou approve direto
}

export function canTransition(from: CandidateStatus, to: CandidateStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

export function assertTransition(from: CandidateStatus, to: CandidateStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Transição inválida: ${from} → ${to}`)
  }
}
```

**Regra crítica:** Uma vez que um candidato está em `sent`, ele NUNCA volta a outro estado. Isso impede reenvio.

### 4.2 Idempotência no Envio

#### 4.2.1 Registry Server-Side de E-mails Enviados

```typescript
// app/api/send/route.ts — adicionar registry em memória

const sentRegistry = new Map<string, { messageId: string; sentAt: string }>()

function getSendKey(campaignId: string, candidateEmail: string): string {
  return `${campaignId}::${candidateEmail.toLowerCase()}`
}

export async function POST(req: NextRequest) {
  // ... validação existente ...

  const { campaignId, candidateEmail } = body // adicionar esses campos ao body

  // VERIFICAR SE JÁ FOI ENVIADO
  const sendKey = getSendKey(campaignId, candidateEmail)
  const existing = sentRegistry.get(sendKey)
  if (existing) {
    return NextResponse.json({
      success: true,
      messageId: existing.messageId,
      alreadySent: true,
      sentAt: existing.sentAt,
    })
  }

  // ... enviar via Resend ...

  // REGISTRAR ENVIO
  if (data?.id) {
    sentRegistry.set(sendKey, {
      messageId: data.id,
      sentAt: new Date().toISOString(),
    })
  }

  return NextResponse.json({ success: true, messageId: data?.id })
}
```

#### 4.2.2 Verificação Client-Side Antes de Enviar

```typescript
// Antes de chamar /api/send, verificar status atual:
const freshCandidate = useAppStore.getState()
  .candidatesByCampaign[campaignId]
  ?.find(c => c.id === candidate.id)

if (freshCandidate?.status === 'sent') {
  console.log(`Candidato ${candidate.id} já enviado, pulando.`)
  continue // pula para o próximo no loop
}
```

### 4.3 Estratégia de Retry Seguro

```typescript
// Regras de retry:
const MAX_SEND_ATTEMPTS = 2

async function safeSend(campaignId: string, candidate: Candidate): Promise<SendResult> {
  // 1. Verificar se já foi enviado
  if (candidate.status === 'sent' || candidate.resendMessageId) {
    return { alreadySent: true }
  }

  // 2. Verificar número de tentativas
  if ((candidate.sendAttempts ?? 0) >= MAX_SEND_ATTEMPTS) {
    return { maxRetriesReached: true }
  }

  // 3. Enviar com campaignId e email para idempotência server-side
  const response = await fetch('/api/send', {
    method: 'POST',
    body: JSON.stringify({
      ...buildSendPayload(candidate),
      campaignId,
      candidateEmail: candidate.email,
    }),
  })

  const data = await response.json()

  // 4. Se o servidor reportou que já foi enviado, aceitar
  if (data.alreadySent) {
    return { success: true, alreadySent: true, messageId: data.messageId }
  }

  return data
}
```

### 4.4 Diagrama de Fluxo de Envio Seguro

```
┌─────────────────────────────────────────────────────────────┐
│                    FLUXO DE ENVIO SEGURO                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Usuário clica "Enviar Todos"                            │
│     │                                                        │
│  2. ▶ Verificar: botão já desabilitado? → Se sim, IGNORAR    │
│     │                                                        │
│  3. ▶ POST /api/campaign-lock (acquire)                      │
│     ├── 409 Conflict → TOAST "Campanha locked" → PARAR       │
│     └── 200 OK → PROSSEGUIR                                 │
│     │                                                        │
│  4. ▶ Para cada candidato com status === 'approved':         │
│     │  ├── Re-ler estado fresco do store                     │
│     │  ├── Se status === 'sent' → PULAR                      │
│     │  ├── Se sendAttempts >= MAX → marcar failed → PULAR    │
│     │  ├── Marcar como 'sending'                             │
│     │  ├── POST /api/send (com campaignId + email)           │
│     │  │   ├── { alreadySent: true } → marcar 'sent' → OK   │
│     │  │   ├── { success: true } → marcar 'sent' → OK       │
│     │  │   └── { error } → incrementar attempts, marcar fail │
│     │  └── Delay 500ms                                       │
│     │                                                        │
│  5. ▶ POST /api/campaign-lock (release)                      │
│     │                                                        │
│  6. ▶ Atualizar UI → navegar para /sent                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Estratégia de Gerenciamento de Estado

### 5.1 Atualizações Imutáveis (Já implementado — manter)

O Zustand com `set()` já faz shallow merge. As atualizações atuais usando `map()` e spread operator estão corretas. **Não alterar.**

### 5.2 Prevenção de Estado Stale

**Problema:** Dentro de loops assíncronos (como o loop de envio), o estado capturado no closure pode estar desatualizado.

**Solução:** Sempre ler o estado fresco antes de cada operação:

```typescript
// ERRADO (estado capturado no início do loop)
for (const candidate of toSend) {
  if (candidate.status === 'sent') continue // stale!
}

// CORRETO (estado fresco a cada iteração)
for (const candidate of toSend) {
  const fresh = useAppStore.getState().candidatesByCampaign[campaignId]
    ?.find(c => c.id === candidate.id)
  if (!fresh || fresh.status === 'sent') continue // fresh!
}
```

### 5.3 Validação no `updateCandidate`

Adicionar validação de transição de status dentro do store:

```typescript
updateCandidate: (campaignId, candidateId, updates) =>
  set((state) => {
    const candidates = state.candidatesByCampaign[campaignId] ?? []
    const target = candidates.find(c => c.id === candidateId)

    // Proteção: se o candidato já foi enviado, não permitir mudança de status
    if (target?.status === 'sent' && updates.status && updates.status !== 'sent') {
      console.warn(`Tentativa de mudar status de candidato já enviado: ${candidateId}`)
      return {} // não altera nada
    }

    // Validar transição se status estiver sendo alterado
    if (target && updates.status && !canTransition(target.status, updates.status)) {
      console.warn(`Transição inválida: ${target.status} → ${updates.status} para ${candidateId}`)
      return {}
    }

    // ... lógica existente de atualização ...
  }),
```

### 5.4 Sync entre Abas (BroadcastChannel)

Implementar rehydratação automática quando outra aba alterar o store:

```typescript
// store/index.ts — após criação do store

if (typeof window !== 'undefined') {
  const bc = new BroadcastChannel('recrutae-sync')

  // Escutar mudanças de outras abas
  bc.onmessage = () => {
    useAppStore.persist.rehydrate()
  }

  // Notificar outras abas após cada mudança
  useAppStore.subscribe(() => {
    bc.postMessage({ type: 'STORE_UPDATED' })
  })
}
```

Nota: `storage` event do browser já dispara para **outras** abas quando localStorage muda, mas o Zustand persist não escuta isso por padrão. A abordagem com BroadcastChannel é mais confiável.

### 5.5 Cleanup de Dados Antigos

Para evitar estourar o limite do localStorage:

```typescript
// lib/utils.ts

export function cleanupOldCampaigns(maxAgeDays: number = 90) {
  const state = useAppStore.getState()
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000

  state.campaigns
    .filter(c => new Date(c.createdAt).getTime() < cutoff && c.status === 'completed')
    .forEach(c => state.deleteCampaign(c.id))
}
```

---

## 6. Controle de Sessão

### 6.1 Session ID por Aba/Navegador

Cada aba do navegador deve ter um ID único que persiste **apenas durante a vida da aba** (não em localStorage — em `sessionStorage` ou em memória).

```typescript
// lib/session.ts

const SESSION_KEY = 'recrutae-session-id'

export function getSessionId(): string {
  if (typeof window === 'undefined') return 'server'

  let id = sessionStorage.getItem(SESSION_KEY)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(SESSION_KEY, id)
  }
  return id
}
```

**Por que `sessionStorage`:**
- Cada **aba** tem seu próprio sessionStorage (diferente de localStorage)
- Morre quando a aba fecha
- Perfeito para identificar sessões únicas

### 6.2 Rastreamento de Quem Fez o Quê

Adicionar `sessionId` em operações críticas:

```typescript
// Ao enviar e-mail
addSentEmail({
  ...emailData,
  sentBySessionId: getSessionId(),
})

// Ao adquirir lock
POST /api/campaign-lock { campaignId, sessionId: getSessionId(), action: 'acquire' }
```

### 6.3 Prevenção de Confusão de Sessão

```typescript
// Na SendingPage, verificar se o lock ainda pertence a esta sessão
// antes de cada envio no loop:

async function verifySendingPermission(campaignId: string): Promise<boolean> {
  const res = await fetch('/api/campaign-lock', {
    method: 'POST',
    body: JSON.stringify({
      campaignId,
      sessionId: getSessionId(),
      action: 'heartbeat',
    }),
  })
  return res.ok
}
```

### 6.4 Indicador Visual de Sessão Ativa

No Sidebar ou header, mostrar discretamente:

```tsx
<span className="text-[10px] text-brand-muted font-mono">
  Sessão: {getSessionId().slice(0, 8)}
</span>
```

Isso ajuda a diagnosticar problemas quando múltiplos recrutadores reportam conflitos — podem informar o ID da sessão.

---

## 7. Hardening de Segurança

### 7.1 Proteção das API Routes

#### 7.1.1 API Key Interna (Simples e Eficaz)

Adicionar uma `INTERNAL_API_KEY` que o client envia em cada request:

```env
# .env.local
INTERNAL_API_KEY=rak_seu_token_secreto_aqui_32chars
```

```typescript
// lib/api-auth.ts

export function validateApiKey(req: NextRequest): boolean {
  const key = req.headers.get('x-api-key')
  return key === process.env.INTERNAL_API_KEY
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
}
```

```typescript
// Em cada API route:
export async function POST(req: NextRequest) {
  if (!validateApiKey(req)) return unauthorizedResponse()
  // ... resto da lógica ...
}
```

```typescript
// No client, em todas as chamadas fetch:
const headers = {
  'Content-Type': 'application/json',
  'x-api-key': process.env.NEXT_PUBLIC_INTERNAL_API_KEY!,
}
```

**Nota:** Esse token é exposto no client-side (NEXT_PUBLIC_), então não é segurança forte — é uma **barreira** contra bots e scanners casuais. Para segurança real contra acesso externo, usar middleware de Next.js com verificação de origin/referer.

#### 7.1.2 Middleware de Verificação de Origem

```typescript
// middleware.ts (raiz do projeto)

import { NextRequest, NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  // Proteger apenas API routes
  if (!req.nextUrl.pathname.startsWith('/api/')) return NextResponse.next()

  // Verificar Origin ou Referer
  const origin = req.headers.get('origin')
  const allowedOrigins = [
    process.env.NEXT_PUBLIC_APP_URL,     // ex: https://recrutae.vercel.app
    'http://localhost:3000',
  ].filter(Boolean)

  if (origin && !allowedOrigins.includes(origin)) {
    return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403 })
  }

  return NextResponse.next()
}

export const config = { matcher: '/api/:path*' }
```

### 7.2 Rate Limiting

#### 7.2.1 Rate Limiter em Memória

```typescript
// lib/rate-limiter.ts

type RateLimitEntry = { count: number; resetAt: number }

const limits = new Map<string, RateLimitEntry>()

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const entry = limits.get(key)

  if (!entry || now > entry.resetAt) {
    limits.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs }
  }

  entry.count++
  const allowed = entry.count <= maxRequests
  return { allowed, remaining: Math.max(0, maxRequests - entry.count), resetAt: entry.resetAt }
}
```

#### 7.2.2 Aplicar nos Endpoints Críticos

| Endpoint | Limite | Janela |
|----------|--------|--------|
| `POST /api/send` | 60 requests | por minuto |
| `POST /api/generate` | 30 requests | por minuto |
| `GET /api/recover` | 10 requests | por minuto |
| `POST /api/campaign-lock` | 20 requests | por minuto |

```typescript
// Em /api/send:
const { allowed, remaining } = checkRateLimit('send-global', 60, 60_000)
if (!allowed) {
  return NextResponse.json(
    { success: false, error: 'Rate limit excedido. Tente novamente em breve.' },
    { status: 429, headers: { 'X-RateLimit-Remaining': String(remaining) } }
  )
}
```

### 7.3 Validação de Input

```typescript
// Em /api/send — validar e sanitizar TUDO

// Validar e-mail com regex razoável
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
if (!EMAIL_REGEX.test(to)) {
  return NextResponse.json({ success: false, error: 'E-mail inválido.' }, { status: 400 })
}

// Limitar tamanho do corpo do e-mail
if (emailBody.length > 10_000) {
  return NextResponse.json({ success: false, error: 'Corpo do e-mail muito longo.' }, { status: 400 })
}

// Limitar tamanho do assunto
if (subject.length > 200) {
  return NextResponse.json({ success: false, error: 'Assunto muito longo.' }, { status: 400 })
}

// Sanitizar nome do remetente (prevenir header injection)
const safeSenderName = recruiterName?.replace(/[\r\n<>]/g, '').trim().slice(0, 100)
```

### 7.4 Proteção Contra Abuso de Spam

```typescript
// Regras anti-abuso (aplicar no /api/send):

// 1. Não permitir enviar para o mesmo e-mail mais de 1x em 24h (por campanha)
const dailyKey = `daily::${to.toLowerCase()}::${new Date().toISOString().slice(0, 10)}`
const { allowed: dailyOk } = checkRateLimit(dailyKey, 1, 24 * 60 * 60 * 1000)

// 2. Limite global de e-mails por dia
const globalDailyKey = `global-daily::${new Date().toISOString().slice(0, 10)}`
const { allowed: globalOk } = checkRateLimit(globalDailyKey, 500, 24 * 60 * 60 * 1000)
```

---

## 8. Tratamento de Erros

### 8.1 Falha no Meio do Envio

**Cenário:** Envio de 50 e-mails, falha no 25º (rede cai, aba fecha, etc.)

**Comportamento esperado:**
- E-mails 1-24: status `sent` (já foram, não reverter)
- E-mail 25: status `failed` (falhou)
- E-mails 26-50: status `approved` (nunca iniciaram)
- Campanha: status `sending` (mas sem lock ativo)

**Recuperação:**
1. Usuário reabre a página `/sending`
2. Sistema detecta: campanha em status `sending`, mas sem lock ativo
3. Mostra botão "Retomar Envio"
4. "Retomar" adquire novo lock e envia apenas candidatos com status `approved`
5. Candidatos `failed` podem ser re-aprovados manualmente

```typescript
// Na SendingPage, ao montar:
useEffect(() => {
  if (campaign?.status === 'sending') {
    const hasApproved = candidates.some(c => c.status === 'approved')
    const hasSending = candidates.some(c => c.status === 'sending')

    if (hasSending) {
      // Candidatos travados em 'sending' sem envio ativo → resetar para 'approved'
      candidates
        .filter(c => c.status === 'sending')
        .forEach(c => {
          updateCandidate(campaignId!, c.id, { status: 'approved' })
        })
    }

    if (hasApproved) {
      setShowResumeDialog(true)
    }
  }
}, [])
```

### 8.2 Campanha Corrompida

**Cenário:** localStorage tem dados inconsistentes (ex: campanha existe mas `candidatesByCampaign[id]` é `undefined`).

**Proteção:**

```typescript
// No store, todos os getters devem ter fallbacks:
const candidates = campaignId ? candidatesByCampaign[campaignId] ?? [] : []
const config = campaignId ? campaignConfigById[campaignId] ?? null : null

// Validação na inicialização:
function validateStoreIntegrity(): string[] {
  const state = useAppStore.getState()
  const issues: string[] = []

  for (const campaign of state.campaigns) {
    if (!state.candidatesByCampaign[campaign.id]) {
      issues.push(`Campanha ${campaign.id} sem candidatos`)
    }
    const candidates = state.candidatesByCampaign[campaign.id] ?? []
    const actualSent = candidates.filter(c => c.status === 'sent').length
    if (campaign.sentCount !== actualSent) {
      issues.push(`Campanha ${campaign.id}: sentCount ${campaign.sentCount} ≠ real ${actualSent}`)
    }
  }

  return issues
}
```

### 8.3 Tratamento de Erros da API Resend

```typescript
// Em /api/send — mapear erros comuns:
const RESEND_ERROR_MAP: Record<string, string> = {
  'missing_required_field': 'Campos obrigatórios faltando.',
  'validation_error': 'Dados inválidos.',
  'rate_limit_exceeded': 'Limite de envio do Resend excedido. Aguarde.',
  'not_found': 'Domínio de envio não encontrado.',
}

if (error) {
  const friendlyMessage = RESEND_ERROR_MAP[error.name] || error.message
  // ... retornar erro
}
```

### 8.4 Timeout e Falha de Rede no Client

```typescript
// Wrapper com timeout para fetch:
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = 30_000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    return response
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Timeout: servidor não respondeu a tempo.')
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}
```

### 8.5 Feedback Visual de Erros

Cada estado de erro deve ter ação clara para o usuário:

| Erro | Mensagem | Ação disponível |
|------|----------|-----------------|
| Lock conflict | "Esta campanha está sendo enviada por outro recrutador." | Esperar ou forçar (com confirmação) |
| Rate limit | "Muitas requisições. Aguarde X segundos." | Timer visual + botão auto-habilitado |
| Envio parcial | "X de Y enviados. Z falharam." | Botão "Reenviar Falhados" |
| Rede offline | "Sem conexão. Envio pausado." | Auto-retoma quando online |
| localStorage cheio | "Armazenamento cheio. Exclua campanhas antigas." | Link para `/campaigns` |

---

## 9. Plano de Implementação Mínimo

### Fase 1 — Fundação (Prioridade MÁXIMA)

> Objetivo: Eliminar risco de envio duplicado e corrupção de dados.

| # | Tarefa | Arquivo(s) | Esforço |
|---|--------|-----------|---------|
| 1.1 | Trocar IDs de `Date.now()` para `crypto.randomUUID()` | `store/index.ts` | 10 min |
| 1.2 | Criar `lib/session.ts` com `getSessionId()` | `lib/session.ts` | 10 min |
| 1.3 | Criar `lib/statusMachine.ts` com transições válidas | `lib/statusMachine.ts` | 15 min |
| 1.4 | Adicionar validação de transição no `updateCandidate` | `store/index.ts` | 15 min |
| 1.5 | Criar `/api/campaign-lock` (acquire/release/heartbeat) | `app/api/campaign-lock/route.ts` | 30 min |
| 1.6 | Criar registry de envio em `/api/send` (idempotência) | `app/api/send/route.ts` | 20 min |
| 1.7 | Atualizar `SendingPage` para usar lock + session | `app/sending/page.tsx` | 45 min |

**Validação Fase 1:**
- [ ] Abrir 2 abas → tentar enviar mesma campanha → segunda aba deve ser bloqueada
- [ ] Enviar campanha → fechar aba → reabrir → lock deve expirar em 5 min
- [ ] Chamar `/api/send` 2x para o mesmo candidato → segundo retorna `alreadySent`
- [ ] Tentar transição `sent → approved` → deve ser bloqueada

### Fase 2 — Sincronização e UX

> Objetivo: Manter UI consistente entre abas e sessões.

| # | Tarefa | Arquivo(s) | Esforço |
|---|--------|-----------|---------|
| 2.1 | Criar `lib/broadcast.ts` | `lib/broadcast.ts` | 10 min |
| 2.2 | Integrar BroadcastChannel no store | `store/index.ts` | 20 min |
| 2.3 | Adicionar `beforeunload` handler para release de lock | `app/sending/page.tsx` | 10 min |
| 2.4 | Implementar botão "Retomar Envio" | `app/sending/page.tsx` | 30 min |
| 2.5 | Resetar candidatos stuck em `sending` ao montar página | `app/sending/page.tsx` | 15 min |
| 2.6 | Adicionar `resendMessageId` ao candidato após envio | `app/sending/page.tsx`, `lib/types.ts` | 15 min |

**Validação Fase 2:**
- [ ] Aba 1 envia campanha → Aba 2 vê progresso atualizando em tempo real
- [ ] Fechar aba durante envio → reabrir → oferece "Retomar"
- [ ] Nenhum candidato fica travado em `sending` permanentemente

### Fase 3 — Segurança

> Objetivo: Proteger API contra uso indevido.

| # | Tarefa | Arquivo(s) | Esforço |
|---|--------|-----------|---------|
| 3.1 | Criar `lib/rate-limiter.ts` | `lib/rate-limiter.ts` | 15 min |
| 3.2 | Criar `lib/api-auth.ts` | `lib/api-auth.ts` | 10 min |
| 3.3 | Adicionar `INTERNAL_API_KEY` no `.env.local` | `.env.local` | 5 min |
| 3.4 | Aplicar rate limiting em `/api/send` e `/api/generate` | API routes | 20 min |
| 3.5 | Aplicar validação de input (email, tamanho, sanitização) | `app/api/send/route.ts` | 20 min |
| 3.6 | Criar `middleware.ts` com verificação de origem | `middleware.ts` | 15 min |
| 3.7 | Prevenir envio duplicado para mesmo e-mail em 24h | `app/api/send/route.ts` | 15 min |

**Validação Fase 3:**
- [ ] Chamar API via curl sem API key → 401
- [ ] Enviar 65 e-mails em 1 minuto → 429 no 61º
- [ ] Enviar para mesmo e-mail 2x em 24h → bloqueado
- [ ] Input com e-mail inválido → 400

### Fase 4 — Resiliência

> Objetivo: O sistema se recupera graciosamente de qualquer falha.

| # | Tarefa | Arquivo(s) | Esforço |
|---|--------|-----------|---------|
| 4.1 | Criar `fetchWithTimeout` wrapper | `lib/utils.ts` | 10 min |
| 4.2 | Adicionar `sendAttempts` ao tipo Candidate | `lib/types.ts`, `store/index.ts` | 10 min |
| 4.3 | Implementar cleanup de campanhas antigas | `lib/utils.ts` | 15 min |
| 4.4 | Criar `validateStoreIntegrity()` e rodar na inicialização | `lib/utils.ts`, `app/layout.tsx` | 20 min |
| 4.5 | Mapear erros do Resend para mensagens amigáveis | `app/api/send/route.ts` | 10 min |
| 4.6 | Adicionar `sendAttempts` tracking e limite de retries | `app/sending/page.tsx` | 15 min |

**Validação Fase 4:**
- [ ] Desligar internet no meio do envio → mensagem clara + candidatos não corrompidos
- [ ] Criar 100 campanhas → cleanup remove as >90 dias concluídas
- [ ] Store com dados inconsistentes → issues logadas no console

---

## Resumo de Prioridades

```
🔴 CRÍTICO (Fazer primeiro — previne perda de dados e spam)
├── 1.1  IDs únicos (crypto.randomUUID)
├── 1.5  Lock server-side (/api/campaign-lock)
├── 1.6  Registry de envio (idempotência)
└── 3.5  Validação de input

🟠 ALTO (Fazer em seguida — estabilidade multi-usuário)
├── 1.3  Máquina de estados
├── 1.7  SendingPage com lock
├── 2.2  BroadcastChannel sync
├── 3.1  Rate limiting
└── 2.4  Retomar envio

🟡 MÉDIO (Polimento — melhor UX e diagnóstico)
├── 1.2  Session IDs
├── 2.3  beforeunload handler
├── 3.6  Middleware de origem
└── 4.4  Validação de integridade

🟢 BAIXO (Nice-to-have — manutenção de longo prazo)
├── 4.3  Cleanup automático
├── 4.5  Mensagens de erro amigáveis
└── 6.4  Indicador visual de sessão
```

---

## Limitações Conhecidas (Aceitas)

| Limitação | Por que é aceitável |
|-----------|-------------------|
| Lock server-side é em memória → perde ao reiniciar processo | Deploy na Vercel = serverless → cada cold start reseta. Mas: o registry de envio no Resend é a verdade final. Na pior hipótese, duplicaremos 1-2 e-mails durante um redeploy, não centenas. |
| localStorage tem limite de ~5MB | Para o volume esperado (dezenas de campanhas com ~100 candidatos), é suficiente. Cleanup resolve problemas de longo prazo. |
| Não há auditoria real de quem enviou o quê | `sentBySessionId` nos `SentEmail` dá rastreabilidade mínima. Para auditoria real, seria necessário um banco de dados. |
| BroadcastChannel não funciona entre máquinas | Apenas resolve multi-aba no mesmo navegador. O lock server-side resolve multi-máquina. |
| Rate limiter em memória reseta no redeploy | Limite low-tech, mas suficiente contra abuso casual. Para DDoS real, usar Vercel's built-in rate limiting ou Cloudflare. |

---

## Consideração sobre Serverless (Vercel)

Se o deploy for na Vercel (serverless), os `Map` em memória (`locks`, `sentRegistry`, `rateLimitCounters`) serão **efêmeros** — cada invocação pode estar numa instância diferente.

**Opções de mitigação (sem backend completo):**

1. **Vercel KV (Redis)** — Free tier com 30k requests/dia. Substitui `Map` por `kv.set()`/`kv.get()`. Ideal para locks e rate limiting. Custo: $0.

2. **Upstash Redis** — Alternativa ao Vercel KV. REST API, sem conexão persistente. 10k requests/dia free.

3. **Aceitar o risco** — Para equipes pequenas (2-5 recrutadores), a probabilidade de conflito real entre instâncias serverless é baixa. O registry do Resend (via `/api/recover`) é a verdade final.

**Recomendação:** Implementar com `Map` em memória primeiro. Se conflitos ocorrerem em produção, migrar para Vercel KV em ~1 hora de trabalho.

---

*Documento criado: Abril 2026*
*Última atualização: Abril 2026*
