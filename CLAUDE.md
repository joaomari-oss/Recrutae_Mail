# Recrutaê Mail — Guia para o Claude

Plataforma interna da Recrutaê para envio em massa de e-mails de outreach a candidatos. O recrutador faz upload de um CSV do Apollo.io, configura a vaga, revisa os e-mails gerados por IA e os envia via Resend.

---

## Stack

| Camada       | Tecnologia                                      |
|--------------|-------------------------------------------------|
| Framework    | Next.js 14 (App Router) + TypeScript            |
| Estilização  | Tailwind CSS + shadcn/ui (customizado)          |
| Estado       | Zustand com `persist` (localStorage)            |
| E-mail       | Resend SDK v3                                   |
| IA           | OpenAI `gpt-4o-mini` + Groq `llama-3.3-70b` (fallback) |
| Upload CSV   | react-dropzone + papaparse                      |
| Animações    | CSS puro (keyframes em `globals.css`)           |
| Confetti     | canvas-confetti                                 |
| Toasts       | sonner                                          |
| Ícones       | Lucide React                                    |

---

## Variáveis de Ambiente

Arquivo `.env.local` (nunca commitar — está no `.gitignore`):

```env
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=seu@dominio.com
OPENAI_API_KEY=sk-...
GROQ_API_KEY=gsk_...
```

- `RESEND_FROM_EMAIL` deve ser um domínio verificado no Resend.
- A IA padrão é OpenAI. Se atingir quota (HTTP 429), o app pergunta ao usuário se quer trocar para Groq.

---

## Estrutura de Pastas

```
app/
  api/
    generate/route.ts   # Gera e-mail via OpenAI ou Groq
    send/route.ts       # Envia via Resend
    recover/route.ts    # Recupera histórico do Resend
  campaign/page.tsx     # Configuração da campanha (com sidebar)
  campaigns/page.tsx    # Listagem de todas as campanhas (com sidebar)
  emails/page.tsx       # Histórico global de e-mails (com sidebar)
  review/page.tsx       # Revisão e edição dos e-mails (com sidebar)
  sending/page.tsx      # Envio em progresso (com sidebar)
  sent/page.tsx         # Resultados da campanha atual (com sidebar)
  page.tsx              # Upload do CSV — SEM sidebar, full-screen
  layout.tsx            # Root layout: fontes, ClientLayout, Toaster
  globals.css           # Variáveis CSS, animações, tokens de marca

components/
  ClientLayout.tsx      # Decide se mostra sidebar (não mostra em "/")
  Sidebar.tsx           # Navegação lateral colapsável (60px / 220px)
  navbar.tsx            # ⚠️ OBSOLETO — substituído por Sidebar/ClientLayout
  ui/
    StatusBadge.tsx     # Badge semântico de status do candidato
    CandidateCard.tsx   # Card da lista de revisão com avatar coral
    EmailEditor.tsx     # Painel de edição de e-mail (direita na /review)
    badge.tsx           # shadcn Badge com variantes de marca
    button.tsx          # shadcn Button com estilo coral
    card.tsx            # shadcn Card com fundo charcoal
    dialog.tsx          # shadcn Dialog com fundo charcoal
    input.tsx           # shadcn Input dark-themed
    textarea.tsx        # shadcn Textarea dark-themed
    progress.tsx        # shadcn Progress com gradiente coral
    tabs.tsx            # shadcn Tabs com ativo coral
    [demais shadcn]     # scroll-area, separator, label, sonner, table

lib/
  types.ts              # Tipos: Candidate, Campaign, CampaignConfig, SentEmail, etc.
  utils.ts              # cn(), parseCSVFile(), delay(), formatDate(), exportToCSV(), getStatusLabel()

store/
  index.ts              # Zustand store com persist (chave: "recrutae-v2")

public/
  recrutae.webp         # Logo (copiado de /assets/ — necessário em /public para Next.js)

assets/
  recrutae.webp         # Original da logo (não servido pelo Next.js)
```

