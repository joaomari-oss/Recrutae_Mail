# RecrutAe — Email Outreach para Recrutadores

Ferramenta interna para recrutadores que combina CSV do Apollo.io, geração de emails com IA (Groq) e envio via Resend.

## Funcionalidades

- **Upload CSV** — Importe contatos diretamente do Apollo.io
- **Geração com IA** — Emails personalizados usando Groq (LLaMA 3)
- **Revisão estilo Gmail** — Edite, aprove ou regenere cada email
- **Envio real** — Envio sequencial via Resend com rastreamento
- **Dashboard** — Visualize resultados, exporte CSV

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS + shadcn/ui
- Zustand (estado persistido no localStorage)
- Papaparse (CSV parsing)
- Groq SDK (LLaMA 3.3 70B)
- Resend (envio de email)

---

## Setup

### 1. Clone e instale dependências

```bash
git clone <repo-url>
cd recrutae-email
npm install
```

### 2. Configure as variáveis de ambiente

```bash
cp .env.example .env.local
```

Edite `.env.local` com suas chaves:

```env
GROQ_API_KEY=gsk_...
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=seu@email.com
```

### 3. Rode o servidor de desenvolvimento

```bash
npm run dev
```

Acesse: [http://localhost:3000](http://localhost:3000)

---

## Como obter as API Keys

### Groq API Key

1. Acesse [console.groq.com](https://console.groq.com)
2. Crie uma conta (gratuita)
3. Vá em **API Keys** → **Create API Key**
4. Copie a chave (começa com `gsk_`)
5. Cole em `GROQ_API_KEY` no `.env.local`

> **Modelo usado:** `llama-3.3-70b-versatile` — rápido e de alta qualidade para geração de texto.

### Resend API Key + Email

1. Acesse [resend.com](https://resend.com) e crie uma conta
2. Vá em **API Keys** → **Create API Key**
3. Copie a chave (começa com `re_`) e cole em `RESEND_API_KEY`
4. Vá em **Domains** e adicione/verifique seu domínio de email
5. Ou use `onboarding@resend.dev` para testes (só envia para seu email verificado)
6. Cole o email remetente em `RESEND_FROM_EMAIL`

> **Atenção:** Para enviar para qualquer email em produção, você precisa verificar um domínio no Resend.

---

## Fluxo de uso

```
1. /          → Upload do CSV exportado do Apollo.io
2. /campaign  → Configure a vaga e suas informações
3. /review    → IA gera emails, você revisa e aprova
4. /sending   → Envia todos os emails aprovados
5. /sent      → Dashboard com resultados e exportação
```

### Colunas esperadas no CSV (Apollo.io)

| Coluna no CSV       | Campo no sistema |
|---------------------|-----------------|
| First Name          | firstName        |
| Last Name           | lastName         |
| Title               | title            |
| Company             | company          |
| Email               | email (obrigatório) |
| Person Linkedin Url | linkedinUrl      |

---

## Atalhos de teclado (página de revisão)

| Tecla | Ação           |
|-------|----------------|
| `A`   | Aprovar email  |
| `R`   | Regenerar email|
| `→`   | Próximo candidato |

---

## Build para produção

```bash
npm run build
npm start
```

---

## Variáveis de ambiente

| Variável            | Obrigatória | Descrição                              |
|---------------------|-------------|----------------------------------------|
| `GROQ_API_KEY`      | Sim         | Chave da API Groq para geração de IA   |
| `RESEND_API_KEY`    | Sim         | Chave da API Resend para envio de email|
| `RESEND_FROM_EMAIL` | Sim         | Email remetente (verificado no Resend) |
