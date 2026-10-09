# Link do Nyaa, categoria e tamanho em todo torrent + arquivo de detalhes por mês

## Prompt original

> Em todos os lugares onde o sistema exibe um torrent, quero que ele exiba também um link para a página de detalhe do torrent no Nyaa, e as infos da lista: categoria e tamanho do conteúdo do torrent.
> O sistema também pode baixar as infos de cada página de detalhe de torrent, exemplo:
> https://nyaa.si/view/2170558
> Para salvar estes dados, vamos propor uma estrutura de pastas em "/data", com uma pasta pra cada mês processado: "/data/2026-10/". Dentro dela, vamos salvar um arquivo para cada torrent com os detalhes da página do Nyaa. Veja os dados que podemos extrair.

## Dados que a página `/view/<id>` expõe

| Campo salvo | Origem na página | Exemplo (2170558) |
|---|---|---|
| `title` | `.panel-title` | `[Erai-raws] Chii Fuyo - 01 [1080p …]` |
| `category` / `categoryIds` | links `?c=` em *Category* | `Anime - English-translated` / `["1_0","1_2"]` |
| `publishedAtUtc` | `data-timestamp` em *Date* | `2026-10-06T15:31:27.000Z` |
| `submitter` / `submitterRank` | link em *Submitter* (+ `title`) | `Erai-raws` / `Trusted` |
| `information` | link em *Information* | `https://www.erai-raws.info/anime-list/chii-fuyo/` |
| `sizeText` | *File size* | `1.3 GiB` |
| `seeders` / `leechers` / `completed` | colunas homônimas | `342` / `3` / `2263` |
| `infoHash` | *Info hash* | `df838f58…` |
| `magnet` | link `magnet:` | `magnet:?xt=urn:btih:…` |
| `descriptionMarkdown` | `#torrent-description` (markdown cru: vídeo, áudio, legendas, duração) | |
| `files[]` | `.torrent-file-list` (pastas achatadas em `path`, com tamanho) | `[{ path: "….mkv", sizeText: "1.3 GiB" }]` |
| `comments[]` | `.comment-panel` (usuário, data, texto) | `[{ user: "FlowerPower", text: "thanks" }]` |

Também salvos: `torrentId`, `url` e `fetchedAtUtc`.

## O que foi implementado

- **Categoria na lista**: `TorrentItem.category` (atributo `title` do link `/?c=X_Y` da 1ª coluna), lido pelos dois scrapers ([stream](../../src/backend/services/nyaaScraperServiceStream.ts) e [cheerio](../../src/backend/services/nyaaScraperService.ts)). Persistido no histórico de decisões ([decisionStore.ts](../../src/backend/storage/decisionStore.ts)). O tamanho (`sizeText`) já era capturado.
- `BootstrapAutoDecisionSummary` ganhou `category` e `sizeText`, para as listas do bootstrap.
- **Detalhes do Nyaa** ([nyaaDetailService.ts](../../src/backend/services/nyaaDetailService.ts)):
  - `parseNyaaDetailHtml` extrai os campos da tabela acima (cheerio, que já era dependência).
  - `archiveNyaaDetail(torrentId)` grava `data/YYYY-MM/<torrentId>.json`, com YYYY-MM = mês do processamento. Se o arquivo já existe, não refaz a requisição. Falha só gera `console.warn`, sem bloquear a classificação.
  - Chamado no início de `inspectAndClassifyTorrent` ([nyaaTorrentService.ts](../../src/backend/services/nyaaTorrentService.ts)), que é o ponto comum do scrape e do bootstrap. Cada torrent novo custa uma requisição a mais ao Nyaa (já havia uma para o `.torrent`).
- **UI**: novo componente [NyaaMeta.tsx](../../src/frontend/components/ui/NyaaMeta.tsx) (`nyaa #id ↗ · categoria · tamanho`), usado em:
  - Pending queue: o tamanho saiu da linha de estatísticas e foi para o NyaaMeta.
  - Torrent history.
  - Falhas do qBittorrent (Execution state).
  - Bootstrap: *Matched torrent*, *Needs review* e as listas Backfilled / Auto approved / Auto rejected / Already downloaded.
  - Modais de aprovação e de blacklist: só o link, porque o estado do modal não tem categoria nem tamanho.
- README: seção *Data Layout* atualizada.

## Antes / Depois

| | Antes | Depois |
|---|---|---|
| Torrent na UI | título, série, resolução, (tamanho só na pending queue) | + link `nyaa #id ↗`, categoria e tamanho em todos os lugares |
| `TorrentItem` | sem categoria | `category: "Anime - English-translated"` |
| Detalhes do Nyaa | não coletados | `data/2026-10/2170558.json` por torrent processado |

Decisões antigas não têm `category`; o NyaaMeta só omite o campo.

## Como foi testado

- **Automatizado**: `npm test`: 192/192 passando. `npm run typecheck` limpo. `npm run build` ok.
- **Snapshots locais** (`torrents/page-*/snapshot.json`): antes de re-aceitar, um script comparou os 148 snapshots com a saída nova sem o campo `category`. Todos idênticos, e 100% das linhas com categoria preenchida. Depois disso foi rodado `NYAADL_ACCEPT=1` (os antigos ficaram arquivados como `snapshot.N.json`).
- **Manual (rede real)**: `archiveNyaaDetail('2170558')` gerou `data/2026-10/2170558.json` com título, categoria, tamanho, seeders, 1 arquivo e 1 comentário.
- **E2E**: o projeto não tem infraestrutura de E2E (nem Playwright nem similar). A UI foi validada por typecheck e build, sem teste de navegador.

## Testes criados/alterados

- `src/backend/services/nyaaDetailService.test.ts` (novo): parse completo da fixture real, achatamento de pastas aninhadas, caminho por mês e categoria no parse da lista.
- `src/backend/services/fixtures/nyaa-view-2170558.html` (nova fixture).
