# Itens pendentes listados no box Scraping, com contagem dos itens da página

## Prompt original

> Quando eu faço o scrape de uma página inteira do Nyaa e aparecem itens pendentes, quero que esses sejam listados dentro do box Scraping, junto com os outros - auto approved, auto rejected, already downloaded, backfilled - seja como pending, manual approved, manual rejected, manual skipped, para que todos os itens da página (normalmente 75) sejam sempre exibidos e contados

## O que foi implementado

**Backend**
- [types.ts](../../src/shared/types.ts): `BootstrapDiscoveryResult` ganhou dois campos:
  - `manual`: itens que precisaram de revisão. O `status` começa como `pending` e muda para `approved`, `blocked` ou `skipped` quando o usuário resolve o item.
  - `pageItemCount`: quantos torrents a página do Nyaa tinha.
- [bootstrapDiscoveryService.ts](../../src/backend/services/bootstrapDiscoveryService.ts):
  - Item novo classificado como pendente: agora entra em `manual`, nos dois modos. Antes, no modo "página inteira", ele ia só para a fila e não aparecia no box.
  - Item que já estava pendente (na fila ou no histórico): agora entra em `manual`. Antes ele aparecia em "Auto rejected", com o motivo "already pending".
  - `applyManualDecision` (pura) e `recordManualDecision` (aplica e salva o resultado do scrape) atualizam o status das entradas.
- [server.ts](../../src/backend/server.ts): as rotas `approve`, `blacklist`, `skip` e `skip-all` de `/api/pending` chamam `recordManualDecision`. O item muda de box no resultado salvo, inclusive se a decisão for tomada pela fila "Pending queue".

**Frontend** ([BootstrapDiscoverySection.tsx](../../src/frontend/components/sections/BootstrapDiscoverySection.tsx))
- Os 4 boxes copiados (Backfilled, Auto approved, Auto rejected, Already downloaded) viraram um componente, `SummaryBox`. Cada caixa guarda o próprio estado de "Show all" e "Collapse", e foram removidos 8 signals. O conteúdo de cada linha não mudou.
- 4 boxes novos, acima dos automáticos, com o motivo da revisão em cada linha:
  - **Pending** (âmbar)
  - **Manual approved** (teal)
  - **Manual rejected** (laranja)
  - **Manual skipped** (violeta)
- Nova linha de resumo: `Manual decisions: N pending / N approved / N rejected / N skipped · listed X of 75 page items`.
  - A contagem usa as posições da página (`page:itemIndex`). Assim, um item que aparece em dois boxes (aprovação repetida do histórico que também passou por backfill) não é contado duas vezes.

## Antes / Depois

- **Antes:** no modo "página inteira", os pendentes novos sumiam do box Scraping (por exemplo, 60 de 75 listados). Os que já estavam pendentes apareciam como "Auto rejected".
- **Depois:** os pendentes aparecem em "Pending". Ao aprovar, bloquear ou pular, cada um passa para "Manual approved", "Manual rejected" ou "Manual skipped", e o resumo mostra "listed 75 of 75 page items".

## Como foi testado

- **Automatizado:**
  - `npm test`: 222 passando, 0 falhas.
  - `npm run typecheck`: sem erros.
  - `npm run build`: build concluído.
- **Manual no Chrome**, com o servidor de dev, sem rodar scrape de verdade (um scrape enviaria torrents ao qBittorrent):
  - Com o resultado salvo real (35 auto rejected + 40 already downloaded): os boxes refatorados aparecem como antes. O resumo mostra `0 pending / 0 approved / 0 rejected / 0 skipped`, e não mostra o "listed", porque o resultado antigo não tem `pageItemCount`.
  - Com o `fetch` interceptado no navegador, 6 entradas foram movidas de "Auto rejected" para `manual` (3 pending, 1 approved, 1 blocked, 1 skipped), e o recarregamento foi disparado por "Skip all pending". O POST também foi interceptado e não chegou ao servidor. Resultado:
    - Os 4 boxes novos aparecem com as cores e os motivos.
    - O resumo mostra `3 pending / 1 approved / 1 rejected / 1 skipped · listed 75 of 75 page items`.
    - "Collapse" no Pending mostra "Pending (3)" sem afetar os outros boxes, e "Show all" no Auto rejected mostra as 29 linhas.
