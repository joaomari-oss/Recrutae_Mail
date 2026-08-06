# Fidelidade ao template + geração à prova de falhas

**Data:** 2026-08-06
**Status:** aprovado

## Problema

Três sintomas relatados pelo recrutador:

1. **O e-mail gerado não segue o modelo colado.** O recrutador escreve o template
   com marcadores no estilo `[Nome]`, mas o app só conhece `{{PRIMEIRO_NOME}}`.
   O `[Nome]` chega cru na IA, que pode preencher, ignorar ou reescrever — sem garantia.
2. **A geração para quando a quota acaba.** Medido em 2026-08-06:
   OpenAI sem créditos (`credit_balance_exhausted`), Groq com o limite diário
   estourado (99.363 de 100.000 tokens/dia).
3. **A OpenAI deve ser sempre a primeira opção**, com troca automática só quando ela acaba.

## Decisões

Tomadas com o recrutador antes de implementar:

| Questão | Decisão |
|---|---|
| Quanto a IA pode mexer no texto | Mantém a variação sutil de 10-15% no texto todo (proteção anti-spam) |
| Quando os dois provedores caem | Monta o e-mail sozinho e segue, sem erro |
| Ordem dos provedores | OpenAI primeiro, sempre |

A variação sutil foi mantida a pedido do recrutador. "Seguir o modelo" significa
preservar estrutura, mensagem e intenção — não congelar cada palavra.

## Arquitetura

### 1. `lib/templateRender.ts` — preenchimento determinístico

Função pura, sem I/O, testável isoladamente.

- **Sintaxes reconhecidas:** `[Nome]`, `{{NOME}}`, `{Nome}`
- **Insensível a** maiúsculas e acentos (`[CARGO]`, `[cargo]`, `[Cargo]` são o mesmo)
- **Campos:** primeiro nome, nome completo, sobrenome, empresa, cargo, e-mail, segmento
- **Dado ausente:** o placeholder é removido junto com a preposição solta que o
  antecede, evitando `"a [Empresa]"` ou `"na "` pendurado. Importa porque a planilha
  do recrutador traz `Empresa` como `"-"`, que o parser normaliza para vazio.

### 2. Ordem invertida: preencher antes de chamar a IA

Hoje o template vai cru para o prompt e a IA "deveria" trocar os marcadores.
Passa a ir **já preenchido**: o modelo recebe `"Olá, Alessandro, tudo bem?"`.
A IA nunca vê um colchete, então não tem como deixar passar.

O prompt ganha uma regra explícita: os dados já estão no texto, não inventar nem remover.

### 3. Cadeia de três níveis

```
OpenAI  →  Groq  →  preenchimento direto do template
```

O nível 3 entra quando os dois provedores falham, cobrindo:
sem crédito, limite diário, JSON inválido e timeout.

A resposta carrega `usedProvider: 'template'` para a interface avisar
discretamente que o e-mail saiu sem IA.

Vale para as duas abas. No fluxo de candidatos, que não tem template escrito
pelo recrutador, o nível 3 monta o e-mail a partir do template base já
documentado no prompt do sistema (cargo, empresa contratante, descrição, link).

### 4. Preferência pela OpenAI

Continua como padrão. Só é pulada quando responde explicitamente *sem saldo*,
e por 10 minutos — com 124 contatos, insistir custaria 124 chamadas mortas.
Depois da janela ela é testada de novo sozinha, então volta a ser a primeira
assim que houver crédito, sem intervenção.

Limite temporário (rate limit) **não** tira o provedor de circulação: só
tenta o outro naquela requisição.

## Correção de classificação

A mensagem de limite diário do Groq inclui um link de billing. O classificador
lia `billing` e marcava como "sem saldo", tirando o Groq do ar por 10 minutos
à toa. Agora os sinais de limite temporário (`rate limit`, `try again in`,
`tokens per day`) são checados **antes** dos códigos de saldo.

## Testes

- Renderizador: as três sintaxes, acentos, maiúsculas, dado ausente, preposição solta
- Cadeia de fallback: os três níveis, incluindo JSON inválido e provedor não configurado
- End-to-end nas duas rotas, com a planilha real de 124 contatos

## Fora de escopo

Recarregar a quota — não dá para resolver por código. Uma campanha com 124
contatos consome cerca de 230 mil tokens; o plano gratuito do Groq (100 mil/dia)
não cobre uma campanha inteira. Créditos na OpenAI resolvem; o nível 3 garante
que nada trave enquanto isso.
