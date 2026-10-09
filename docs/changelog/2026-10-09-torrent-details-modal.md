# Pasta por série + modal de detalhes sob demanda (Nyaa · Erai-raws · MAL · AniDB)

## Prompt original

> Quero refatorar para, em vez de salvar um json por série, criar uma pasta. Nesta pasta, quero ter:
> - um json com os dados principais
> - um json separado para a lista de releases do erai-raws
> Além disso, quero planejar um novo modal que abra as informações e detalhes do torrent/série, ativado por um pequeno ícone onde hoje está o link externo do Nyaa.
> Nesse modal vamos ter:
> - uma aba pra exibir os detalhes vindos do Nyaa
> - uma aba pra exibir detalhes extraídos do link do myanimelist da série, e outra igual para o anidb
> Todos esses dados não devem ser buscados antecipadamente, direto ao carregar a lista de torrents do nyaa. Devem ser buscados somente sob demanda, quando o usuário abrir o modal pela primeira vez. O ícone na lista pode refletir o estado se os dados já foram baixados ou não. Especialmente no myanimelist existem vídeos trailers das séries, vamos colocar eles também no modal. E vamos salvar as imagens de destaque de cada série, de cada site, na pasta.

Decisões tomadas com o usuário:
- **AniDB:** via HTTP API oficial, com o client registrado pelo usuário. O site devolve 403 para scripts.
- **Erai-raws:** ganha uma aba própria.
- **Quando buscar:** cada aba busca seus dados ao ser aberta pela primeira vez.

## Layout em disco

```
data/series/<erai-slug>/
  erai.json            série: título, sinopse, links (AniDB, MAL…), imageUrl
  erai-releases.json   { fetchedAtUtc, releases[] }
  erai.<jpg|webp>      pôster da página da erai-raws (.entry-content-poster img)
  mal.json             título, score/rank/popularidade, info lateral, sinopse, videos[]
  mal.jpg
  anidb.json           títulos, tipo, episódios, datas, notas, tags (15 de maior peso), descrição
  anidb.jpg
data/anidb-client.json { client, clientver } (gitignored, como todo /data)
```

- O detalhe da Nyaa continua em `data/YYYY-MM/<id>.json`.
- As 2 séries que estavam em `data/erai-raws/<slug>.json` foram rebuscadas para o novo layout por um script descartável, que também trouxe os pôsteres. A pasta antiga foi removida.

## O que foi implementado

### Busca sob demanda
- Saíram a chamada `archiveNyaaDetail` do `inspectAndClassifyTorrent` e o backfill da erai-raws feito ao salvar o cookie.
- O scrape não faz mais nenhuma requisição de detalhes.
- O TTL de 24h da erai-raws sumiu. O cache vale até o usuário clicar em **Refresh** na aba (`?refresh=1`).

### Backend
- **[seriesStore.ts](../../src/backend/storage/seriesStore.ts)**
  - Leitura e escrita de JSON por série.
  - `saveSeriesImage`: a extensão vem do content-type, a imagem anterior é substituída e falhas viram só um warning.
  - `findSeriesImage`.
  - `isSafeSeriesKey` bloqueia path traversal nos slugs que chegam pela URL.
- **[nyaaDetailService.ts](../../src/backend/services/nyaaDetailService.ts)**
  - `getNyaaDetail` procura o arquivo em qualquer mês. Se não existir, grava no mês do primeiro registro de decisão do torrent.
  - `listCachedNyaaDetailIds`.
- **[eraiRawsService.ts](../../src/backend/services/eraiRawsService.ts):** `getEraiSeries(slug, refresh)`. O parser agora devolve `{ series, releases }` e o `imageUrl` do pôster.
- **[malService.ts](../../src/backend/services/malService.ts)**
  - Lê o HTML de `myanimelist.net/anime/<id>`: título, título em inglês, `og:image`, score/rank/popularidade/membros, sinopse e a barra lateral (sem os nomes duplicados dos gêneros ocultos).
  - Lê os trailers de `/anime/<id>/_/video` (YouTube ids).
  - A API Jikan não respondia e foi descartada.
- **[anidbService.ts](../../src/backend/services/anidbService.ts)**
  - Usa a HTTP API (`request=anime`), com o XML lido pelo cheerio em modo XML e o gzip descomprimido manualmente quando vem sem `Content-Encoding`.
  - Uma trava global garante 1 requisição a cada 2s.
  - `<error>` vira uma mensagem para a UI.
  - Os links de personagem `http://anidb.net/chN [Nome]` na descrição viram só o nome.
- **Rotas em [server.ts](../../src/backend/server.ts)**
  - `GET /api/details/cached`
  - `GET /api/torrents/:id/details`
  - `GET /api/series/:slug/:source` (`erai` | `mal` | `anidb`)
  - `GET /api/series/:slug/images/:site`, a primeira rota binária do servidor
  - `POST /api/anidb/client`
  - `/api/status` ganhou `anidb`.
  - Erros de sites remotos chegam à UI com a mensagem original (`upstreamError`): 401 para cookie da erai-raws expirado, 502 nos demais.