---

## Identidade Visual — REGRAS CRÍTICAS

### Paleta de Cores

```css
--brand-coral:    #F26A4F   /* primária — botões, acentos, ativo */
--brand-orange:   #F4845F   /* hover dos botões */
--brand-dark:     #1A1A2E   /* background principal */
--brand-charcoal: #2D2D44   /* cards, sidebar, superfícies */
--brand-white:    #FAFAF8   /* textos principais */
--brand-muted:    #9A9AB0   /* textos secundários */
--brand-success:  #4ECB8D   /* status enviado */
--brand-warning:  #F5A623   /* status pendente/pronto */
--brand-error:    #E85D5D   /* status falhou */
```

No Tailwind usam-se como `text-brand-coral`, `bg-brand-dark`, `border-brand-success/20`, etc.

### Tipografia

| Família        | Uso                                       | Classe Tailwind  |
|----------------|-------------------------------------------|------------------|
| **Fraunces**   | Headings (h1, h2, h3, h4)                | `font-display`   |
| **DM Sans**    | Corpo, labels, botões, inputs             | `font-sans`      |
| **JetBrains Mono** | E-mails, dados, código, assuntos    | `font-mono` / `.email-body` |

Fontes carregadas via `@import` no topo do `globals.css`.

### Nunca fazer

- ❌ Fundo branco ou cinza claro
- ❌ Gradiente roxo
- ❌ Usar Inter, Roboto, Arial ou fontes do sistema
- ❌ Botões pill (border-radius exagerado)
- ❌ Animações longas ou que travem o fluxo
- ❌ Cards sem profundidade (sem `bg-brand-charcoal`)
- ❌ Layout sem sidebar nas páginas internas
- ❌ Qualquer texto ao lado da logo

### Botão Primário

```tsx
<button className="btn-coral ...">  // classe utilitária em globals.css
// ou via shadcn:
<Button>  // variant="default" já usa coral
```

`btn-coral` aplica: `background: #F26A4F`, hover com escala `1.02` e `box-shadow` coral.

---

## Fluxo da Aplicação

```
/ (Upload)
  ↓ usuário solta CSV → parseCSVFile() → preview → createCampaign() no store
/campaign
  ↓ usuário preenche cargo, empresa, descrição → setCampaignConfig() → router.push('/review')
/review
  ↓ auto-gera e-mails (POST /api/generate) → usuário aprova/edita/regenera → router.push('/sending')
/sending
  ↓ usuário clica "Enviar" → POST /api/send sequencial (delay 500ms entre cada) → router.push('/sent')
/sent
  ↓ resultados, export CSV
/campaigns   → listagem de todas as campanhas do store
/emails      → histórico global de todos os envios (GET /api/recover para sincronizar com Resend)
```

---

## Store Zustand (`store/index.ts`)

Chave de persistência: `"recrutae-v2"` (localStorage).

### Estado principal

```ts
campaigns:             Campaign[]
activeCampaignId:      string | null
candidatesByCampaign:  Record<string, Candidate[]>
campaignConfigById:    Record<string, CampaignConfig>
sentEmails:            SentEmail[]
```

### Ações importantes

| Ação                           | O que faz                                          |
|--------------------------------|----------------------------------------------------|
| `createCampaign(name, cands)`  | Cria campanha, salva candidatos, seta como ativa   |
| `updateCandidate(cId, id, upd)`| Atualiza status/campos de um candidato             |
| `approveAll(campaignId)`       | Aprova todos os candidatos com status `ready`      |
| `setCampaignConfig(cId, cfg)`  | Salva configuração de IA/recrutador para a campanha|
| `addSentEmail(email)`          | Adiciona ao histórico global de envios             |
| `deleteCampaign(id)`           | Remove campanha e seus candidatos do store         |
| `reopenCampaign(id)`           | Reseta candidatos não-enviados para `pending`      |

### Tipos de status do candidato

