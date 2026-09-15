# Divulgação do Recrutaê OS — Design

**Data:** 2026-09-15  
**Status:** aprovado

## Objetivo

Adicionar ao Recrutaê Mail uma terceira área independente, **Divulgação ROS**, para
campanhas comerciais do Recrutaê OS. O operador importa ou cadastra contatos,
escreve o assunto e a mensagem-base, revisa personalizações de baixa variação e
envia pelo Resend com a identidade visual e a assinatura do ROS.

O fluxo deve reduzir riscos de spam e de envio duplicado. Ele não promete entrada
na caixa principal: entregabilidade depende também da reputação do domínio, do
consentimento e da qualidade da lista, do volume, de SPF/DKIM/DMARC e das reações
dos destinatários.

## Decisões aprovadas

| Questão | Decisão |
|---|---|
| Posição do ROS | Terceira área na tela inicial, ao lado de Candidatos e Clientes |
| Isolamento para o usuário | Rotas, navegação, campanhas e histórico próprios |
| Reuso interno | Núcleo compartilhado de importação, template, geração, envio e eventos |
| Entrada de contatos | CSV/Excel flexível e cadastro manual |
| Campo obrigatório do contato | Apenas e-mail; nome, empresa e cargo são opcionais |
| Variação da IA | Alvo de 5% a 8%, com limite de fidelidade e fallback determinístico |
| Assunto | Fixo por padrão; variação opcional e inicialmente desligada |
| Remetente inicial | `contato@recrutae.com.br`, substituível por outro endereço verificado do domínio |
| Assinatura | Monograma rOS pequeno, dados do remetente e texto `Recrutaê | OS` |
| Identidade | ROS: tinta, osso e amarelo, Poppins e JetBrains Mono |
| Persistência local | Store ROS separado com chave `recrutae-ros-v1` |
| Persistência remota | Tabelas comerciais existentes com `campaign_kind = 'clients' | 'ros'` |

## Arquitetura

### Limites do sistema

O fluxo de Clientes continua funcionando sem alteração visual. Código que hoje
está acoplado a `/clients` será extraído apenas quando for necessário para os dois
fluxos. O núcleo compartilhado terá unidades pequenas e testáveis:

- **Importação:** reconhece colunas, normaliza contatos, valida e deduplica.
- **Renderização:** preenche variáveis do contato antes de qualquer chamada de IA.
- **Fidelidade:** mede e limita o quanto a IA alterou o texto-base preenchido.
- **E-mail ROS:** produz HTML, texto simples, assinatura e links de descadastro.
- **Entrega:** valida supressões, reserva o contato, envia com idempotência e grava o resultado.
- **Eventos:** registra entrega, abertura, clique, bounce e reclamação; bounce definitivo e reclamação alimentam a supressão.

As páginas ROS consomem essas interfaces, mas não conhecem detalhes do Resend ou
do Supabase. APIs validam novamente todos os dados; o estado do navegador não é
tratado como fonte confiável para bloqueio de duplicados ou supressão.

### Rotas

| Rota | Responsabilidade |
|---|---|
| `/ros` | Importação, inclusão manual e conferência de contatos |
| `/ros/compose` | Mensagem-base, assunto, remetente e assinatura |
| `/ros/review` | Geração, edição e aprovação por contato |
| `/ros/sending` | Pré-checagem e progresso do envio |
| `/ros/sent` | Resultado da campanha, eventos e exportação |
| `/ros/campaigns` | Histórico exclusivo de campanhas ROS |
| `/api/ros/generate` | Personaliza um assunto/corpo sem exceder a fidelidade permitida |
| `/api/ros/send` | Envia um contato aprovado com supressão e idempotência |
| `/api/ros/save-campaign` | Persiste a campanha ROS e seus contatos |
| `/api/ros/finalize-campaign` | Consolida contadores e status final |
| `/api/ros/preflight` | Verifica configuração de envio e autenticação do domínio |
| `/api/unsubscribe` | Processa descadastro de um clique por token assinado |
| `/unsubscribe` | Confirmação humana de descadastro sem permitir abuso por scanners |

