# Divulgação do Recrutaê OS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar uma terceira área independente no Recrutaê Mail para importar contatos, personalizar com variação mínima, revisar, enviar e acompanhar campanhas de divulgação do Recrutaê OS.

**Architecture:** As telas e o store ROS permanecem isolados em `/ros` e `recrutae-ros-v1`, enquanto parsing, templates, fidelidade, HTML, supressão e entrega ficam em unidades compartilhadas. Supabase diferencia campanhas por `campaign_kind`; APIs server-side validam pertencimento, supressão e transição de estado antes de chamar o Resend.

**Tech Stack:** Next.js 14.2, React 18, TypeScript 5.5, Tailwind CSS, Zustand 4, Supabase, Resend 4.8, OpenAI, Groq, PapaParse, SheetJS, JOSE e Vitest 2.

**Spec:** `docs/superpowers/specs/2026-09-15-divulgacao-ros-design.md`

## Global Constraints

- Manter compatibilidade com Node.js 18+ e Next.js `14.2.35`.
- Não alterar visualmente Candidatos ou Clientes, salvo o terceiro cartão da home e a filtragem por `campaign_kind`.
- Usar somente Lucide React para novos ícones e CSS para animações; não instalar Framer Motion.
- Escopar o tema ROS a `.ros-theme`: tinta `#0B0A18`, tinta elevada `#16152C`, osso `#F4F2ED` e amarelo `#FBB900`.
- Usar Poppins em títulos/corpo ROS e JetBrains Mono somente para labels, números e dados.
- Usar `contato@recrutae.com.br` quando `ROS_FROM_EMAIL` não estiver configurado.
- Limitar a variação aceita no corpo a no máximo 8%; falha de fidelidade ou IA sempre retorna o template preenchido.
- Não enviar e-mail externo em testes automatizados ou na verificação local.
- Persistir bloqueios de descadastro, bounce e complaint no servidor; `localStorage` não é fonte de autoridade.
- Preservar os arquivos não rastreados `.xlsx/` e `AGENTS.md`.

## File Structure

### Novos arquivos de domínio e infraestrutura

- `lib/rosTypes.ts` — contratos de campanha, contato, configuração e APIs ROS.
- `store/rosStore.ts` — estado Zustand persistido em `recrutae-ros-v1`.
- `lib/outreach/fidelity.ts` — cálculo lexical e validação de links, números e estrutura.
- `lib/outreach/emailHtml.ts` — HTML/texto compartilhado e assinatura configurável por marca.
- `lib/outreach/unsubscribe.ts` — criação e validação de tokens assinados.
- `lib/outreach/repository.ts` — persistência, reserva de envio e supressão.
- `lib/ros/generate.ts` — personalização ROS com provedores injetáveis e fallback.
- `lib/ros/preflight.ts` — diagnóstico de configuração e domínio.
- `lib/ros/send.ts` — orquestração testável do disparo idempotente.
- `lib/ros/sendQueue.ts` — seleção pura de contatos elegíveis para envio/reenvio.
- `supabase-migration-ros.sql` — migração idempotente para ROS e supressões.

### Novas APIs

- `app/api/ros/generate/route.ts`
- `app/api/ros/save-campaign/route.ts`
- `app/api/ros/finalize-campaign/route.ts`
- `app/api/ros/events/route.ts`
- `app/api/ros/preflight/route.ts`
- `app/api/ros/send/route.ts`
- `app/api/unsubscribe/route.ts`

### Novas telas e componentes

- `app/ros/page.tsx`
- `app/ros/compose/page.tsx`
- `app/ros/review/page.tsx`
- `app/ros/sending/page.tsx`
- `app/ros/sent/page.tsx`
- `app/ros/campaigns/page.tsx`
- `app/unsubscribe/page.tsx`
- `components/ros/RosContactTable.tsx`
- `components/ros/RosManualContactForm.tsx`
- `components/ros/RosEmailPreview.tsx`
- `components/ros/RosEmailEditor.tsx`
- `public/ros/recrutae-ros.png`

### Testes

- `tests/contactParsing.test.ts`
- `tests/rosStore.test.ts`
- `tests/outreachFidelity.test.ts`
- `tests/rosGenerate.test.ts`
- `tests/outreachEmailHtml.test.ts`
- `tests/unsubscribe.test.ts`
- `tests/rosSend.test.ts`
- `tests/rosPreflight.test.ts`
- `tests/rosComponents.test.tsx`
- `tests/campaignKind.test.ts`

---

### Task 1: Infraestrutura de testes e SDK idempotente

**Files:**
- Modify: `package.json:5-38`
- Modify: `package-lock.json`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `tests/smoke.test.ts`

**Interfaces:**
- Consumes: scripts e dependências atuais do projeto.
- Produces: `npm test`, ambiente `jsdom`, alias `@/` e Resend com opção `idempotencyKey`.

- [ ] **Step 1: Escrever o teste de fumaça**

```ts
// tests/smoke.test.ts
import { describe, expect, it } from 'vitest'

describe('test harness', () => {
  it('resolves the project alias', async () => {
    const { cn } = await import('@/lib/utils')
    expect(cn('a', false && 'b')).toBe('a')
  })
})
```

- [ ] **Step 2: Instalar versões compatíveis com Node 18 e comprovar a falha inicial**

Run:

```powershell
npm install --save-exact resend@4.8.0
npm install --save-dev --save-exact vitest@2.1.9 jsdom@24.1.3 @testing-library/react@16.3.3 @testing-library/jest-dom@6.8.0
npm test
```

Expected: o comando `npm test` falha porque o script/configuração ainda não existem.

- [ ] **Step 3: Configurar Vitest e scripts**

```ts
// vitest.config.ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  resolve: { alias: { '@': rootDir } },
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    clearMocks: true,
  },
})
```

```ts
// vitest.setup.ts
import '@testing-library/jest-dom/vitest'
```