### Frontend
- **[NyaaMeta.tsx](../../src/frontend/components/ui/NyaaMeta.tsx):** novo botão `ⓘ` antes do link `nyaa #id ↗`. Verde quando o detalhe já está salvo, cinza quando ainda não.
- **[useTorrentDetails.ts](../../src/frontend/hooks/useTorrentDetails.ts):** signals de módulo para abrir o modal de qualquer lista e para o conjunto de ids já salvos, carregado uma vez.
- **[TorrentDetailsModal.tsx](../../src/frontend/components/ui/TorrentDetailsModal.tsx):** abas Nyaa · Erai-raws · MyAnimeList · AniDB. Cada uma tem um `createResource` que só dispara quando a aba é aberta, um botão Refresh e a data em que os dados foram salvos.
  - **Nyaa:** campos, descrição, arquivos e comentários.
  - **Erai-raws:** pôster, sinopse, links e uma tabela com as 20 últimas releases (legendas e variantes).
  - **MAL:** imagem, estatísticas, info, sinopse e trailers. As miniaturas são do YouTube, e clicar carrega um único iframe `youtube-nocookie`.
  - **AniDB:** imagem, títulos, notas, tags e descrição.
  - As abas de série ficam desabilitadas para torrents que não são da Erai.
  - O modal fecha com Esc ou com clique no fundo.
- **[AnidbClientPanel.tsx](../../src/frontend/components/sections/AnidbClientPanel.tsx)**, em *Execution state*: o nome e a versão do client do AniDB.

## Antes / Depois

- **Antes:** cada torrent classificado gerava mais uma requisição à Nyaa, que puxava também a erai-raws. Os dados ficavam só em disco (`data/erai-raws/<slug>.json`), sem nada na UI.
- **Depois:** nada é buscado durante o scrape. O ícone `ⓘ` abre o modal, e cada fonte é buscada uma vez, quando a aba é aberta. Tudo fica em `data/series/<slug>/`, com as imagens.

## Como foi testado

- **Automatizado:** `npm test`, 211 testes passando. `npm run typecheck` sem erros. O projeto não tem linter.
- **Parser do MAL contra a página real** (salva só no scratchpad): 14 campos de info e 5 trailers para `anime/61013`.
- **Rotas (manual):**
  - Id inválido e slug com `../` → 400. Fonte desconhecida → 400.
  - Imagem salva → 200 `image/jpeg`. Imagem ausente → 404.
  - AniDB sem client → mensagem orientando a configurar.
  - Client inválido → 400.
  - Client falso → "AniDB: client version missing or invalid". Isso confirma o caminho real da API até o parse do erro. A configuração falsa foi removida depois.
- **E2E manual no Chrome** (sem infraestrutura de E2E no projeto). O screenshot falhou porque a janela estava oculta, então a verificação foi feita via DOM:
  - Os 15 ícones da página apareciam cinza. Abrir o 2171713 buscou o detalhe da Nyaa, e o ícone ficou verde.
  - A aba Erai-raws buscou a série `uchi-no-otouto-domo-ga-sumimasen`, com o pôster carregado e 20 releases.
  - A aba MAL trouxe score 7.06, info e 12 trailers. Clicar num trailer montou o iframe.
  - A aba AniDB mostrou o aviso de client não configurado.
  - Esc fechou o modal.
  - Em disco: `erai.json`, `erai-releases.json`, `erai.jpg`, `mal.json` e `mal.jpg`.
- **Pendentes:**
  - O AniDB com client real, que depende do registro pelo usuário.
  - Um scrape confirmando que nenhum `data/YYYY-MM/<id>.json` novo é criado. A chamada foi removida do código, mas o scrape não foi rodado, porque gera decisões e downloads reais.

## Testes criados/alterados

- `src/backend/storage/seriesStore.test.ts` (novo): round-trip de JSON, extensão por content-type, substituição da imagem e rejeição de path traversal.
- `src/backend/services/malService.test.ts` (novo) + `fixtures/mal-anime-sample.html`, escrita à mão.
- `src/backend/services/anidbService.test.ts` (novo): XML de exemplo, erros e formatos de link.
- `src/backend/services/nyaaDetailService.test.ts`: `getNyaaDetail` busca uma vez, acha o arquivo em outro mês e respeita o refresh.
- `src/backend/services/eraiRawsService.test.ts` + fixture:
  - O formato `{ series, releases }` e o pôster.
  - Saiu o teste do backfill, removido junto com o código.

## Fora do escopo

- Baixar os vídeos: os trailers são embeds do YouTube.
- Renderizar o markdown da descrição da Nyaa: mostrado como texto.
- MAL/AniDB para torrents que não são da Erai, porque os links vêm da página da erai-raws.
- Atualização automática: o refresh é manual, por aba.