O webhook existente `/api/webhooks/resend` continua sendo a entrada única de
eventos para Clientes e ROS.

## Estado e dados

### Tipos do ROS

`RosContact` conserva os mesmos estados do fluxo comercial existente:
`pending`, `generating`, `ready`, `approved`, `sending`, `sent` e `failed`.
Ele contém nome, sobrenome, e-mail, empresa, cargo, assunto/corpo gerados e
editados, tentativas, mensagem de erro, `resendMessageId` e data de envio.

`RosCampaignConfig` contém:

- nome e cargo do remetente;
- endereço de envio e `replyTo`;
- LinkedIn e WhatsApp opcionais;
- assunto e mensagem-base;
- `varySubject`, falso por padrão;
- percentual de variação fixado no intervalo aprovado de 5% a 8%.

O Zustand usa a chave `recrutae-ros-v1`. Mensagens de contatos já enviados são
removidas do `localStorage`, seguindo o comportamento atual de Clientes.

### Supabase

O schema idempotente passa a conter:

- `client_campaigns.campaign_kind text not null default 'clients'`, restrito a
  `clients` ou `ros`;
- campos necessários para assunto, configuração da assinatura e variação da
  campanha sem guardar segredos;
- `email_suppressions`, com e-mail normalizado único, motivo
  (`unsubscribe`, `bounce` ou `complaint`), origem, `message_id` e data;
- índices por `campaign_kind`, campanha, status e e-mail normalizado.

As APIs ROS sempre escrevem `campaign_kind = 'ros'`. Listagens ROS filtram por
esse valor, e as listagens de Clientes passam a filtrar por `clients`, impedindo
vazamento de campanhas entre as duas áreas.

## Entrada de contatos

O importador aceita `.csv`, `.xlsx`, `.xls`, `.xlsm`, `.xlsb` e `.ods`, mantendo
o suporte já existente. A ordem das colunas não importa.

A detecção ocorre em duas etapas:

1. aliases normalizados em português e inglês para nome, primeiro nome,
   sobrenome, e-mail, empresa e cargo;
2. heurística por conteúdo quando o cabeçalho não for conhecido, com prioridade
   para a coluna cuja maioria dos valores tenha formato de e-mail.

E-mails são normalizados em minúsculas. Duplicados são removidos por e-mail e a
primeira linha válida é preservada. Linhas sem e-mail ou com endereço inválido
não entram na campanha e aparecem num resumo de rejeições. Nome ausente é
derivado da parte local do e-mail somente para exibição; a IA não inventa nome,
empresa ou cargo.

O cadastro manual usa os mesmos validadores e a mesma deduplicação do upload.
A tabela de conferência permite editar e excluir uma linha antes da criação da
campanha.

## Personalização e IA

Antes da IA, o renderizador determinístico substitui `{{nome}}`, `{{empresa}}`,
`{{cargo}}` e seus aliases já reconhecidos pelo projeto. Campos inexistentes são
removidos com ajuste da pontuação/preposição adjacente. A IA nunca recebe
placeholders crus.

O prompt ROS exige:

- português brasileiro natural;
- preservação da oferta, dos fatos, links, números, CTA, parágrafos e tom;
- proibição de inventar informações sobre destinatário, empresa ou ROS;
- apenas pequenas trocas de vocabulário, conectivos, pontuação e abertura;
- corpo dentro da faixa-alvo de 5% a 8% de alteração;
- assunto intacto quando `varySubject` for falso.

Uma verificação local compara texto-base preenchido e resposta. Ela rejeita
mudança de links/números, remoção do CTA, parágrafos extras ou diferença lexical
acima do limite tolerado. Resposta inválida, indisponibilidade de OpenAI/Groq ou
estouro de quota produz o texto-base preenchido, sem travar a campanha. O
operador sempre pode editar e regenerar antes de aprovar.

