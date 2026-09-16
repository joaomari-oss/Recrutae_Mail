# Task 8 — Preflight e envio ROS idempotente

## Entrega

- Preflight ROS com sete checks operacionais: API do Resend, domínio remetente, DMARC, URL pública HTTPS, segredo de descadastro, webhook e banco server-side.
- `SUPABASE_SERVICE_ROLE_KEY` é bloqueadora; `NEXT_PUBLIC_SUPABASE_ANON_KEY` não é aceita como fallback.
- Remetente restrito a `@recrutae.com.br`, com fallback `contato@recrutae.com.br` quando `ROS_FROM_EMAIL` não existe.
- Envio na ordem: normalização, supressão, reserva atômica, token, renderização e Resend.
- A rota usa somente `supabaseAdmin` para supressão e mutações; `claimRosContact` preserva o isolamento `campaign_kind = 'ros'` e reserva apenas `approved|failed`.
- Resend recebe `ros/{campaignId}/{contactId}` como `idempotencyKey`, descadastro HTTPS RFC 8058, tags de campanha/contato e `reply_to`.
- Resultado do provedor persiste `sent` com `message_id`; falhas persistem `failed` com a mensagem de erro.

## TDD e verificação

- RED inicial: os dois arquivos focados falharam porque `lib/ros/preflight` e `lib/ros/send` ainda não existiam.
- GREEN focado: `npm test -- tests/rosPreflight.test.ts tests/rosSend.test.ts --reporter=dot` — 2 arquivos, 15 testes aprovados.
- Isolamento/reserva do repositório: `npm test -- tests/campaignKind.test.ts --reporter=dot` — 19 testes aprovados.
- Suíte completa: `npm test -- --reporter=dot` — 11 arquivos, 75 testes aprovados.
- Build: `npm run build` — compilação, geração de 39 páginas e coleta de traces concluídas com exit code 0.
- TypeScript: nenhuma saída de `tsc` para arquivos da Tarefa 8; o projeto mantém erros preexistentes documentados fora deste escopo.
- Mutation check: trocar service role por anon e alterar a chave idempotente fez 5 testes focados falharem; as mutações foram restauradas.
- Nenhum teste envia e-mail real: o boundary do Resend é injetado no serviço e mockado na rota.

## Auto-revisão e riscos

- DMARC e segredo de webhook são avisos e não bloqueiam, conforme o contrato; os demais checks obrigatórios bloqueiam.
- A idempotência externa depende da retenção da chave pelo Resend 4.8; a persistência local permite retomar contatos `failed` com a mesma chave.
- O deploy precisa configurar `RESEND_API_KEY`, `APP_BASE_URL` HTTPS, `UNSUBSCRIBE_SIGNING_SECRET` com 32+ bytes, `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`; sem service role, preflight e envio bloqueiam explicitamente.
- O aviso de API CJS do Vite e a mensagem esperada do teste de falha transitória do webhook continuam preexistentes na suíte.
