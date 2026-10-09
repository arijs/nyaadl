# Dividir `data/decisions.json` em arquivos JSONL mensais

## Prompt original

> Precisamos refatorar o arquivo "data/decisions.json" que está muito grande. Como você propõe dividir ele?

Depois da proposta (JSONL por mês, append-only, migração automática e enxugar `item`):

> pode seguir, inclua o 3

## Diagnóstico

- `data/decisions.json` tinha 6,8 MB e 7.043 registros, crescendo cerca de 1.100 registros (~1 MB) por mês.
- Cada `saveDecisions(decisionsState)` regravava o arquivo inteiro, com indentação. São ~15 pontos de chamada, então aprovar um único torrent custava 7 MB de escrita.
- O histórico só cresce: fora do carregamento, o código só faz `decisionsState.push(...)`.
- Risco latente: `readJsonFile` devolvia `{ items: [] }` se *um único* registro falhasse na validação, e `ensureJsonFile` gravava isso por cima do arquivo. Um registro corrompido apagava todo o histórico.
- `item` carregava campos de runtime vazados do item classificado/pending (`status`, `reason`, `seriesKey`, `matchedTarget`) que nunca são lidos do histórico.

## O que foi implementado

- **Novo store** [decisionStore.ts](../../src/backend/storage/decisionStore.ts) (`createDecisionStore(dirPath, legacyFilePath)`):
  - Grava `data/decisions/YYYY-MM.jsonl`, um registro por linha. O mês vem de `createdAtUtc` (`unknown.jsonl` se o campo não tiver formato de data).
  - `save(items)` é **incremental**: o store guarda quantos registros já foram persistidos e só anexa (`appendFile`) a cauda nova. Gravações concorrentes passam por uma fila, então nenhuma cauda é anexada duas vezes. Se o array encolher, lança erro (o histórico é append-only).
  - `load()` lê os meses em ordem e valida linha por linha. Linhas inválidas (por exemplo, truncadas num crash) são ignoradas e guardadas em `YYYY-MM.jsonl.rejected`. O arquivo do mês é reescrito só com as linhas válidas, para o próximo append começar numa linha limpa (o mesmo vale para uma última linha sem `\n`).
  - **Migração automática**: se `data/decisions/` não existe e `data/decisions.json` existe, divide o arquivo por mês num diretório `decisions.migrating`, troca para `decisions` com `rename` e renomeia o legado para `decisions.json.bak`. Uma migração interrompida é refeita do zero. Registros inválidos do legado vão para `decisions.json.rejected.json`. JSON legado corrompido **aborta a inicialização** em vez de apagar o histórico.
  - **Enxugamento de `item`**: só os campos de `TorrentItem` mais `internalNames` (lido pelo replay do bootstrap via `getDecisionInternalNames`) são persistidos. Usa uma whitelist, então novos campos de runtime não vazam para o disco. O objeto em memória não é alterado.
- [stateService.ts](../../src/backend/services/stateService.ts): `loadDecisions`/`saveDecisions` delegam ao store, com a mesma assinatura. Por isso **nenhum ponto de chamada mudou**: os `push` sem `save` imediato (bootstrap persiste no fim da página) continuam sendo gravados no próximo `saveDecisions`. `initStateFiles` não cria mais `decisions.json`.
- [jsonStore.ts](../../src/backend/storage/jsonStore.ts): `isDecisionsFile` virou `isDecisionRecord` (validação por registro); novo `writeTextFileAtomic`, usado por `writeJsonFileAtomic`.
- [types.ts](../../src/shared/types.ts): removido `DecisionsFile`, que ficou sem uso.
- README: seção *Data Layout* atualizada.

### Mudança em relação à proposta

A proposta previa trocar os ~15 `push` + `saveDecisions` por um `appendDecisions(novos)`. Na implementação, o bootstrap dá `push` em várias decisões durante o loop e só persiste no fim. Se algo lança erro no meio, o próximo `saveDecisions` é que grava as pendentes. Um `appendDecisions` explícito poderia perder essas decisões, então o `saveDecisions` ficou incremental, preservando a semântica atual sem mexer nos pontos de chamada.

## Antes / Depois

| | Antes | Depois |
|---|---|---|
| Layout | `data/decisions.json` único, indentado | `data/decisions/2026-05.jsonl` … `2026-10.jsonl` |
| Tamanho total (dados reais) | 6.809 KB | 4.879 KB (JSONL compacto + `item` enxuto) |
| Custo de um save | regrava 7 MB | anexa ~0,7 KB por decisão nova |
| Registro inválido | histórico inteiro descartado e sobrescrito | linha ignorada e guardada em `.rejected` |
| `item` persistido | inclui `status`, `reason`, `seriesKey`, `matchedTarget` | só campos de `TorrentItem` + `internalNames` |

## Como foi testado

- **Automatizado**: `npm test` → 188/188 passando (13 testes novos em `decisionStore.test.ts`, com filesystem real em diretório temporário): divisão por mês e ordem no reload, append incremental sem duplicar, saves concorrentes, rejeição de histórico que encolheu, whitelist de `item`, linha truncada e linha sem `\n`, migração (ordem, `.bak`, idempotência, registros inválidos, diretório de staging órfão) e JSON legado corrompido sem perda de dados.
- **Typecheck**: `npm run typecheck` sem erros. O projeto não tem linter/formatter configurado.
- **Equivalência com dados reais** (cópia de `data/decisions.json` em `d:\tmp`): os 7.043 registros migrados mantêm ordem, `torrentId`, `status`, `reason`, `createdAtUtc` e `internalNames`. `buildTorrentHistoryPage` (vários filtros/páginas) e `buildDailyReport` (3 datas) dão resultados idênticos antes e depois. Migração em ~0,8 s, reload em ~0,3 s.
- **App real (manual)**: servidor rodando com `cwd` numa cópia dos dados com um item pendente semeado. Na inicialização migrou 7.043 decisões em 6 arquivos. `POST /api/pending/e2e-1/skip` anexou uma linha em `2026-10.jsonl`, já sem os campos vazados. Depois de reiniciar, `/api/torrents/history` mostrou 7.044 registros (`skipped` 231 → 232, último = `e2e-1/skipped`) e `/api/pending` vazio.

## Testes criados/alterados

- Criado: `src/backend/storage/decisionStore.test.ts`