Variações não são apresentadas como mecanismo suficiente para evitar spam. Elas
servem apenas para personalização leve; autenticação, reputação e higiene da lista
continuam sendo os fatores principais.

## E-mail e assinatura ROS

O HTML usa tabelas, estilos inline, largura máxima de 600 px e versão em texto
simples. A mesma função pura renderiza a prévia e o conteúdo enviado, evitando
diferenças entre tela e caixa postal.

A assinatura contém:

- monograma compacto `recrutae-ros.png`, copiado dos assets oficiais do ROS;
- fundo claro apenas na célula do logo, para preservar contraste;
- divisor vertical amarelo `#FBB900`;
- nome e cargo do remetente;
- LinkedIn e/ou WhatsApp quando informados;
- identificação `Recrutaê | OS` em tinta, sem amarelo usado como texto pequeno.

O asset do e-mail usa URL absoluta derivada da URL pública da aplicação. Todos
os valores do operador e do contato são escapados antes de entrar no HTML; apenas
links `http`/`https` validados tornam-se clicáveis.

## Entrega, descadastro e idempotência

O remetente inicial vem de `ROS_FROM_EMAIL`; na ausência, usa
`contato@recrutae.com.br`. A interface pode selecionar outro endereço
`@recrutae.com.br`, mas o preflight precisa confirmar que o domínio está
verificado no Resend antes de liberar o disparo.

O preflight informa separadamente:

- `RESEND_API_KEY` configurada;
- domínio do remetente verificado no Resend;
- registro DMARC detectado;
- `APP_BASE_URL` pública em HTTPS;
- `UNSUBSCRIBE_SIGNING_SECRET` e `RESEND_WEBHOOK_SECRET` configurados.

Ausência de chave, remetente inválido, domínio não verificado ou impossibilidade
de gerar descadastro bloqueia o envio. DMARC e webhook ausentes geram alerta
forte, pois podem depender de configuração externa; a interface nunca afirma que
o e-mail chegará à caixa principal.

Antes de cada envio, a API:

1. normaliza o destinatário e consulta `email_suppressions`;
2. confirma que o contato pertence a uma campanha ROS e está aprovado ou em
   nova tentativa após falha;
3. muda-o condicionalmente para `sending`, impedindo duas reservas simultâneas;
4. envia com chave de idempotência `ros/<campaignId>/<contactId>`;
5. grava `sent` e `message_id`, ou `failed` com erro seguro para exibição.

O Resend preserva chaves de idempotência por 24 horas. O estado persistido no
Supabase continua impedindo reenvio depois dessa janela. A tela de envio processa
sequencialmente com intervalo curto e permite repetir somente falhas.

Cada mensagem inclui cabeçalhos `List-Unsubscribe` e
`List-Unsubscribe-Post: List-Unsubscribe=One-Click`, usando uma URL HTTPS com JWT
assinado. O POST automático e a confirmação humana inserem a supressão de forma
idempotente. O rodapé também oferece link visível. O token contém apenas e-mail
normalizado, campanha, finalidade e expiração; nenhum segredo.

O webhook registra eventos existentes e insere supressão para `bounced` e
`complained`. Endereços suprimidos nunca são enviados, mesmo que sejam
reimportados em outra campanha.

## Interface e identidade visual

A home ganha o terceiro cartão **Divulgação ROS**. Em rotas `/ros`, a sidebar
troca para: Contatos, Mensagem, Revisão, Enviando, Resultados e Campanhas.

O tema ROS é escopado para não alterar Candidatos ou Clientes:

- tinta `#0B0A18` e tinta elevada `#16152C`;
- osso `#F4F2ED`, usado principalmente em texto e na prévia do e-mail;
- amarelo `#FBB900` para ação e estado ativo;
- Poppins em títulos/corpo e JetBrains Mono apenas em labels, números e dados;
- cantos contidos, linhas e recortes retos inspirados na assinatura visual
  *deck that scrolls* do ROS;
