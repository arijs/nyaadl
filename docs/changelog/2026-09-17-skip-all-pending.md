# Botão "Skip all pending" no lugar de "Approve all pending"

## Prompt original

> No bloco "Pending queue", hoje temos um botão "Approve all pending" no topo. Vamos trocar este botão por um "Skip all pending", que faz muito mais sentido, pra apenas tirar todos os pendentes da fila.

## O que foi implementado

- **Backend**: rota `POST /api/pending/approve-all` removida e substituída por `POST /api/pending/skip-all` em [server.ts](../../src/backend/server.ts). A rota esvazia `pendingState` e registra uma decisão `skipped` / `skipped by user` por item, persistindo pending e decisions. Não baixa nada nem toca no qBittorrent.
- **Helper puro**: `buildSkippedDecisions(items, createdAtUtc?)` em [stateService.ts](../../src/backend/services/stateService.ts) monta os `DecisionRecord` — extraído para ser testável sem subir o servidor.
- **Frontend**: `approveAllPending` → `skipAllPending` em [useDashboardActions.ts](../../src/frontend/hooks/useDashboardActions.ts); botão renomeado em [PendingQueueSection.tsx](../../src/frontend/components/sections/PendingQueueSection.tsx).
- **Docs**: README atualizado na seção *Pending queue*.

## Antes / Depois

| | Antes | Depois |
|---|---|---|
| Botão no topo da fila | `Approve all pending` — baixava e submetia **todos** os pendentes ao qBittorrent | `Skip all pending` — apenas remove todos da fila, marcando como `skipped` |
| Rota | `POST /api/pending/approve-all` | `POST /api/pending/skip-all` |

## Como foi testado

- **Automatizado**: novo [skipAllPending.test.ts](../../src/backend/services/skipAllPending.test.ts) cobrindo fila com itens (todos viram `skipped`, fila esvaziada, mesmo timestamp) e fila vazia. `npm test` → 161/161 passando.
- **Typecheck**: `npm run typecheck` sem erros.

## Testes criados/alterados

- Criado: `src/backend/services/skipAllPending.test.ts`
