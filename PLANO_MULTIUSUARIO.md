# Plano de Implementação — Sistema Multi-usuário com Supabase

Este documento descreve, passo a passo, a migração do Recrutaê Mail de uma aplicação single-user (localStorage) para uma aplicação multi-usuário com autenticação e banco de dados.

**Stack escolhida:** Supabase (Auth + PostgreSQL + Row Level Security)
**Motivo:** Free tier generoso (500MB DB, 50k MAU), integração oficial com Next.js 14 App Router, RLS enforça isolamento de dados no próprio banco.

---

## Visão Geral

| Fase | Objetivo | Tempo estimado |
|------|----------|----------------|
| 1 | Criar projeto Supabase e schema do banco | 30 min |
| 2 | Instalar SDK e configurar variáveis de ambiente | 15 min |
| 3 | Criar cliente Supabase (browser + server) | 20 min |
| 4 | Implementar páginas de login/signup/logout | 45 min |
| 5 | Criar middleware de proteção de rotas | 20 min |
| 6 | Proteger API routes (`/api/generate`, `/api/send`, `/api/recover`) | 30 min |
| 7 | Migrar Zustand store → Supabase (maior esforço) | 2-3 horas |
| 8 | Atualizar páginas consumidoras do store | 1-2 horas |
| 9 | Adicionar UI de usuário na Sidebar | 30 min |
| 10 | Testar com múltiplos usuários e fazer deploy | 1 hora |

**Total:** ~7-9 horas de trabalho concentrado.

---

## Pré-requisitos