```ts
type CandidateStatus =
  | 'pending'     // aguardando geração
  | 'generating'  // IA gerando e-mail
  | 'ready'       // gerado, aguardando aprovação
  | 'approved'    // aprovado pelo recrutador
  | 'sending'     // sendo enviado agora
  | 'sent'        // enviado com sucesso
  | 'failed'      // falhou (geração ou envio)
```

---

## API Routes

### `POST /api/generate`

Gera assunto + corpo do e-mail via OpenAI ou Groq.

**Body:** `GenerateEmailRequest` (ver `lib/types.ts`)  
**Resposta OK:** `{ subject: string, body: string }`  
**Resposta de quota:** `{ error: string, quotaExceeded: true }` com status 429

- Provider padrão: `openai`. Troca para `groq` se `aiProvider: 'groq'` no body.
- O prompt do sistema fica em `buildSystemPrompt()` e é muito específico — não alterar levianamente.
- `ensureGreeting()` garante que o e-mail sempre começa com `"Olá, {firstName}!"`.

### `POST /api/send`

Envia um e-mail via Resend.

**Body:** `SendEmailRequest` (`to`, `subject`, `body`, `candidateName`, `recruiterName?`)  
**Resposta OK:** `{ success: true, messageId: string }`  
**Remetente:** `"{recruiterName} - Recrutae Talent <{RESEND_FROM_EMAIL}>"`

### `GET /api/recover`

Busca e-mails enviados diretamente da API REST do Resend (SDK v3 não tem `emails.list()`).  
Mapeia para o formato `SentEmail` do store. Útil quando o localStorage foi perdido.

---

## Componentes Chave

### `Sidebar.tsx`

- Colapsável: `60px` (recolhida) / `220px` (expandida) via `useState`
- Toggle no rodapé com botão `ChevronLeft` / `ChevronRight`
- Tooltip aparece nos ícones quando recolhida (hover)
- Indicador de rota ativa: borda esquerda coral + fundo `bg-brand-coral/10`
- Logo `recrutae.webp` no topo (sem texto ao lado — regra de marca)
- Rotas: `/` Upload, `/campaign`, `/review`, `/sending`, `/sent`, `/campaigns`, `/emails`

### `ClientLayout.tsx`

- Usa `usePathname()` para detectar se está em `/`
- Em `/`: renderiza apenas `{children}` (sem sidebar)
- Nas demais: `<Sidebar /> + <main>{children}</main>` em flex

### `EmailEditor.tsx`

- Auto-save com debounce de 500ms via `updateCandidate()`
- Sincroniza `localSubject`/`localBody` quando status muda de `generating` → `ready`
- Estado de loading com spinner coral + skeleton animado
- Estado de erro com botão de retry
- Ações: Aprovar (`btn-coral`), Regenerar (outline), Pular (ghost)
- Hint de atalhos: `[A]` `[R]` `[→]`

### `CandidateCard.tsx`

- Avatar com iniciais (2 letras) em fundo `bg-brand-coral/20`
- `isSelected`: borda esquerda coral + fundo sutil
- Animação `animate-fade-up` com `animation-delay` escalonado por índice
- Exibe nome, cargo · empresa e `StatusBadge`

### `StatusBadge.tsx`

- Mapeia `CandidateStatus` para cor semântica (brand)
- `generating` e `sending` têm `animate-pulse`
- Não depende do shadcn Badge — implementação própria

---

## Página `/review` — Detalhes

Layout split 35% / 65%:

- **Esquerda (35%):** lista de candidatos, progress bars de geração e aprovação, botões de ação em massa
- **Direita (65%):** `EmailEditor` para o candidato selecionado, hint de atalhos de teclado

Geração automática:
- `useEffect` dispara quando `campaignConfig` existe e há candidatos `pending`
- `generatingRef.current` evita múltiplas execuções simultâneas
- `abortGenerationRef.current` permite cancelamento