- **Não testado de ponta a ponta:** as rotas `/api/pending/*` com um item pendente real, porque a fila estava vazia. A lógica de atualização é coberta pelo teste unitário.

## Testes criados/alterados

- [src/backend/services/bootstrapManualDecision.test.ts](../../src/backend/services/bootstrapManualDecision.test.ts): `applyManualDecision` muda o status só das entradas resolvidas, e não muda nada para itens fora do último scrape ou sem resultado.

## Ajuste 1: box "qB failed" e contagem de "inspected"

### Prompts

> A lista atual, depois que eu revisei todos os itens pendentes, ficou com "listed 74 of 75 page items". Por quê?

> corrija e também o inspected

### Causa

- **O item que faltava:** o slot #4 da página 1, `[Erai-raws] Magical Explorer - 03 [480p]` (#2172211).
  - Num scrape anterior, o envio ao qBittorrent deu timeout. A falha foi gravada em `qbittorrent-failures.json`, mas nenhuma decisão foi registrada, porque o envio vem antes da decisão.
  - No scrape seguinte, o item foi pulado (`return { inspectedCount: 0 }`) sem entrar em lista nenhuma.
- **"inspected torrents: 101" numa página de 75:** cada pendente novo era contado duas vezes. O contador já tinha sido incrementado para o item, e o retorno somava `+ 1` de novo.
  - No modo de um item por vez, o resultado com `needs_review` mostrava só a contagem do próprio item, e não a do passo inteiro.

### O que foi implementado

- [types.ts](../../src/shared/types.ts): novo campo `qbFailed` no `BootstrapDiscoveryResult`.
- [bootstrapDiscoveryService.ts](../../src/backend/services/bootstrapDiscoveryService.ts):
  - `listUndecidedItem` (exportada): trata um item já visto que ainda não tem decisão.
    - Se o item está na fila de pendentes, vai para `manual` (como antes).
    - Se está na lista de falhas do qBittorrent, vai para `qbFailed`, com o motivo da decisão e a mensagem de erro.
  - O `+ 1` do caminho de pendentes foi removido.
  - O resultado `needs_review` agora recebe o `inspectedCount` acumulado do passo.
- [BootstrapDiscoverySection.tsx](../../src/frontend/components/sections/BootstrapDiscoverySection.tsx):
  - Novo box **"qB failed"** (vermelho), entre os manuais e o Backfilled.
  - Esses itens também entram no contador "listed X of N" e no "qB Fail" da linha "Auto decisions".
  - O reenvio continua sendo pelo Retry da lista de falhas do qBittorrent.

### Antes / Depois

- **Antes:** `listed 74 of 75 page items`, e `inspected torrents: 101`.
- **Depois:** o #2172211 aparece em "qB failed" com "Timed out while contacting qBittorrent". O contador mostra `listed 75 of 75`, e "inspected" conta cada item uma vez só.
- **Atenção:** o resultado salvo atual só muda no próximo scrape.

### Como foi testado

- `npm test`: 226 passando, 0 falhas.
- `npm run typecheck`: sem erros.
- `npm run build`: build concluído.
- **Diagnóstico com os dados reais:**
  - Comparei `bootstrap-discovery.json` com o `snapshot.json` da página. Só faltava o slot #4.
  - Esse torrent está em `qbittorrent-failures.json` e em `qbittorrent-add-responses.json` (timeout), e não tem decisão em `data/decisions`.
- **Não testado:** a correção do "inspected" no caminho de pendentes não tem teste automatizado. Esse caminho baixa o torrent do Nyaa para classificar, e o projeto não tem mocks de módulo. Conferir no próximo scrape: "inspected torrents" deve ser igual ao número de itens da página.

### Testes criados

- [src/backend/services/bootstrapUndecidedItem.test.ts](../../src/backend/services/bootstrapUndecidedItem.test.ts):
  - Regressão: uma falha do qB sem decisão vai para `qbFailed`, com o slot e o erro.
  - Um item ainda na fila vai para `manual` como pending.
  - Um torrent desconhecido não é listado.