Adicionar a `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Executar o teste e o build basal**

Run: `npm test -- tests/smoke.test.ts && npm run build`  
Expected: 1 teste passa; o build conclui sem novo erro.

- [ ] **Step 5: Commit**

```powershell
git add package.json package-lock.json vitest.config.ts vitest.setup.ts tests/smoke.test.ts
git commit -m "test: configura infraestrutura para o fluxo ROS"
```

### Task 2: Tipos e store isolado do ROS

**Files:**
- Create: `lib/rosTypes.ts`
- Create: `store/rosStore.ts`
- Create: `tests/rosStore.test.ts`

**Interfaces:**
- Consumes: `ClientContactStatus` como referência sem importar o store de Clientes.
- Produces: `RosContact`, `RosCampaign`, `RosCampaignConfig`, `useRosStore` e a chave `recrutae-ros-v1`.

- [ ] **Step 1: Escrever o teste do contrato do store**

```ts
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
```

- [ ] **Step 2: Executar para confirmar falha**

Run: `npm test -- tests/rosStore.test.ts`  
Expected: FAIL porque `@/store/rosStore` ainda não existe.

- [ ] **Step 3: Criar tipos e store**

Definir exatamente:

```ts
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
```

Implementar o mesmo conjunto de ações do `clientStore`, usando `campaignKind: 'ros'`
em `RosCampaign`, chave de persistência `recrutae-ros-v1` e limpeza do conteúdo de
mensagens enviadas no `partialize`.

- [ ] **Step 4: Executar testes**

Run: `npm test -- tests/rosStore.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add lib/rosTypes.ts store/rosStore.ts tests/rosStore.test.ts
git commit -m "feat: adiciona dominio e store isolado do ROS"
```

### Task 3: Parsing detalhado, rejeições e contato manual

**Files:**
- Modify: `lib/contactParsing.ts:68-235`
- Modify: `lib/utils.ts:12-98`
- Create: `lib/ros/contacts.ts`
- Create: `tests/contactParsing.test.ts`

**Interfaces:**
- Consumes: linhas `unknown[][]` de PapaParse/SheetJS e `RosContact`.
- Produces: `parseContactRowsDetailed()`, `rowsToRosContactsDetailed()`, `parseRosContactsFile()` e `createManualRosContact()`.

- [ ] **Step 1: Escrever testes de ordem, alias, rejeição e deduplicação**

```ts
import { describe, expect, it } from 'vitest'
import { rowsToRosContactsDetailed } from '@/lib/contactParsing'
import { createManualRosContact } from '@/lib/ros/contacts'

describe('contatos ROS', () => {
  it('detecta email antes do nome e aliases em português', () => {
    const result = rowsToRosContactsDetailed([
      ['E-mail', 'Empresa', 'Nome', 'Cargo'],
      ['ANA@EXAMPLE.COM', 'ACME', 'Ana Lima', 'Diretora'],
    ])
    expect(result.contacts[0]).toMatchObject({ email: 'ana@example.com', fullName: 'Ana Lima', company: 'ACME', position: 'Diretora' })
  })

  it('relata email inválido e duplicado sem perder linhas válidas', () => {
    const result = rowsToRosContactsDetailed([
      ['Nome', 'Contato'], ['Ana', 'ana@example.com'], ['Erro', 'sem-email'], ['Ana 2', 'ANA@example.com'],
    ])
    expect(result.contacts).toHaveLength(1)
    expect(result.rejected.map((row) => row.reason)).toEqual(['invalid_email', 'duplicate'])
  })

  it('aplica a mesma validação ao contato manual', () => {
    expect(() => createManualRosContact({ fullName: 'Ana', email: 'errado', company: '', position: '' }, new Set())).toThrow('E-mail inválido')
  })
})
```

- [ ] **Step 2: Executar para confirmar falha**

Run: `npm test -- tests/contactParsing.test.ts`  
Expected: FAIL por exports ausentes.

- [ ] **Step 3: Implementar o resultado detalhado sem quebrar consumidores atuais**

```ts
export type RejectedContactRow = {
  rowNumber: number
  reason: 'missing_email' | 'invalid_email' | 'duplicate'
  values: string[]
}

export type ParsedContactsResult<T> = { contacts: T[]; rejected: RejectedContactRow[] }

export function parseContactRows(allRows: unknown[][]): ParsedContact[] {
  return parseContactRowsDetailed(allRows).contacts
}
```

Usar regex de e-mail `^[^\s@]+@[^\s@]+\.[^\s@]+$`, normalizar o e-mail para
minúsculas e preservar `rowsToCandidates()`/`rowsToClientContacts()` como wrappers.
`parseRosContactsFile()` deve devolver contatos e rejeições, aceitando as mesmas
extensões já processadas por `readContactRows()`.

- [ ] **Step 4: Rodar parsing e regressão**

Run: `npm test -- tests/contactParsing.test.ts tests/smoke.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add lib/contactParsing.ts lib/utils.ts lib/ros/contacts.ts tests/contactParsing.test.ts
git commit -m "feat: aceita contatos ROS em qualquer ordem"
```

### Task 4: Motor de fidelidade e geração ROS

**Files:**
- Create: `lib/outreach/fidelity.ts`
- Create: `lib/ros/generate.ts`
- Create: `app/api/ros/generate/route.ts`
- Create: `tests/outreachFidelity.test.ts`
- Create: `tests/rosGenerate.test.ts`

**Interfaces:**
- Consumes: `renderEmailTemplate()`, `generateWithFallback()` e `GenerateRosEmailRequest`.
- Produces: `validateRosVariation(base, generated)`, `personalizeRosEmail(request, deps)` e `POST /api/ros/generate`.

- [ ] **Step 1: Escrever testes do limite e fallback**

```ts
import { describe, expect, it, vi } from 'vitest'
import { validateRosVariation } from '@/lib/outreach/fidelity'
import { personalizeRosEmail } from '@/lib/ros/generate'

