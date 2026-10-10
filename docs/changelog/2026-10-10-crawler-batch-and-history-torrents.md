# Details downloader: torrents de batch e torrents que saíram do qBittorrent

## Prompt original

> Temos novos itens no-torrent

## Causa

O serviço deu `Nyaa: no-torrent` em dois casos que o fallback anterior (envios do nyaadl para a pasta + arquivos do índice dentro dela) não cobria:

- **`2026.2 Primavera / [Erai-raws] Dandelion [720p]`:** a pasta tem 7 episódios, mas eles vieram de um **batch**. No qBittorrent, o torrent `#2098812` tem como `content_path` a própria pasta do target, não cada arquivo. Por isso nem a busca por arquivo nem a busca por "arquivo dentro da pasta" achavam o torrent.
- **`2026.3 Verão / [Erai-raws] Grand Blue Season 3 [1080p]`:** a pasta está **vazia**. Os torrents 1080p (`#2129159`, ep. 01, aprovado) não estão mais no qBittorrent, e o histórico de envios guarda só as últimas 500 entradas (desde 5/9). Só as decisões continuam com esses torrents.

## O que foi implementado

Em [detailsCrawlerService.ts](../../src/backend/services/detailsCrawlerService.ts):

- Nova função pura `findTargetTorrents(target, { sent, indexed, decisions })`. Ela substitui a lógica que estava dentro das dependências do app e junta três fontes:
  1. **Envios do nyaadl** com `ok` para a pasta (como antes).
  2. **Índice do qBittorrent:** arquivo dentro da pasta, ou **batch cujo `content_path` é a própria pasta** (novo).
  3. **Decisões** `auto_downloaded`, `approved` ou `already_downloaded` com a mesma chave série+resolução do target (`buildNormalizedKey(deriveSeriesBase(item.seriesBaseRaw), item.resolution) === target.normalizedKey`), mesmo que o qBittorrent não tenha mais o torrent (novo).
- `pickFolderTorrentId` continua escolhendo o de menor episódio.
- A dependência `findFolderTorrents` agora recebe o target inteiro, porque precisa da `normalizedKey`.

## Antes / Depois

- **Antes:** Dandelion [720p] e Grand Blue Season 3 [1080p] davam `no-torrent`.
- **Depois:** Dandelion usa o batch `#2098812`, e Grand Blue usa `#2129159`. Os dois baixaram Nyaa, Erai, MAL e AniDB.

## Como foi testado

- `npm test`: 255 passando, 0 falhas.
- `npm run typecheck`: sem erros.
- **Replay offline (sem rede) da busca de torrent nos 669 targets:** 625 acham o torrent pelos arquivos, 41 pelo fallback, e sobram 3, todos sem solução do nosso lado:
  - `2025.1 Inverno / [Erai-raws] Fate Strange Fake [480p]` e `[720p]`: pastas vazias, sem histórico. A série está em `2026.1 Inverno / [Erai-raws] Fate-Strange Fake`, que é processada normalmente.
  - `2025.2 Primavera / [mehsubs] Yandere Dark Elf … [1080p] (Dual-Audio)`: o torrent no qBittorrent não vem do Nyaa (o comentário não tem link `nyaa.si/view/`).
- **Execução real do serviço:** passou pelos 188 primeiros targets com 0 `no-torrent`. Dandelion e Grand Blue foram baixados, e o serviço foi parado em seguida.

## Testes criados/alterados

- [src/backend/services/detailsCrawlerService.test.ts](../../src/backend/services/detailsCrawlerService.test.ts): `findTargetTorrents`.
  - Regressões com os dados de Dandelion (batch com a pasta como `content_path`) e de Grand Blue (só decisões).
  - Envio com falha é ignorado.
  - Decisão `blocked` é ignorada.
  - Decisão de outra resolução é ignorada.