Quota handling:
- Se receber `quotaExceeded: true`, pausa e exibe dialog
- Dialog usa `Promise` + `ref` para ser `await`-able dentro do loop
- Usuário pode trocar de provider ou parar a campanha

Confetti:
- Dispara quando todos os candidatos estão `approved` ou `sent`
- `confettiFiredRef` evita disparo repetido
- Usa `canvas-confetti` com cores da marca

---

## CSS e Animações

### Keyframes disponíveis (globals.css)

| Animação          | Classe Tailwind           | Uso                              |
|-------------------|---------------------------|----------------------------------|
| `fade-up`         | `animate-fade-up`         | Entrada de cards e seções        |
| `fade-in`         | `animate-fade-in`         | Overlays, modais                 |
| `slide-in-left`   | `animate-slide-left`      | Painel esquerdo                  |
| `shimmer`         | `.skeleton`               | Skeleton loading                 |
| `bounce-subtle`   | `animate-bounce-subtle`   | Ícone de upload no dragover      |

### Stagger (revelação escalonada)

```tsx
// Aplica delay de 30ms por item
<div
  className="animate-fade-up opacity-0"
  style={{ animationDelay: `${index * 30}ms`, animationFillMode: 'forwards' }}
/>
```

Classes `.stagger-1` a `.stagger-8` para delays fixos (30ms, 60ms, … 240ms).

### `.btn-coral`

Classe utilitária que aplica:
- `background: #F26A4F`
- `hover: scale(1.02) + box-shadow coral`
- `active: scale(0.99)`
- `transition: 150ms ease-out`

### `.email-body`

Classe para renderizar conteúdo de e-mail:
- `font-family: JetBrains Mono`
- `font-size: 0.8125rem`
- `line-height: 1.7`

---

## Regras de Desenvolvimento

1. **Lógica de negócio:** toda a lógica de geração, envio e gerenciamento de estado está em `store/index.ts`, `app/api/*/route.ts` e nas pages. Não duplicar.

2. **Componentes visuais:** preferir componentes em `components/ui/` para reutilização. Não criar componentes inline em pages para coisas que usam mais de uma vez.

3. **Tema:** sempre dark. Nunca usar `bg-white`, `bg-gray-*` ou similar sem prefixo `brand-`.

4. **Fontes:** usar `font-display` (Fraunces) para headings, `font-mono` ou `.email-body` para conteúdo de e-mail.

5. **Animações:** usar `animate-fade-up` + `animationFillMode: 'forwards'` para revelações. Não usar `opacity-0` sem `animationFillMode` ou o elemento fica invisível.

6. **TypeScript:** as inferências do Zustand têm problemas circulares conhecidos em `store/index.ts`. Os erros `TS7006` nos callbacks de filter/map são cascata desse problema — não afetam o runtime.

7. **Ícones:** usar exclusivamente `lucide-react`. Não instalar outras bibliotecas de ícones.

8. **Sem framer-motion:** as animações são puramente CSS. Não instalar framer-motion.

9. **Logo:** o arquivo `public/recrutae.webp` deve existir. Se for perdido, copiar de `assets/recrutae.webp`. Usar com `<Image>` do Next.js, sem texto ao lado.

10. **navbar.tsx:** arquivo obsoleto, não removido para evitar quebrar imports potenciais. Não usar em novas pages — usar `Sidebar`/`ClientLayout`.

---

## Comandos

```bash
npm run dev      # Inicia servidor de desenvolvimento em localhost:3000
npm run build    # Build de produção (pode ter avisos de TS — esperado)
npm run start    # Inicia servidor de produção após build
npm run lint     # ESLint
```

---

## Considerações de Deploy

- Requer Node.js 18+
- Variáveis de ambiente devem ser configuradas na plataforma de deploy (Vercel, etc.)
- `RESEND_FROM_EMAIL` precisa ser um e-mail de domínio verificado no painel do Resend
- O domínio deve ter SPF, DKIM e DMARC configurados para evitar spam
- Não há banco de dados — tudo persiste no localStorage do navegador via Zustand