describe('fidelidade ROS', () => {
  const base = 'Olá, Ana!\n\nConheça o ROS em https://recrutae.com.br/ros.\n\nPodemos conversar por 15 minutos?'

  it('rejeita mudança de URL e número', () => {
    expect(validateRosVariation(base, base.replace('/ros', '/precos')).ok).toBe(false)
    expect(validateRosVariation(base, base.replace('15', '30')).ok).toBe(false)
  })

  it('usa o template preenchido quando a IA excede 8%', async () => {
    const result = await personalizeRosEmail({
      contact: { firstName: 'Ana', fullName: 'Ana', email: 'ana@example.com', company: '', position: '' },
      subjectTemplate: 'ROS para {{nome}}', emailTemplate: 'Olá, {{nome}}. Podemos conversar?', varySubject: false, variationSeed: 1,
    }, { callProvider: vi.fn().mockResolvedValue(JSON.stringify({ subject: 'Outro', body: 'Uma mensagem completamente diferente e inventada.' })) })
    expect(result.body).toBe('Olá, Ana. Podemos conversar?')
    expect(result.templateEnforced).toBe(true)
    expect(result.subject).toBe('ROS para Ana')
  })
})
```

- [ ] **Step 2: Executar para confirmar falha**

Run: `npm test -- tests/outreachFidelity.test.ts tests/rosGenerate.test.ts`  
Expected: FAIL por módulos ausentes.

- [ ] **Step 3: Implementar fidelidade e serviço injetável**

`validateRosVariation()` deve:

```ts
export type VariationCheck = { ok: true; changeRatio: number } | { ok: false; changeRatio: number; reason: string }

export function validateRosVariation(base: string, generated: string, maxChangeRatio = 0.08): VariationCheck
```

Comparar tokens normalizados por LCS; exigir a mesma lista de URLs, números e a
mesma quantidade de parágrafos. Texto vazio ou `changeRatio > 0.08` é rejeitado.
`personalizeRosEmail()` preenche placeholders primeiro, usa assunto fixo quando
`varySubject === false`, chama OpenAI/Groq com temperatura `0.35` e retorna o
template preenchido em qualquer falha. A rota deve persistir o resultado apenas
quando receber `campaignId` e `contact.id` válidos.

- [ ] **Step 4: Executar testes**

Run: `npm test -- tests/outreachFidelity.test.ts tests/rosGenerate.test.ts`  
Expected: PASS para variação pequena, URL/número alterado, excesso de mudança e falha de provedor.

- [ ] **Step 5: Commit**

```powershell
git add lib/outreach/fidelity.ts lib/ros/generate.ts app/api/ros/generate/route.ts tests/outreachFidelity.test.ts tests/rosGenerate.test.ts
git commit -m "feat: limita personalizacao de campanhas ROS"
```

### Task 5: Schema, repositório e isolamento por tipo de campanha

**Files:**
- Create: `supabase-migration-ros.sql`
- Modify: `supabase-schema.sql:12-148`
- Modify: `app/api/migrate/route.ts:10-182`
- Create: `lib/outreach/repository.ts`
- Create: `app/api/ros/save-campaign/route.ts`
- Create: `app/api/ros/finalize-campaign/route.ts`
- Create: `app/api/ros/events/route.ts`
- Create: `tests/campaignKind.test.ts`

**Interfaces:**
- Consumes: `supabaseAdmin ?? supabase`, `RosCampaign`, `RosCampaignConfig` e `RosContact[]`.
- Produces: schema idempotente, `saveRosCampaign()`, `claimRosContact()`, `markContactSent()`, `markContactFailed()` e APIs persistentes.

- [ ] **Step 1: Escrever testes dos mapeadores e da reserva condicional**

```ts
import { describe, expect, it } from 'vitest'
import { mapRosCampaignRow, sendableStatuses } from '@/lib/outreach/repository'

describe('persistência ROS', () => {
  it('grava o discriminador e todos os campos da assinatura', () => {
    expect(mapRosCampaignRow({
      id: 'camp-1', name: 'ROS', status: 'draft', totalContacts: 1,
    }, {
      recruiterName: 'Ana', recruiterRole: 'Comercial', recruiterEmail: 'contato@recrutae.com.br',
      replyTo: 'ana@recrutae.com.br', recruiterLinkedin: 'https://linkedin.com/in/ana', recruiterWhatsapp: '5511999999999',
      subjectTemplate: 'Assunto', emailTemplate: 'Corpo', varySubject: false, variationPercent: 6,
    })).toMatchObject({ campaign_kind: 'ros', recruiter_role: 'Comercial', vary_subject: false, variation_percent: 6 })
  })

  it('só permite reserva partindo de approved ou failed', () => {
    expect(sendableStatuses).toEqual(['approved', 'failed'])
  })
})
```

- [ ] **Step 2: Executar para confirmar falha**

Run: `npm test -- tests/campaignKind.test.ts`  
Expected: FAIL por repositório ausente.

- [ ] **Step 3: Criar migração e repositório**

O SQL idempotente deve adicionar:

```sql
alter table client_campaigns add column if not exists campaign_kind text not null default 'clients';
alter table client_campaigns add column if not exists recruiter_role text not null default '';
alter table client_campaigns add column if not exists recruiter_linkedin text not null default '';
alter table client_campaigns add column if not exists recruiter_whatsapp text not null default '';
alter table client_campaigns add column if not exists reply_to text not null default '';
alter table client_campaigns add column if not exists subject_template text not null default '';
alter table client_campaigns add column if not exists vary_subject boolean not null default false;
alter table client_campaigns add column if not exists variation_percent smallint not null default 6;

create table if not exists email_suppressions (
  email text primary key,
  reason text not null check (reason in ('unsubscribe', 'bounce', 'complaint')),
  source text not null,
  message_id text,
  created_at timestamptz not null default now()
);

alter table email_suppressions enable row level security;

