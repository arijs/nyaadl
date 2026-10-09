# Backfill de `category` / `sizeText` / `publishedAtUtc` nas decisões e no pending

## Prompt original

> vamos ver uma forma de preencher os dados retroativos nos arquivos de decisões quando os dados dos torrents são buscados/carregados

Respostas às perguntas do plano:
- Fontes: **scrape e snapshots locais**.
- Escopo: **decisões e `pending.json`**.

## Contexto

O commit anterior ([2026-10-09-nyaa-torrent-details.md](2026-10-09-nyaa-torrent-details.md)) passou a capturar `category` na lista do Nyaa. As decisões já gravadas não tinham esse campo, então a UI mostrava só o link do Nyaa.

## O que foi implementado

- **Regra**: preenche `category`, `sizeText` e `publishedAtUtc` **só se estiverem ausentes**, em todos os registros do mesmo `torrentId`. `seeders`, `leechers` e `downloads` não mudam, porque são o retrato do momento da decisão.
- [decisionStore.ts](../../src/backend/storage/decisionStore.ts): novo `markDirty(records)`. O próximo `save()` reescreve atomicamente só os meses marcados, a partir de `items[0..persistedCount)` filtrado pelo mês, e depois anexa a cauda nova como antes. Também recusa um array encolhido antes de tocar em qualquer arquivo.
- [stateService.ts](../../src/backend/services/stateService.ts): `markDecisionsDirty`.
- Novo [decisionBackfillService.ts](../../src/backend/services/decisionBackfillService.ts):
  - `backfillTorrentItems` é puro: muta os registros e retorna os que mudaram, e se o pending mudou.
  - `applyTorrentItemBackfill(items)` aplica isso em `decisionsState` e `pendingState`, marca os meses e salva o pending.
  - `backfillFromLocalSnapshots()` lê `torrents/*/snapshot.json`. Só roda se algum registro estiver sem `category`.
- Ganchos:
  - startup em `server.ts`, depois de `ensureInitialData`;
  - `runScrapeForPage`, depois do scrape;
  - bootstrap (`bootstrapDiscoveryService.ts`), depois do scrape da página.

## Antes / Depois (cópia dos dados reais)

| | Antes | Depois do startup |
|---|---|---|
| Registros de decisão | 7043 | 7043 (mesmas linhas, mesma ordem) |
| Sem `category` | 7043 | 1144 (2026-05: 508, 2026-06: 198, 2026-09: 438) |
| Linhas alteradas | n/a | 5899, só nos 3 campos (0 divergências no resto) |
| Tempo do backfill | n/a | ~300 ms |

As 1144 restantes são torrents que não estão em nenhum `snapshot.json` local. Elas são preenchidas se reaparecerem num scrape.

## Como foi testado

- `npm test`: 198/198. `npm run typecheck`: limpo.
- Manual: copiei `data/` e os `torrents/*/snapshot.json` para uma pasta temporária e rodei `ensureInitialData` + `backfillFromLocalSnapshots` nela. Um script comparou linha a linha com o original: mesmo número de linhas, e a única diferença são os 3 campos preenchidos, nunca sobrescritos.
- E2E: o projeto não tem infraestrutura de E2E.

## Testes criados/alterados

- `src/backend/storage/decisionStore.test.ts`: reescrita só do mês sujo com append da cauda; o mês sujo é reescrito uma vez só; um save sujo com array encolhido é rejeitado sem tocar no arquivo.
- `src/backend/services/decisionBackfillService.test.ts` (novo): preenche só campos ausentes em todas as decisões do torrent, não sobrescreve valores nem `seeders`, e marca o pending.

## Investigação dos 1144 restantes

> vamos ver se achamos essas 1144 nos arquivos antigos

- As pastas `torrents/p1…p6 …` só têm arquivos `.torrent` (1500), sem dados de listagem.
- Os 1144 registros correspondem a 834 IDs. Desses, 828 estavam nos `snapshot.html` das 17 pastas de **busca customizada** (`page-…-q-…-N`), mas o `snapshot.json` delas não tinha `category`. O re-accept anterior só cobriu `page-YYYY-MM-DD-N`, que é o padrão do teste de snapshot.
- O teste de snapshot não foi estendido para as pastas `-q-`. Em 2 delas o parser atual também muda `matchCandidates` (evolução do `normalizeService` em títulos de lote como `01 ~ 10` e `12v2 END`), e re-aceitar consolidaria isso sem revisão.
- Correção de dados (one-off, sem mudança de código): um script acrescentou só `category`, pego do HTML por `torrentId`, aos 17 `snapshot.json`. Foram 843 itens, todos casados, e os originais ficaram arquivados como `snapshot.N.json`.
- Novo dry-run numa cópia dos dados: **7037 de 7043** preenchidos, 0 divergências.
- Sobram 6 registros, todos da página 12 de 2026-05-19 (Aishiteru Game wo Owarasetai 02 e Replica datte Koi wo Suru 03, em 480p, 720p e 1080p). O snapshot dessa página foi sobrescrito por um scrape posterior no mesmo dia, e eles não aparecem em nenhum arquivo local.

### Fechando os 6 últimos (aplicado nos dados reais)

> Faça um script temporário que busque o detalhe desses últimos pra gente fechar 100%

- Script temporário, fora do repo, rodado com o servidor parado e com backup prévio de `data/decisions` e `data/pending.json`. Ele:
  - roda o mesmo `backfillFromLocalSnapshots` do startup (7037 registros);
  - baixa com `archiveNyaaDetail(id, createdAtUtc)` o `/view` dos torrents que sobraram, salvos em `data/2026-05/<id>.json`, com 1 s entre as requisições;
  - aplica `category`, `sizeText` e `publishedAtUtc` desses detalhes via `applyTorrentItemBackfill`.
- Os 6 continuam no Nyaa, todos `Anime - English-translated`.
- Resultado em `data/decisions`: **7043/7043 com `category`**, mesmas linhas e mesma ordem, e a comparação com o backup mostra 0 divergências além dos 3 campos. `pending.json` estava vazio e não mudou.
- Ajuste no código: o log do startup agora conta os snapshots lidos, não todas as pastas de `torrents/`.

## Fora do escopo

- `qbittorrent-failures.json`.
