# Menu "Alterar decisão" no Torrent history

## Prompt original

> No bloco "Torrent history", quero adicionar um menu para alterar a decisão de um torrent no histórico. Alterar a decisão para um torrent deve ter o efeito como se a decisão anterior não existisse, e o torrent tivesse sido baixado novamente com um estado pendente.

Depois:

> Sim eu quero as decisões (aprovar, bloquear, pular) direto no menu

## O que foi implementado

- **Menu na linha do histórico** ([TorrentHistorySection.tsx](../../src/frontend/components/sections/TorrentHistorySection.tsx)): `Alterar decisão ▾` (um `<details>` nativo, aparece no hover como o botão de bloqueio) com as opções `Voltar para pendente`, `Aprovar`, `Bloquear série + resolução` e `Pular`.
  - Toda opção primeiro chama `resetDecisionToPending` ([useDashboardActions.ts](../../src/frontend/hooks/useDashboardActions.ts)), que devolve o torrent à fila pendente.
  - Aprovar, bloquear e pular usam depois as mesmas ações da Pending queue (`approveQueueItem`, `blacklistQueueItem`, `skipQueueItem` do `useBootstrapWorkflow`). Assim, aprovar baixa o `.torrent`, envia ao qBittorrent e abre o modal de pasta de destino quando não acha a pasta. Se a ação falhar, o torrent fica pendente e o erro aparece na Pending queue.
- **Endpoint** `POST /api/torrents/:id/reset-pending` ([server.ts](../../src/backend/server.ts)):
  - `resetTorrentToPending` ([stateService.ts](../../src/backend/services/stateService.ts)) apaga **todas** as decisões do torrent e qualquer entrada dele na fila, e então registra uma decisão `pending` nova (motivo `decision reset to pending by user`) e coloca o item de volta na fila pendente, igual ao que o scraping faz com um item pendente.
  - Recalcula os torrents baixados (`hydrateDownloadedTorrents`), então um torrent antes `approved`/`auto_downloaded` deixa de contar como baixado.
  - Depois disso o torrent é aprovado, bloqueado ou pulado pela Pending queue, pelos caminhos de sempre.
- **Armazenamento** ([decisionStore.ts](../../src/backend/storage/decisionStore.ts)): o histórico era só de append. `forget(records)` marca que houve remoção, e o próximo `save` reescreve todos os arquivos mensais a partir da memória (um mês que fica vazio vira arquivo vazio). Depois disso volta a só fazer append.

Não mudou: `qbittorrent-submitted` (registra o que já foi enviado ao qBittorrent, não a decisão) e as falhas do qBittorrent.

## Antes / Depois

- **Antes:** uma decisão no histórico não podia ser desfeita. Ela ficava gravada de vez e o scraping não voltava a avaliar o torrent.
- **Depois:** `Alterar decisão ▾ → Voltar para pendente` deixa só uma decisão `pending` nova no histórico e o torrent aparece na Pending queue. `Aprovar`/`Bloquear`/`Pular` deixam no histórico só a decisão `pending` nova seguida da decisão escolhida, como um torrent recém-raspado decidido na fila.

## Como foi testado

- `npm test`: 280 passando. `npm run typecheck` sem erros. `npm run build` ok.
- O projeto não tem framework de E2E nem linter configurados.

## Testes criados/alterados

- `src/backend/services/resetTorrentToPending.test.ts` (novo): remove todas as decisões do torrent e o põe na fila, não duplica a entrada na fila, e não faz nada se o torrent não tem histórico.
- `src/backend/storage/decisionStore.test.ts`: novo teste mostrando que os registros esquecidos somem do disco (incluindo um mês que fica vazio) e que os saves seguintes voltam a fazer append.
