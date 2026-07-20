# Mensagem amigável quando não há watch targets (drives offline)

## Prompt original

> Eu tentei fazer um scan agora, mas não entendi por que não retornou nenhum resultado:
> ```json
> // POST http://localhost:5173/api/bootstrap/discover-last-downloaded
> // body: {"qbForceResubmit":false,"wholePage":true}
> { ... "found": false, "mode": "no_items", "reason": "No watch targets available for bootstrap discovery" ... }
> ```
> Ahh os drives estavam offline. Só gostaria de uma mensagem de erro mais amigável e explícita nesse caso, seria legal uma mensagem de erro num modal.

## Diagnóstico

`scanWatchTargets()` faz `readdir(rootPath).catch(() => [])` ([watchlistService.ts](../../src/backend/services/watchlistService.ts)). Quando o drive `Q:` está offline, o `readdir` falha, o erro é engolido e nenhum watch target é gerado. O discovery então cai no ramo `watchTargetsState.length === 0` e retorna `found:false` / `mode:no_items` com um `reason` genérico. O frontend só registrava isso como um passo no log — nada visível ao usuário.

## O que foi implementado

- **Backend — diagnóstico estruturado**: novo helper puro `buildWatchTargetsIssue(configuredRoots, statuses)` em [watchlistService.ts](../../src/backend/services/watchlistService.ts) que classifica o motivo em `no_roots_configured`, `roots_offline` (lista as pastas inacessíveis) ou `no_series_found`, reaproveitando `watchRootStatusesState` (populado por `refreshWatchRoots`, que já roda `inspectWatchRoots`).
- **Backend — resultado do discovery**: o ramo de targets vazios em [bootstrapDiscoveryService.ts](../../src/backend/services/bootstrapDiscoveryService.ts) agora anexa `watchTargetsIssue` ao `BootstrapDiscoveryResult` e monta um `reason` específico (ex.: `Watch folders are offline or inaccessible: Q:\...`).
- **Tipos**: `WatchTargetsIssue`/`WatchTargetsIssueKind` e o campo `watchTargetsIssue?` em `BootstrapDiscoveryResult` ([shared/types.ts](../../src/shared/types.ts)).
- **Frontend — modal**: novo componente [WatchTargetsIssueModal.tsx](../../src/frontend/components/ui/WatchTargetsIssueModal.tsx) (PT-BR) com título/descrição por tipo de problema e lista das pastas offline. O hook [useBootstrapWorkflow.ts](../../src/frontend/hooks/useBootstrapWorkflow.ts) detecta `result.watchTargetsIssue` após cada step, abre o modal e registra um log de erro; o modal é montado em [App.tsx](../../src/frontend/App.tsx).

## Antes / Depois

| | Antes | Depois |
|---|---|---|
| Drive offline | `found:false`, `reason` genérico, **nada visível** | Modal explícito listando as pastas offline + log de erro |
| Sem pastas configuradas | mesmo `reason` genérico | Modal orientando cadastrar em *Watched roots* |
| Pastas ok mas vazias | mesmo `reason` genérico | Modal "Nenhuma série encontrada" |

## Como foi testado

- **Automatizado**: novo [watchTargetsIssue.test.ts](../../src/backend/services/watchTargetsIssue.test.ts) cobrindo os três ramos (sem roots, roots offline, roots vazios). `npm test` → 116/116 passando.
- **Typecheck**: `npm run typecheck` sem erros.

## Testes criados/alterados

- Criado: `src/backend/services/watchTargetsIssue.test.ts`
