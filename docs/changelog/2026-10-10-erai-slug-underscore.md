# Abas Erai/MAL/AniDB desativadas para séries com "_" no slug da erai-raws

## Prompt original

> eu abri o modal do torrent #2064010 (em "2026.1 Inverno/[Erai-raws] 29_sai Dokushin Chuuken Boukensha no Nichijou [480p]"), o torrent tem um link "information" para o site erai-raws, mas as abas do Erai, MAL e AniDB estão desativadas/bloqueadas

## Causa

- O link "Information" do torrent aponta para `https://www.erai-raws.info/anime-list/29_sai-dokushin-chuuken-boukensha-no-nichijou/`, e o slug tem um **underscore**.
- `eraiSeriesSlug` só aceitava `[a-z0-9-]`, então devolvia `null`. Sem `seriesSlug`, o modal desativa as abas Erai-raws, MyAnimeList e AniDB ("Not an erai-raws torrent").
- `isSafeSeriesKey`, que valida o slug nas rotas `/api/series/:slug/...` e na pasta `data/series/<slug>`, tinha a mesma restrição. Por isso as rotas também recusariam esse slug.

## O que foi implementado

- [eraiRawsService.ts](../../src/backend/services/eraiRawsService.ts): `eraiSeriesSlug` aceita `[a-z0-9][a-z0-9_-]*`.
- [seriesStore.ts](../../src/backend/storage/seriesStore.ts): `isSafeSeriesKey` aceita o mesmo padrão. Continua barrando `.`, `/`, `\` e nomes que começam com `_` ou `-`, então nada escapa de `data/series/`.

## Antes / Depois

- **Antes:** `GET /api/torrents/2064010/details` devolvia `seriesSlug: undefined`, e as 3 abas apareciam desativadas.
- **Depois:** devolve `seriesSlug: "29_sai-dokushin-chuuken-boukensha-no-nichijou"`, e as 4 abas ficam ativas.

## Como foi testado

- `npm test`: 242 passando, 0 falhas.
- `npm run typecheck`: sem erros.
- Os dois testes de regressão falham sem a correção e passam com ela.
- **Manual no Chrome:**
  - No modal do #2064010 (aberto pela lista de arquivos do target 480p), as abas Nyaa, Erai-raws, MyAnimeList e AniDB estão ativas.
  - A aba Erai-raws carrega em ~2,9s, com a sinopse, a imagem, os links e as 20 releases.
  - Os dados ficam salvos em `data/series/29_sai-dokushin-chuuken-boukensha-no-nichijou/`.

## Testes criados/alterados

- [src/backend/services/eraiRawsService.test.ts](../../src/backend/services/eraiRawsService.test.ts): `eraiSeriesSlug` aceita o slug com underscore do #2064010.
- [src/backend/storage/seriesStore.test.ts](../../src/backend/storage/seriesStore.test.ts): `isSafeSeriesKey` aceita esse slug e continua recusando `_hidden` (underscore no início).
