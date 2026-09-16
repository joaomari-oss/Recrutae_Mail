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

## Correção após revisão — rodada 1

- O payload completo do Resend agora é serializado antes do envio e persistido uma única vez em `client_contacts.send_payload` (`text`, para preservar a serialização original). Retries reutilizam esse valor em vez de recriar JWT, HTML ou headers.
- A persistência usa compare-and-set (`send_payload is null`) e relê o vencedor em caso de corrida. Um contato `sending` só pode ser retomado quando já possui payload durável.
- Falha após o Resend aceitar a mensagem, mas antes de persistir `sent`, mantém o contato em `sending`; o retry reapresenta o mesmo payload e a mesma chave `ros/{campaignId}/{contactId}`.
- O link visível no HTML/texto aponta para `/unsubscribe?token=...` (confirmação humana), enquanto `List-Unsubscribe` permanece em `/api/unsubscribe?token=...` para POST one-click.
- O preflight sem `RESEND_API_KEY` produz os checks/503 sem instanciar o SDK do Resend.
- Destinatário inválido é recusado antes de supressão/reserva com 400. Falhas de supressão ou reserva viram JSON 503 e nunca alcançam o Resend.
- Migração aditiva `send_payload text` foi replicada em `supabase-migration-ros.sql`, `supabase-schema.sql` e no SQL de `/api/migrate`.
- RED: 11 falhas reproduziram os quatro achados. GREEN focado: 3 arquivos, 44 testes aprovados. Suíte: 11 arquivos, 85 testes aprovados. Build: compilação e 39 páginas concluídas com exit code 0.
- Teste de retry avança o relógio em 24 horas, força falha de `markSent` após sucesso do Resend e confirma igualdade byte-for-byte do JSON enviado e da chave idempotente nas duas tentativas.