create index if not exists idx_client_campaigns_kind_created on client_campaigns(campaign_kind, created_at desc);
create index if not exists idx_client_contacts_campaign_email on client_contacts(campaign_id, lower(email));
```

Adicionar os checks idempotentes:

```sql
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'client_campaigns_kind_check') then
    alter table client_campaigns add constraint client_campaigns_kind_check
      check (campaign_kind in ('clients', 'ros'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'client_campaigns_variation_check') then
    alter table client_campaigns add constraint client_campaigns_variation_check
      check (variation_percent between 5 and 8);
  end if;
end $$;
```

O repositório deve filtrar `campaign_kind = 'ros'` ao salvar, consultar e reservar,
expondo:

```ts
export const sendableStatuses = ['approved', 'failed'] as const
export function mapRosCampaignRow(
  campaign: Pick<RosCampaign, 'id' | 'name' | 'status' | 'totalContacts'>,
  config: RosCampaignConfig,
): Record<string, unknown>
export async function claimRosContact(db: SupabaseClient, campaignId: string, contactId: string): Promise<boolean>
export async function markContactSent(db: SupabaseClient, contactId: string, messageId: string): Promise<void>
export async function markContactFailed(db: SupabaseClient, contactId: string, message: string): Promise<void>
export async function isEmailSuppressed(db: SupabaseClient, email: string): Promise<boolean>
```

`claimRosContact()` faz update para `sending` com `.in('status', ['approved', 'failed'])`
e considera sucesso somente quando uma linha é retornada.

- [ ] **Step 4: Implementar APIs finas e executar testes**

`save-campaign` usa upsert em lotes de 50; `finalize-campaign` consolida os
contadores; `events` reaproveita o agrupamento do endpoint de Clientes, mas valida
que a campanha é ROS.

Run: `npm test -- tests/campaignKind.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add supabase-migration-ros.sql supabase-schema.sql app/api/migrate/route.ts lib/outreach/repository.ts app/api/ros/save-campaign/route.ts app/api/ros/finalize-campaign/route.ts app/api/ros/events/route.ts tests/campaignKind.test.ts
git commit -m "feat: persiste campanhas ROS de forma isolada"
```

### Task 6: HTML compartilhado e assinatura Recrutaê | OS

**Files:**
- Create: `lib/outreach/emailHtml.ts`
- Create: `components/ros/RosEmailPreview.tsx`
- Create: `public/ros/recrutae-ros.png`
- Modify: `app/api/clients/send/route.ts:14-109`
- Create: `tests/outreachEmailHtml.test.ts`

**Interfaces:**
- Consumes: corpo em texto, dados do remetente, URL do logo, marca e URL de descadastro.
- Produces: `renderOutreachEmail(input): { html: string; text: string }` usado por preview, Clientes e ROS.

- [ ] **Step 1: Escrever testes de assinatura, escape e opcionais**

```ts
import { describe, expect, it } from 'vitest'
import { renderOutreachEmail } from '@/lib/outreach/emailHtml'

describe('email ROS', () => {
  it('renderiza o monograma e escapa dados do remetente', () => {
    const rendered = renderOutreachEmail({
      body: 'Olá!\n\nVeja https://recrutae.com.br/ros',
      recruiterName: '<João>', recruiterRole: 'Comercial', recruiterLinkedin: '', recruiterWhatsapp: '',
      brand: 'ros', logoUrl: 'https://mail.recrutae.com.br/ros/recrutae-ros.png',
      unsubscribeUrl: 'https://mail.recrutae.com.br/unsubscribe?token=abc',
    })
    expect(rendered.html).toContain('Recrutaê | OS')
    expect(rendered.html).toContain('recrutae-ros.png')
    expect(rendered.html).toContain('&lt;João&gt;')
    expect(rendered.html).not.toContain('<João>')
    expect(rendered.text).toContain('Descadastrar: https://mail.recrutae.com.br/unsubscribe?token=abc')
  })
})
```

- [ ] **Step 2: Executar para confirmar falha**

Run: `npm test -- tests/outreachEmailHtml.test.ts`  
Expected: FAIL por renderer ausente.

- [ ] **Step 3: Implementar renderer e copiar asset oficial**

```ts
export type OutreachEmailInput = {
  body: string
  recruiterName: string
  recruiterRole: string
  recruiterLinkedin: string
  recruiterWhatsapp: string
  brand: 'clients' | 'ros'
  logoUrl: string
  unsubscribeUrl?: string
}

export function renderOutreachEmail(input: OutreachEmailInput): { html: string; text: string }
```

Usar tabela de 600 px, estilos inline e paleta ROS. Links só podem ser criados
após validação com `new URL()` e protocolo `http:`/`https:`. Copiar exatamente:

```powershell
New-Item -ItemType Directory -Force 'public\ros' | Out-Null
Copy-Item -LiteralPath 'C:\Users\joaol\Documents\Recrutae\Portal Recrutae\recrutaeportal_priv\public\brand\recrutae-ros.png' -Destination 'public\ros\recrutae-ros.png'
```

Migrar a rota de Clientes para o renderer compartilhado mantendo a marca e o
texto `Recrutaê` existentes. `RosEmailPreview` chama a mesma função com URLs de
preview locais.

- [ ] **Step 4: Executar teste e build**

Run: `npm test -- tests/outreachEmailHtml.test.ts && npm run build`  
Expected: PASS e build concluído.

- [ ] **Step 5: Commit**

```powershell
git add lib/outreach/emailHtml.ts components/ros/RosEmailPreview.tsx public/ros/recrutae-ros.png app/api/clients/send/route.ts tests/outreachEmailHtml.test.ts
git commit -m "feat: cria assinatura de email Recrutae OS"
```

### Task 7: Descadastro, supressão e webhook

**Files:**
- Create: `lib/outreach/unsubscribe.ts`
- Create: `app/api/unsubscribe/route.ts`
- Create: `app/unsubscribe/page.tsx`
- Modify: `app/api/webhooks/resend/route.ts:1-80`
- Modify: `middleware.ts:6-75`
- Modify: `components/ClientLayout.tsx:52-64`
- Create: `tests/unsubscribe.test.ts`

**Interfaces:**
- Consumes: `UNSUBSCRIBE_SIGNING_SECRET`, JWT, Supabase e eventos Resend.
- Produces: `createUnsubscribeToken()`, `verifyUnsubscribeToken()`, endpoint RFC 8058 e supressões persistentes.

- [ ] **Step 1: Escrever testes do token e do bloqueio de finalidade**

```ts
import { describe, expect, it } from 'vitest'
import { createUnsubscribeToken, verifyUnsubscribeToken } from '@/lib/outreach/unsubscribe'

describe('unsubscribe token', () => {
  const secret = '12345678901234567890123456789012'

  it('normaliza email e preserva a finalidade', async () => {
    const token = await createUnsubscribeToken({ email: 'ANA@EXAMPLE.COM', campaignId: 'camp-1' }, secret)
    await expect(verifyUnsubscribeToken(token, secret)).resolves.toMatchObject({ email: 'ana@example.com', campaignId: 'camp-1', purpose: 'unsubscribe' })
  })

  it('rejeita assinatura diferente', async () => {
    const token = await createUnsubscribeToken({ email: 'ana@example.com', campaignId: 'camp-1' }, secret)
    await expect(verifyUnsubscribeToken(token, 'abcdefghijklmnopqrstuvwxyz123456')).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Executar para confirmar falha**

Run: `npm test -- tests/unsubscribe.test.ts`  
Expected: FAIL por módulo ausente.

- [ ] **Step 3: Implementar token, endpoint e página pública**

Usar `SignJWT`/`jwtVerify`, algoritmo `HS256`, emissor `recrutae-mail`, audiência
`unsubscribe`, expiração de 180 dias e secret com pelo menos 32 caracteres.
`POST /api/unsubscribe?token=...` aceita `List-Unsubscribe=One-Click`, verifica o
token e faz upsert em `email_suppressions`. `/unsubscribe?token=...` exibe o e-mail
mas exige clique humano antes do mesmo POST, evitando descadastro provocado por
scanner de links.

Adicionar a `PUBLIC_PATHS`:

```ts
'/unsubscribe', '/api/unsubscribe', '/api/webhooks/resend'
```

Adicionar `APP_BASE_URL` à lista de origins aceitas e `/unsubscribe` a
`NO_SIDEBAR_PATHS`, para a confirmação pública não herdar a navegação interna.

- [ ] **Step 4: Atualizar webhook e executar testes**

O webhook deve responder `503` quando `RESEND_WEBHOOK_SECRET` não existir,
validar o segredo recebido e fazer upsert de `bounce`/`complaint` pelo e-mail
normalizado, além de manter a inserção em `email_events`.

Run: `npm test -- tests/unsubscribe.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add lib/outreach/unsubscribe.ts app/api/unsubscribe/route.ts app/unsubscribe/page.tsx app/api/webhooks/resend/route.ts middleware.ts components/ClientLayout.tsx tests/unsubscribe.test.ts
git commit -m "feat: adiciona descadastro e supressao de emails"
```

### Task 8: Preflight e envio ROS idempotente

**Files:**
- Create: `lib/ros/preflight.ts`
- Create: `lib/ros/send.ts`
- Create: `app/api/ros/preflight/route.ts`
- Create: `app/api/ros/send/route.ts`
- Create: `tests/rosPreflight.test.ts`
- Create: `tests/rosSend.test.ts`

**Interfaces:**
- Consumes: Resend 4.8, DNS TXT, repositório, renderer e token de descadastro.
- Produces: `runRosPreflight(deps)`, `sendRosEmail(request, deps)` e APIs ROS.

- [ ] **Step 1: Escrever testes do bloqueio e da idempotência**

```ts
import { describe, expect, it, vi } from 'vitest'
import { runRosPreflight } from '@/lib/ros/preflight'
import { sendRosEmail } from '@/lib/ros/send'

describe('envio ROS', () => {
  it('bloqueia preflight sem URL HTTPS de descadastro', async () => {
    const result = await runRosPreflight({
      env: { RESEND_API_KEY: 're_x', ROS_FROM_EMAIL: 'contato@recrutae.com.br', APP_BASE_URL: 'http://site', UNSUBSCRIBE_SIGNING_SECRET: 'x'.repeat(32), RESEND_WEBHOOK_SECRET: 'secret' },
      listDomains: vi.fn().mockResolvedValue([{ name: 'recrutae.com.br', status: 'verified' }]),
      resolveTxt: vi.fn().mockResolvedValue([['v=DMARC1; p=none']]),
    })
    expect(result.canSend).toBe(false)
  })

  it('usa chave estável e nunca chama Resend para suprimido', async () => {
    const send = vi.fn()
    const result = await sendRosEmail({ campaignId: 'camp-1', contactId: 'contact-1', to: 'ana@example.com', subject: 'ROS', body: 'Olá', recruiterName: 'João', recruiterRole: '', recruiterEmail: 'contato@recrutae.com.br', replyTo: 'contato@recrutae.com.br', recruiterLinkedin: '', recruiterWhatsapp: '' }, {
      isSuppressed: vi.fn().mockResolvedValue(true), claimContact: vi.fn(), send, markSent: vi.fn(), markFailed: vi.fn(), createToken: vi.fn(), appBaseUrl: 'https://mail.recrutae.com.br', logoUrl: 'https://mail.recrutae.com.br/ros/recrutae-ros.png',
    })
    expect(result).toMatchObject({ success: false, suppressed: true })
    expect(send).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Executar para confirmar falha**

Run: `npm test -- tests/rosPreflight.test.ts tests/rosSend.test.ts`  
Expected: FAIL por serviços ausentes.

- [ ] **Step 3: Implementar preflight**

Retornar:

```ts
export type RosPreflightResult = {
  canSend: boolean
  checks: Array<{ key: 'apiKey' | 'domain' | 'dmarc' | 'appUrl' | 'unsubscribe' | 'webhook' | 'database'; status: 'ok' | 'warning' | 'error'; message: string }>
  fromEmail: string
}
```

`apiKey`, `domain`, `appUrl`, `unsubscribe` e `database` são bloqueadores;
`database` exige URL do Supabase e service role server-side. `dmarc` e `webhook`
são warnings. `listDomains` consulta o Resend; `resolveTxt` consulta
`_dmarc.<domínio>`.

- [ ] **Step 4: Implementar send e executar testes**

`sendRosEmail()` deve seguir esta ordem exata: normalizar e-mail, consultar
supressão, reservar status, criar token, renderizar, chamar:

```ts
resend.emails.send(payload, { idempotencyKey: `ros/${campaignId}/${contactId}` })
```

O payload inclui URL HTTPS no `List-Unsubscribe`,
`List-Unsubscribe-Post: List-Unsubscribe=One-Click`, tags de campanha/contato e
`reply_to`. Sucesso grava `sent`; erro grava `failed`. A rota valida remetente
`@recrutae.com.br` e usa `ROS_FROM_EMAIL ?? 'contato@recrutae.com.br'`.

Run: `npm test -- tests/rosPreflight.test.ts tests/rosSend.test.ts`  
Expected: PASS para supressão, reserva recusada, sucesso, erro e chave idempotente.

- [ ] **Step 5: Commit**

```powershell
git add lib/ros/preflight.ts lib/ros/send.ts app/api/ros/preflight/route.ts app/api/ros/send/route.ts tests/rosPreflight.test.ts tests/rosSend.test.ts
git commit -m "feat: envia campanhas ROS com preflight e idempotencia"
```

### Task 9: Tema ROS, home e navegação

**Files:**
- Modify: `app/globals.css:1-220`
- Modify: `tailwind.config.ts:12-92`
- Modify: `app/page.tsx:1-157`
- Modify: `components/Sidebar.tsx:1-242`
- Modify: `components/ClientLayout.tsx:52-76`
- Create: `tests/rosComponents.test.tsx`

**Interfaces:**
- Consumes: pathname atual e assets de marca.
- Produces: terceiro cartão, `rosNavItems`, badge `ROS` e tema `.ros-theme`.

- [ ] **Step 1: Escrever teste da home e sidebar**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), usePathname: () => '/ros' }))
vi.mock('next/image', () => ({ default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} /> }))

describe('navegação ROS', () => {
  it('mostra o modo ROS e suas etapas', async () => {
    const { Sidebar } = await import('@/components/Sidebar')
    render(<Sidebar />)
    expect(screen.getByText('ROS')).toBeInTheDocument()
    expect(screen.getByText('Contatos')).toBeInTheDocument()
    expect(screen.getByText('Mensagem')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Executar para confirmar falha**

Run: `npm test -- tests/rosComponents.test.tsx`  
Expected: FAIL porque `/ros` ainda usa a navegação de Candidatos.

- [ ] **Step 3: Implementar tema e modo**

Adicionar Poppins ao `@import`, `fontFamily.ros` no Tailwind e `.ros-theme` com
variáveis `--ros-ink`, `--ros-raised`, `--ros-bone` e `--ros-amber`.
`ClientLayout` aplica `ros-theme` no wrapper quando `pathname.startsWith('/ros')`.
Sidebar usa o monograma ROS e as rotas:

```ts
const rosNavItems = [
  { href: '/ros', label: 'Contatos', icon: Users },
  { href: '/ros/compose', label: 'Mensagem', icon: PenLine },
  { href: '/ros/review', label: 'Revisão', icon: MailCheck },
  { href: '/ros/sending', label: 'Enviando', icon: Send },
  { href: '/ros/sent', label: 'Resultados', icon: BarChart3 },
]
```

`/ros/campaigns` fica na seção Histórico.

- [ ] **Step 4: Adicionar terceiro cartão e executar testes**

Alterar a home para `max-w-[840px]` e grid responsivo de uma/duas/três colunas.
O cartão **Divulgação ROS** usa amarelo ROS, monograma e abre `/ros`.

Run: `npm test -- tests/rosComponents.test.tsx && npm run build`  
Expected: PASS e build concluído.

- [ ] **Step 5: Commit**

```powershell
git add app/globals.css tailwind.config.ts app/page.tsx components/Sidebar.tsx components/ClientLayout.tsx tests/rosComponents.test.tsx
git commit -m "feat: adiciona identidade e navegacao do ROS"
```

### Task 10: Tela de contatos ROS

**Files:**
- Modify: `package.json:5-38`
- Modify: `package-lock.json`
- Create: `components/ros/RosContactTable.tsx`
- Create: `components/ros/RosManualContactForm.tsx`
- Create: `app/ros/page.tsx`
- Modify: `tests/rosComponents.test.tsx`

**Interfaces:**
- Consumes: `parseRosContactsFile()`, `createManualRosContact()` e `RosContact[]`.
- Produces: lista editável em `sessionStorage['ros-pending-contacts']` e navegação para `/ros/compose`.

- [ ] **Step 1: Adicionar testes de entrada manual e resumo**

```tsx
it('adiciona um contato manual e mostra o total', async () => {
  const user = await import('@testing-library/user-event').then((m) => m.default.setup())
  const { RosManualContactForm } = await import('@/components/ros/RosManualContactForm')
  const onAdd = vi.fn()
  render(<RosManualContactForm existingEmails={new Set()} onAdd={onAdd} />)
  await user.type(screen.getByLabelText('E-mail'), 'ana@example.com')
  await user.type(screen.getByLabelText('Nome'), 'Ana')
  await user.click(screen.getByRole('button', { name: 'Adicionar contato' }))
  expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ email: 'ana@example.com' }))
})
```

Adicionar `@testing-library/user-event@14.6.1` como devDependency exata.

Run: `npm install --save-dev --save-exact @testing-library/user-event@14.6.1`

- [ ] **Step 2: Executar para confirmar falha**

Run: `npm test -- tests/rosComponents.test.tsx`  
Expected: FAIL por componente ausente.

- [ ] **Step 3: Implementar componentes**

`RosContactTable` permite editar nome/e-mail/empresa/cargo e excluir linha. Toda
edição de e-mail chama o validador compartilhado e impede duplicado.
`RosManualContactForm` tem labels reais, mensagens de erro ligadas por
`aria-describedby` e limpa os campos após `onAdd` bem-sucedido.

- [ ] **Step 4: Implementar página e executar testes**

A página aceita drag-and-drop de extensões aprovadas, mostra rejeições por motivo,
permite baixar o resumo em CSV e só habilita **Continuar** com pelo menos um
contato válido. Antes de navegar, grava o array em `ros-pending-contacts`.

Run: `npm test -- tests/contactParsing.test.ts tests/rosComponents.test.tsx`  
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add package.json package-lock.json components/ros/RosContactTable.tsx components/ros/RosManualContactForm.tsx app/ros/page.tsx tests/rosComponents.test.tsx
git commit -m "feat: cria importacao e cadastro de contatos ROS"
```

### Task 11: Composição e preview da campanha

**Files:**
- Create: `app/ros/compose/page.tsx`
- Modify: `components/ros/RosEmailPreview.tsx`
- Modify: `tests/rosComponents.test.tsx`

**Interfaces:**
- Consumes: `sessionStorage['ros-pending-contacts']`, `useRosStore` e `POST /api/ros/save-campaign`.
- Produces: campanha persistida e `activeCampaignId` antes de navegar a `/ros/review`.

- [ ] **Step 1: Escrever teste dos defaults e da assinatura**

```tsx
it('inicia o remetente ROS e variação de assunto desligada', async () => {
  sessionStorage.setItem('ros-pending-contacts', JSON.stringify([{ id: '1', email: 'ana@example.com', fullName: 'Ana', firstName: 'Ana', lastName: '', company: '', position: '', status: 'pending', generatedSubject: '', generatedBody: '', editedSubject: '', editedBody: '', sendAttempts: 0 }]))
  const Page = (await import('@/app/ros/compose/page')).default
  render(<Page />)
  expect(screen.getByLabelText('E-mail de envio')).toHaveValue('contato@recrutae.com.br')
  expect(screen.getByLabelText('Variar assunto')).not.toBeChecked()
  expect(screen.getByText('Recrutaê | OS')).toBeInTheDocument()
})
```

- [ ] **Step 2: Executar para confirmar falha**

Run: `npm test -- tests/rosComponents.test.tsx`  
Expected: FAIL por página ausente.

- [ ] **Step 3: Implementar formulário e validação**

Campos obrigatórios: campanha, assunto, mensagem, nome do remetente, e-mail de
envio e reply-to. Campos opcionais: cargo, LinkedIn e WhatsApp. O remetente aceita
somente `@recrutae.com.br`; URLs de LinkedIn usam `https:`; WhatsApp conserva
somente dígitos. `variationPercent` é um select 5–8 com default 6.

- [ ] **Step 4: Persistir antes da navegação**

Ao montar, consultar `/api/ros/preflight` para obter `fromEmail`; enquanto a
resposta não chega, usar `contato@recrutae.com.br`. Criar a campanha no store,
chamar `/api/ros/save-campaign` e somente remover
`ros-pending-contacts`/navegar após resposta `success: true`. Em erro, manter os
dados na tela e exibir toast com a mensagem recebida.

Run: `npm test -- tests/rosComponents.test.tsx`  
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add app/ros/compose/page.tsx components/ros/RosEmailPreview.tsx tests/rosComponents.test.tsx
git commit -m "feat: configura mensagem e assinatura ROS"
```

### Task 12: Revisão, edição e aprovação

**Files:**
- Create: `components/ros/RosEmailEditor.tsx`
- Create: `app/ros/review/page.tsx`
- Modify: `tests/rosComponents.test.tsx`

**Interfaces:**
- Consumes: campanha ativa, `POST /api/ros/generate` e `RosEmailPreview`.
- Produces: contatos `ready`/`approved`, edições com debounce e navegação para `/ros/sending`.

- [ ] **Step 1: Escrever teste de aprovação**

```tsx
it('aprova o email editado do contato selecionado', async () => {
  const user = await import('@testing-library/user-event').then((m) => m.default.setup())
  const onSave = vi.fn()
  const onApprove = vi.fn()
  const { RosEmailEditor } = await import('@/components/ros/RosEmailEditor')
  const config = { recruiterName: 'João', recruiterRole: 'Comercial', recruiterEmail: 'contato@recrutae.com.br', replyTo: 'contato@recrutae.com.br', recruiterLinkedin: '', recruiterWhatsapp: '', subjectTemplate: 'ROS', emailTemplate: 'Olá', varySubject: false, variationPercent: 6 as const }
  render(<RosEmailEditor contact={{ id: '1', firstName: 'Ana', lastName: '', fullName: 'Ana', email: 'ana@example.com', company: '', position: '', status: 'ready', generatedSubject: 'ROS', generatedBody: 'Olá', editedSubject: 'ROS', editedBody: 'Olá', sendAttempts: 0 }} config={config} onSave={onSave} onApprove={onApprove} onRegenerate={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: 'Aprovar' }))
  expect(onApprove).toHaveBeenCalledWith('1')
})
```

- [ ] **Step 2: Executar para confirmar falha**

Run: `npm test -- tests/rosComponents.test.tsx`  
Expected: FAIL por editor ausente.

- [ ] **Step 3: Implementar editor**

Layout 35%/65% em desktop e empilhado no mobile. O editor mostra assunto, corpo,
assinatura real, provider/fallback e aviso quando `templateEnforced` for true.
Auto-save usa debounce de 500 ms. Aprovar, regenerar e pular usam botões e atalhos
`A`, `R` e `ArrowRight`, ignorados enquanto foco estiver em input/textarea.

- [ ] **Step 4: Implementar fila de geração**

Reaproveitar o padrão de refs da página de Clientes: uma execução por vez,
cancelável no unmount, continuando após fallback. **Enviar campanha** só fica
habilitado quando todos os não enviados estiverem aprovados ou explicitamente
falhos/pulados.

Run: `npm test -- tests/rosComponents.test.tsx && npm run build`  
Expected: PASS e build concluído.

- [ ] **Step 5: Commit**

```powershell
git add components/ros/RosEmailEditor.tsx app/ros/review/page.tsx tests/rosComponents.test.tsx
git commit -m "feat: adiciona revisao de emails ROS"
```

### Task 13: Envio, resultados e histórico ROS

**Files:**
- Create: `lib/ros/sendQueue.ts`
- Create: `app/ros/sending/page.tsx`
- Create: `app/ros/sent/page.tsx`
- Create: `app/ros/campaigns/page.tsx`
- Modify: `tests/rosComponents.test.tsx`

**Interfaces:**
- Consumes: preflight, contatos aprovados/falhos, send/finalize/events e store ROS.
- Produces: disparo sequencial recuperável, resumo, export CSV e histórico filtrado.

- [ ] **Step 1: Escrever teste do seletor de reenvio**

Adicionar e exportar a função pura:

```ts
export function getRosSendQueue(contacts: RosContact[]): RosContact[] {
  return contacts.filter((contact) => contact.status === 'approved' || contact.status === 'failed')
}
```

Teste:

```ts
it('nunca recoloca contato enviado na fila', async () => {
  const { getRosSendQueue } = await import('@/lib/ros/sendQueue')
  const base = { firstName: '', lastName: '', fullName: '', email: '', company: '', position: '', generatedSubject: '', generatedBody: '', editedSubject: '', editedBody: '', sendAttempts: 0 }
  expect(getRosSendQueue([{ ...base, id: '1', status: 'sent' }, { ...base, id: '2', status: 'failed' }])).toEqual([expect.objectContaining({ id: '2' })])
})
```

- [ ] **Step 2: Executar para confirmar falha**

Run: `npm test -- tests/rosComponents.test.tsx`  
Expected: FAIL por página/função ausente.

- [ ] **Step 3: Implementar sending**

Executar `/api/ros/preflight` antes de liberar **Enviar**. Mostrar cada check com
status e mensagem. Processar fila sequencial com intervalo de 750 ms; atualizar
o store após cada resposta; um erro não interrompe os demais. Em reload, recalcular
a fila e ignorar `sent`/`sending`; `sending` antigo deve ser reconciliado com o
servidor antes de voltar a `failed`.

- [ ] **Step 4: Implementar sent e campaigns**

`sent` mostra enviados, falhos, suprimidos, entregues, abertos e clicados; permite
exportar CSV e repetir apenas falhas. `campaigns` consulta somente
`campaign_kind = 'ros'`, reabre campanha sem alterar `sent` e exclui por cascade.
Depois do lote, chamar `/api/ros/finalize-campaign` mesmo quando houver falhas.

Run: `npm test -- tests/rosComponents.test.tsx && npm run build`  
Expected: PASS e build concluído.

- [ ] **Step 5: Commit**

```powershell
git add lib/ros/sendQueue.ts app/ros/sending/page.tsx app/ros/sent/page.tsx app/ros/campaigns/page.tsx tests/rosComponents.test.tsx
git commit -m "feat: conclui envio e historico de campanhas ROS"
```

### Task 14: Compatibilidade de Clientes, configuração e aceite final

**Files:**
- Modify: `app/api/clients/save-campaign/route.ts:31-54`
- Modify: `app/api/clients/finalize-campaign/route.ts:1-37`
- Modify: `app/clients/campaigns/page.tsx:1-238`
- Modify: `app/api/clients/send/route.ts:111-185`
- Modify: `lib/outreach/repository.ts`
- Modify: `.env.example:1-8`
- Modify: `tests/campaignKind.test.ts`
- Modify: `tests/rosSend.test.ts`

**Interfaces:**
- Consumes: schema e infraestrutura compartilhada concluídos.
- Produces: Clientes explicitamente isolado como `clients`, documentação de ambiente e evidência de aceite.

- [ ] **Step 1: Escrever regressões de Clientes**

```ts
it('mapeia campanhas antigas e novas de Clientes como clients', () => {
  const config = { recruiterName: 'Ana', recruiterEmail: 'ana@recrutae.com.br', recruiterRole: '', recruiterLinkedin: '', replyTo: 'ana@recrutae.com.br', segment: '', emailTemplate: 'Corpo', subjectTemplate: 'Assunto' }
  expect(mapClientCampaignRow({ id: 'c1', name: 'Clientes', status: 'draft', totalContacts: 0 }, config)).toMatchObject({ campaign_kind: 'clients' })
})

it('a consulta de Clientes exclui campanhas ROS', () => {
  expect(clientCampaignKindFilter).toEqual({ column: 'campaign_kind', value: 'clients' })
})
```

- [ ] **Step 2: Executar para confirmar falha**

Run: `npm test -- tests/campaignKind.test.ts`  
Expected: FAIL enquanto o fluxo de Clientes não grava/filtra o discriminador.

- [ ] **Step 3: Aplicar isolamento e supressão a Clientes**

`save-campaign` grava `campaign_kind: 'clients'`; listagens e finalização validam
esse tipo. A rota de envio de Clientes consulta a mesma supressão e usa a chave
`clients/<campaignId>/<contactId>`, preservando remetente, assinatura e interface
atuais. Exportar do repositório:

```ts
export const clientCampaignKindFilter = { column: 'campaign_kind', value: 'clients' } as const
export function mapClientCampaignRow(
  campaign: Pick<ClientCampaign, 'id' | 'name' | 'status' | 'totalContacts'>,
  config: ClientCampaignConfig,
): Record<string, unknown>
```

- [ ] **Step 4: Documentar ambiente e executar verificação completa**

Adicionar a `.env.example`, sem valores reais:

```env
ROS_FROM_EMAIL=contato@recrutae.com.br
APP_BASE_URL=https://mail.example.com
UNSUBSCRIBE_SIGNING_SECRET=use-at-least-32-random-characters
RESEND_WEBHOOK_SECRET=configure-the-same-secret-in-resend
NEXT_PUBLIC_SUPABASE_URL=https://project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=public-anon-key
SUPABASE_SERVICE_ROLE_KEY=server-only-service-role-key
```

Run:

```powershell
npm test
npm run lint
npm run build
git diff --check
```

Expected: todos os testes passam; lint/build terminam sem novo erro; `git diff --check` sem whitespace errors.

Iniciar `npm run dev` e verificar no navegador, sem disparo externo:

1. home com três cards em desktop e mobile;
2. CSV com ordem `email, empresa, nome, cargo` e contato manual;
3. compose com preview/assinatura `Recrutaê | OS`;
4. geração com fallback e edição/aprovação;
5. preflight bloqueando configuração local incompleta;
6. histórico ROS sem campanhas de Clientes;
7. `/unsubscribe` acessível sem login e sem descadastrar no GET.

- [ ] **Step 5: Commit**

```powershell
git add app/api/clients/save-campaign/route.ts app/api/clients/finalize-campaign/route.ts app/clients/campaigns/page.tsx app/api/clients/send/route.ts lib/outreach/repository.ts .env.example tests/campaignKind.test.ts tests/rosSend.test.ts
git commit -m "feat: finaliza divulgacao segura do Recrutae OS"
```

## Completion Criteria

- A home oferece Candidatos, Clientes e Divulgação ROS.
- O fluxo `/ros` funciona de importação até histórico, com tela responsiva.
- A assinatura enviada e a prévia usam o monograma oficial e `Recrutaê | OS`.
- A IA nunca excede o limite aceito sem cair para o texto-base preenchido.
- Contatos enviados, suprimidos ou reservados não recebem duplicata.
- Descadastro de um clique, bounce e complaint persistem supressão global.
- Clientes e ROS ficam isolados por `campaign_kind`.
- `npm test`, `npm run lint`, `npm run build` e `git diff --check` passam.