- Conta no Supabase ([supabase.com](https://supabase.com)) — gratuita
- Acesso ao painel do Vercel (se já estiver deployado)
- Git repo limpo antes de começar (faça commit do estado atual)

---

## FASE 1 — Criar Projeto Supabase e Schema

### O que fazer manualmente (você)

1. Acesse [supabase.com](https://supabase.com) e crie uma nova organização
2. Clique em **"New Project"**:
   - Nome: `recrutae-mail`
   - Senha do banco: gere uma forte e salve no seu gerenciador de senhas
   - Região: `South America (São Paulo)` ou mais próxima
3. Aguarde ~2 minutos até o provisionamento terminar
4. Em **Settings → API**, copie:
   - `Project URL` (ex: `https://xxxxx.supabase.co`)
   - `anon public key`
   - `service_role key` (NUNCA exponha no frontend)

### Schema das tabelas

Vamos criar 4 tabelas principais, todas com `user_id` referenciando `auth.users`:

- `campaigns` — campanhas de cada recrutador
- `candidates` — candidatos de cada campanha
- `campaign_configs` — config de IA/recrutador por campanha
- `sent_emails` — histórico global de envios por usuário

### Prompt para o Claude Code

```
Crie um arquivo supabase/schema.sql na raiz do projeto com o schema completo do banco de dados para o Recrutaê Mail.

Requisitos:
1. Usar UUIDs como primary keys (gen_random_uuid())
2. Todas as tabelas devem ter user_id UUID referenciando auth.users(id) ON DELETE CASCADE
3. Todas as tabelas devem ter created_at e updated_at (timestamptz, default now())
4. Criar trigger para atualizar updated_at automaticamente
5. Tabelas necessárias (baseadas em lib/types.ts):
   - campaigns: id, user_id, name, status, total_candidates, approved_count, sent_count, failed_count, created_at, updated_at
   - candidates: id, campaign_id (FK), user_id, first_name, last_name, full_name, title, company, email, linkedin_url, status, generated_subject, generated_body, edited_subject, edited_body, sent_at, error_message, created_at, updated_at
   - campaign_configs: id, campaign_id (FK UNIQUE), user_id, role, job_description, link, hiring_company, recruiter_name, recruiter_company, recruiter_linkedin, ai_provider, created_at, updated_at
   - sent_emails: id, user_id, campaign_id, campaign_name, candidate_name, company, email, subject, body, status, error_message, sent_at, created_at
6. ON DELETE CASCADE de campaigns → candidates, campaign_configs, sent_emails
7. Criar índices em: campaigns(user_id, created_at DESC), candidates(campaign_id), sent_emails(user_id, sent_at DESC)
8. ATIVAR Row Level Security em todas as tabelas
9. Criar policies "Users can only see/modify their own data" para SELECT, INSERT, UPDATE, DELETE usando auth.uid() = user_id
10. Os enums de status devem permitir os valores definidos em lib/types.ts (CandidateStatus e CampaignStatus)

Após criar o arquivo, explique como executar o schema no SQL Editor do Supabase.
```

---

## FASE 2 — Instalar SDK e Configurar Ambiente

### Prompt para o Claude Code

```
Instale as dependências necessárias do Supabase e atualize as variáveis de ambiente.

1. Execute: npm install @supabase/supabase-js @supabase/ssr
2. Atualize .env.local adicionando:
   - NEXT_PUBLIC_SUPABASE_URL=
   - NEXT_PUBLIC_SUPABASE_ANON_KEY=
   - SUPABASE_SERVICE_ROLE_KEY= (apenas servidor, nunca usar no cliente)
3. Atualize .env.local.example (crie se não existir) com os mesmos campos vazios, para documentar
4. Atualize o CLAUDE.md na seção "Variáveis de Ambiente" para listar as novas variáveis do Supabase
5. NÃO commitar .env.local (já está no .gitignore)

Deixe os valores em branco — eu vou preenchê-los manualmente com as chaves do meu projeto Supabase.
```

---

## FASE 3 — Criar Clientes Supabase

O Supabase exige três tipos de cliente no Next.js App Router:
- **Browser** (Client Components)
- **Server** (Server Components, Server Actions, Route Handlers)
- **Middleware** (renovação de sessão)

### Prompt para o Claude Code

```
Crie os clientes Supabase para Next.js 14 App Router seguindo a documentação oficial do @supabase/ssr.

Arquivos a criar:

1. lib/supabase/client.ts — cliente para Client Components (browser)
   - Função createClient() que retorna createBrowserClient usando NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY

2. lib/supabase/server.ts — cliente para Server Components / Route Handlers
   - Função createClient() async que usa cookies() do next/headers
   - Deve usar createServerClient de @supabase/ssr
   - Implementar getAll() e setAll() corretamente tratando o caso de Server Components (try/catch no setAll)

3. lib/supabase/middleware.ts — helper para renovar sessão no middleware
   - Função updateSession(request: NextRequest) que renova o token e redireciona para /login se não autenticado
   - Rotas públicas: /login, /signup, /auth/callback
   - Todas as outras rotas exigem sessão válida

4. lib/supabase/types.ts — tipos TypeScript gerados do schema
   - Por enquanto, defina manualmente um tipo Database com as tabelas: campaigns, candidates, campaign_configs, sent_emails
   - Seguir a estrutura oficial do Supabase: { public: { Tables: { ... } } }
   - Posteriormente isso pode ser auto-gerado com `supabase gen types`

Siga exatamente as recomendações de https://supabase.com/docs/guides/auth/server-side/nextjs para evitar problemas de sessão.
```

---

## FASE 4 — Páginas de Login, Signup e Logout

### Prompt para o Claude Code

```
Crie as páginas de autenticação seguindo a identidade visual da Recrutaê (dark theme, fonte Fraunces para headings, botão coral, logo centralizada).

Arquivos a criar:

1. app/login/page.tsx — Server Component
   - Layout centralizado vertical/horizontal, fundo bg-brand-dark
   - Logo recrutae.webp no topo (Image do Next.js)
   - Card bg-brand-charcoal com: título "Entrar" (font-display), inputs de email/senha, botão "Entrar" (btn-coral), link "Não tem conta? Criar conta" → /signup
   - Usar <LoginForm /> como Client Component separado para lidar com o submit

2. app/signup/page.tsx — Server Component
   - Mesma estética do login
   - Título "Criar conta", inputs: nome completo, email, senha (mínimo 8 chars)
   - Botão "Criar conta", link "Já tem conta? Entrar" → /login
   - Usar <SignupForm /> Client Component

3. components/auth/LoginForm.tsx — Client Component
   - useState para email, senha, loading, error
   - onSubmit: chama supabase.auth.signInWithPassword()
   - Em sucesso: router.push('/') e router.refresh()
   - Em erro: exibir mensagem via sonner toast
   - Usar toast de erro em português ("Credenciais inválidas", "Email não confirmado", etc.)

4. components/auth/SignupForm.tsx — Client Component
   - Chama supabase.auth.signUp() com options.data.full_name para salvar nome no user_metadata
   - Exibe mensagem de "Verifique seu email para confirmar a conta" após sucesso
   - Tratar erros: email já existe, senha fraca

5. app/auth/callback/route.ts — Route Handler para callback de confirmação de email
   - GET que pega o code da query string, troca por sessão via supabase.auth.exchangeCodeForSession
   - Redireciona para / após sucesso

6. app/logout/route.ts — Route Handler POST
   - Chama supabase.auth.signOut()
   - Redireciona para /login

IMPORTANTE: NÃO modificar ClientLayout.tsx ainda — ainda usamos Sidebar em todas as rotas exceto /. Nas fases seguintes, também vamos excluir a Sidebar em /login e /signup.
```

---

## FASE 5 — Middleware de Proteção de Rotas

### Prompt para o Claude Code

```
Crie o middleware Next.js para proteger rotas que exigem autenticação.

1. Criar middleware.ts na raiz do projeto:
   - Importar updateSession de lib/supabase/middleware
   - export async function middleware(request) que chama updateSession
   - export const config com matcher excluindo:
     - _next/static, _next/image, favicon.ico
     - Arquivos estáticos (svg, png, jpg, jpeg, gif, webp, ico)
     - Rotas de API que não exigem auth (nenhuma por enquanto — todas exigem)
   - Matcher sugerido: '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'

2. Atualizar lib/supabase/middleware.ts para:
   - Após getUser(), se user é null E a rota NÃO é pública (/login, /signup, /auth/callback):
     - Redirecionar para /login preservando o pathname de destino em ?redirect=
   - Se user existe E está em /login ou /signup:
     - Redirecionar para /
   - Retornar a NextResponse com cookies atualizados

3. Atualizar components/ClientLayout.tsx:
   - Esconder a Sidebar também em /login e /signup (não só em /)
   - Usar array de rotas sem sidebar: ['/', '/login', '/signup']

Teste localmente: ao acessar / sem login, deve redirecionar para /login.
```

---

## FASE 6 — Proteger API Routes

### Prompt para o Claude Code

```
Adicione verificação de autenticação em todas as API routes existentes. Sem login válido, devem retornar 401.

Arquivos a atualizar:

1. app/api/generate/route.ts
   - No início do POST handler, criar supabase = await createClient() (de lib/supabase/server)
   - const { data: { user } } = await supabase.auth.getUser()
   - Se !user: return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
   - Resto da lógica permanece igual

2. app/api/send/route.ts
   - Mesma proteção de auth no início
   - Após enviar, criar registro na tabela sent_emails com user_id = user.id
   - Nota: o insert no banco será feito diretamente aqui (não via store) porque a API route é o ponto canônico de envio

3. app/api/recover/route.ts
   - Mesma proteção de auth
   - Filtrar apenas emails enviados pelo user.id atual (se a Resend API retornar todos, filtrar por from ou tag)
   - Alternativa: usar a tabela sent_emails como fonte principal, e apenas sincronizar com Resend periodicamente

NÃO alterar a lógica de negócio (prompts, chamadas à OpenAI/Groq/Resend). Apenas adicionar a camada de auth.
```

---

## FASE 7 — Migrar Zustand Store para Supabase (CRÍTICA)

Esta é a fase mais complexa. O objetivo é substituir o localStorage persist por chamadas ao Supabase, mantendo o Zustand como estado de UI reativo.

### Estratégia

- Zustand continua sendo a fonte de verdade em **runtime** (UI reativa)
- Ao montar a aplicação, carrega dados do Supabase para o store
- Cada ação (create/update/delete) faz a chamada ao Supabase E atualiza o store local
- Remover o middleware `persist` (não precisa mais do localStorage)

### Prompt para o Claude Code

```
Refatore store/index.ts para substituir a persistência em localStorage por chamadas ao Supabase, mantendo a reatividade do Zustand.

Contexto:
- O store atual está em store/index.ts com persist em localStorage (chave "recrutae-v2")
- Todas as ações de CRUD devem agora:
  1. Fazer a operação no Supabase (via cliente browser de lib/supabase/client.ts)
  2. Em caso de sucesso, atualizar o estado do Zustand
  3. Em caso de erro, disparar toast de erro via sonner e NÃO atualizar estado

Mudanças detalhadas:

1. REMOVER o middleware `persist` e `createJSONStorage` / `safeStorage`
   - Agora o estado é carregado do Supabase, não do localStorage

2. Adicionar novas ações:
   - loadUserData(): busca campaigns, candidates, configs, sentEmails do usuário logado e popula o store
   - isLoading: boolean — true enquanto loadUserData está rodando

3. Converter ações síncronas em async:
   - createCampaign → insere em campaigns + insere candidates em batch → retorna o id
   - updateCampaign → update em campaigns where id = X and user_id = auth.uid()
   - updateCandidate → update em candidates
   - approveAll → update em batch de candidates
   - setCampaignConfig → upsert em campaign_configs
   - addSentEmail → insert em sent_emails (obs: idealmente feito pela API route, mas mantemos aqui para casos especiais)
   - deleteCampaign → delete em campaigns (cascade remove o resto)
   - reopenCampaign → update em batch

4. Mapeamento de nomes (snake_case no DB ↔ camelCase no TS):
   - Criar funções helper em lib/supabase/mappers.ts:
     - mapCampaignFromDB(row) → Campaign
     - mapCampaignToDB(campaign) → Row de insert
     - mapCandidateFromDB / mapCandidateToDB
     - mapCampaignConfigFromDB / mapCampaignConfigToDB
     - mapSentEmailFromDB / mapSentEmailToDB

5. Manter os getters síncronos (getActiveCandidates, getActiveConfig, getActiveCampaign) — eles só leem do estado local

6. Obter o userId via supabase.auth.getUser() no início de cada ação que precisa (ou armazenar no store após loadUserData)

Não mude ainda as páginas que consomem o store — isso é a próxima fase.
Apenas garanta que o store compila e que as assinaturas das funções mudaram para Promise<T>.

Documente no próprio arquivo (comentário no topo) a mudança arquitetural.
```

---

## FASE 8 — Atualizar Páginas Consumidoras do Store

### Prompt para o Claude Code

```
Atualize todas as páginas que consomem o store para lidar com as novas ações assíncronas e com o carregamento inicial de dados do Supabase.

Contexto: na fase anterior, todas as ações do Zustand viraram async. Agora precisamos:

1. Criar um componente components/auth/AuthProvider.tsx (Client Component):
   - useEffect no mount: chama store.loadUserData()
   - Enquanto isLoading: renderiza um skeleton/spinner em tela cheia com logo Recrutaê
   - Quando pronto: renderiza children
   - Se houver erro de carregamento: exibe mensagem + botão de retry

2. Envolver o ClientLayout com AuthProvider (apenas nas rotas autenticadas, não em /login e /signup)

3. Atualizar as páginas onde o store é chamado para lidar com await:
   - app/page.tsx: createCampaign agora é async, usar await e loading state no botão
   - app/campaign/page.tsx: setCampaignConfig async, await antes do router.push
   - app/review/page.tsx: updateCandidate, approveAll, setCampaignConfig — todos async
   - app/sending/page.tsx: updateCandidate async dentro do loop de envio
   - app/sent/page.tsx: apenas leitura, mas garantir que dados foram carregados
   - app/campaigns/page.tsx: deleteCampaign, reopenCampaign async
   - app/emails/page.tsx: setSentEmails async (se ainda chamar /api/recover)

4. Tratamento de erros:
   - Toasts via sonner em todas as falhas
   - Não quebrar a UI em caso de erro de rede

5. Mostrar loading states em botões durante operações async (disabled + spinner)

Importante: o fluxo do usuário deve continuar idêntico. A única diferença visível é o delay de rede entre ações.
```

---

## FASE 9 — UI de Usuário na Sidebar

### Prompt para o Claude Code

```
Adicione informações do usuário logado e botão de logout na Sidebar.

Atualize components/Sidebar.tsx para incluir:

1. Seção de usuário no rodapé (acima do toggle de colapsar):
   - Avatar circular com as iniciais do nome (fundo bg-brand-coral/20, texto coral)
   - Nome completo (font-sans, text-sm) — oculto quando colapsada
   - Email (font-mono, text-xs, text-brand-muted) — oculto quando colapsada
   - Botão de logout (ícone LogOut do lucide-react) à direita
   - Quando colapsada: apenas o avatar com tooltip mostrando nome e email

2. Buscar o usuário logado via supabase.auth.getUser() em um useEffect
   - Armazenar em useState local (não precisa ir pro Zustand)
   - Fallback "Carregando..." enquanto busca

3. Botão de logout:
   - onClick: fetch POST /logout → router.push('/login') → router.refresh()
   - Ou diretamente: await supabase.auth.signOut() + router.push('/login')
   - Toast de confirmação "Até logo!" antes de redirecionar

4. Usar o user.user_metadata.full_name se disponível, senão fallback para user.email

Mantenha a estética dark + coral. Não quebrar o comportamento de colapsar/expandir existente.
```

---

## FASE 10 — Testes e Deploy

### O que fazer manualmente

1. **Teste local com dois usuários:**
   - Criar conta A, criar campanha, enviar e-mails
   - Logout
   - Criar conta B, verificar que NÃO vê campanhas de A
   - Criar campanha própria
   - Logout / login como A novamente — dados intactos

2. **Configurar SMTP do Supabase** (opcional mas recomendado):
   - Em Authentication → Email Templates, customizar template de confirmação em português
   - Em Authentication → Settings, configurar SMTP próprio (ou usar o do Supabase para dev)

3. **Deploy na Vercel:**
   - Adicionar as novas variáveis de ambiente:
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - `SUPABASE_SERVICE_ROLE_KEY`
   - Redeploy

4. **Configurar Site URL no Supabase:**
   - Em Authentication → URL Configuration:
     - Site URL: `https://seu-dominio.vercel.app`
     - Redirect URLs: `https://seu-dominio.vercel.app/auth/callback`

### Prompt para o Claude Code

```
Faça uma verificação final do código garantindo que está pronto para deploy em produção.

Checklist:

1. Verificar que NÃO há uso de service_role key no frontend (buscar por SERVICE_ROLE em components/ e app/ exceto /api/)
2. Verificar que todas as API routes têm proteção de auth
3. Verificar que nenhum console.log expõe dados sensíveis de usuários
4. Verificar que o middleware.ts tem o matcher correto
5. Atualizar CLAUDE.md:
   - Nova seção "Autenticação" explicando o fluxo de login
   - Nova seção "Banco de Dados" com o schema das tabelas
   - Atualizar "Fluxo da Aplicação" incluindo /login e /signup
   - Atualizar "Regras de Desenvolvimento" com:
     - Sempre usar createClient() do server em Route Handlers
     - Sempre validar user em API routes
     - Nunca commitar chaves do Supabase
6. Criar/atualizar README.md (se não existir) com instruções de:
   - Setup local (clonar, npm install, criar .env.local, rodar schema.sql no Supabase)
   - Deploy na Vercel
7. Rodar npm run build e corrigir erros de TypeScript relacionados às mudanças (erros de Zustand pre-existentes podem permanecer conforme CLAUDE.md)
8. Rodar npm run lint

Reporte ao final: o que foi verificado, o que foi corrigido, e se o build passou.
```

---

## Ordem Recomendada de Execução

Execute os prompts **em ordem**, testando localmente após cada fase antes de partir para a próxima:

1. ✅ Fase 1 — Schema no Supabase (manual + prompt)
2. ✅ Fase 2 — Instalação de dependências
3. ✅ Fase 3 — Clientes Supabase
4. ✅ Fase 4 — Páginas de auth
5. ✅ Fase 5 — Middleware
6. **🛑 CHECKPOINT:** Testar login/logout funcionando antes de prosseguir
7. ✅ Fase 6 — Proteção de API routes
8. ✅ Fase 7 — Migração do store (MAIOR RISCO — faça commit antes)
9. ✅ Fase 8 — Atualizar páginas
10. **🛑 CHECKPOINT:** Testar fluxo completo (upload → campanha → review → envio)
11. ✅ Fase 9 — UI de usuário
12. ✅ Fase 10 — Verificação final + deploy

---

## Rollback de Emergência

Se algo der muito errado na Fase 7 ou 8, você pode voltar ao estado anterior com:

```bash
git log --oneline  # identificar o último commit estável
git reset --hard <hash-do-commit>
```

Por isso é crítico **fazer commit após cada fase bem-sucedida**.

---

## Considerações de Custo

- **Supabase free tier:** 500MB DB, 50.000 MAU, 5GB bandwidth/mês — suficiente para dezenas de recrutadores
- **Upgrade Pro:** $25/mês quando escalar, inclui backups diários e mais recursos
- **Vercel Hobby:** gratuito, suficiente para este projeto
- **Resend:** 100 e-mails/dia no free tier, $20/mês para 50k

---

## Alternativas Consideradas

| Opção | Por que não foi escolhida |
|-------|--------------------------|
| NextAuth.js + Prisma + Neon | Mais peças para manter, setup maior |
| Clerk + Planetscale | Clerk ótimo para auth, mas DB separado dobra o trabalho |
| Firebase | Ecossistema Google pesa, menos aderente a Next.js App Router |
| Auth.js + SQLite local | Não funciona em serverless (Vercel) |

**Supabase venceu pela integração única Auth + DB + RLS + boa DX com Next.js.**