- movimento curto e funcional, respeitando `prefers-reduced-motion`.

O fundo da aplicação permanece escuro. Superfícies claras ficam restritas ao
e-mail e à assinatura que representam o resultado recebido pelo destinatário.
Estados de foco, contraste, labels e navegação por teclado são obrigatórios.

## Tratamento de falhas

- Arquivo ilegível ou sem coluna de e-mail: nenhum contato é criado e a tela
  explica como corrigir.
- Linhas inválidas: as válidas continuam; rejeições ficam visíveis e exportáveis.
- Falha de IA: fallback determinístico por contato, sem abortar o lote.
- Quota da OpenAI: tenta Groq; falha de ambos usa o texto-base preenchido.
- Falha ao salvar campanha: bloqueia a transição para envio para preservar
  idempotência durável.
- Falha transitória do Resend: contato fica `failed`; reenvio reutiliza a mesma
  chave idempotente durante 24 horas.
- Contato suprimido: fica bloqueado com motivo legível e não conta como tentativa.
- Aba fechada durante o envio: ao reabrir, estados persistidos permitem continuar
  apenas pendentes/falhos, sem reenviar os marcados como `sent`.

## Segurança e privacidade

- Chaves de Resend, Supabase e assinatura de descadastro permanecem somente no
  servidor.
- APIs validam tamanho, formato de e-mail, IDs e relação campanha–contato.
- HTML e headers recebem valores sanitizados para impedir injeção.
- O endpoint de descadastro aceita apenas token assinado para a finalidade
  `unsubscribe` e usa operação idempotente.
- Webhook rejeita chamadas sem o segredo configurado; produção não opera em modo
  permissivo quando `RESEND_WEBHOOK_SECRET` estiver ausente.
- Logs não registram corpo completo do e-mail nem chaves de API.

## Testes e verificação

Será introduzido um runner de testes TypeScript. A cobertura mínima do recurso
inclui:

- aliases de colunas, qualquer ordem, acentos e heurística de e-mail;
- CSV e workbook, linhas inválidas, deduplicação e entrada manual;
- preenchimento de variáveis presentes e ausentes;
- limite de variação, preservação de links/números/CTA e fallback;
- isolamento do store `recrutae-ros-v1`;
- HTML/texto, escape e campos opcionais da assinatura;
- criação e verificação do token de descadastro;
- supressão por descadastro, bounce e reclamação;
- reserva condicional, idempotência e bloqueio de reenvio;
- filtros `campaign_kind` nas duas áreas;
- preflight e mensagens de erro.

O aceite final exige testes automatizados, lint, build de produção e navegação
do fluxo completo em viewport desktop e móvel. Um envio real de teste só ocorre
para endereço explicitamente fornecido pelo usuário; os testes automatizados não
disparam e-mail externo.

## Variáveis de ambiente

```env
RESEND_API_KEY=re_...
ROS_FROM_EMAIL=contato@recrutae.com.br
APP_BASE_URL=https://dominio-publico-da-plataforma
UNSUBSCRIBE_SIGNING_SECRET=segredo-aleatorio-longo
RESEND_WEBHOOK_SECRET=segredo-do-webhook
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=sk-...
GROQ_API_KEY=gsk_...
```

## Fora de escopo

- prometer ou medir garantia absoluta de caixa principal;
- comprar, enriquecer ou validar listas por serviço externo;
- criar uma infraestrutura de filas ou cron distribuído;
- migrar campanhas antigas de Clientes para o store ROS;
- automatizar alterações de DNS;
- disparar uma campanha real durante testes de desenvolvimento;
- alterar o design dos fluxos de Candidatos e Clientes além do necessário para
  compartilhar código e filtrar `campaign_kind`.
