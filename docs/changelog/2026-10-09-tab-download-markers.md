# Abas MAL e AniDB indicam quando os dados ainda não foram baixados

## Prompt original

> Nas abas, adicione um indicador quando os dados do MAL e do AniDB ainda não foram baixados

## O que foi implementado

- **[seriesStore.ts](../../src/backend/storage/seriesStore.ts):** `listSavedSeriesSources(slug, names)` diz quais `<fonte>.json` já existem na pasta da série, com um único `readdir`.
- **[server.ts](../../src/backend/server.ts):** `GET /api/torrents/:id/details` passa a devolver `savedSources` (ex.: `['erai', 'anidb']`) junto com o `seriesSlug`. O tipo correspondente é `TorrentDetailsPayload.savedSources`.
- **[TorrentDetailsModal.tsx](../../src/frontend/components/ui/TorrentDetailsModal.tsx):** as abas MyAnimeList e AniDB mostram `🔍`, a mesma convenção do botão da lista, com o tooltip "Not downloaded yet — opening this tab fetches it", enquanto a fonte:
  - não está em `savedSources`, e
  - não foi buscada nesta abertura do modal.

  Assim que a aba busca os dados com sucesso, o marcador some. Se a busca falha (ex.: client do AniDB não configurado), o marcador continua.

## Antes / Depois

- **Antes:** não dava para saber, sem abrir a aba, se ela ia disparar uma requisição.
- **Depois:** `MyAnimeList🔍` e `AniDB🔍` sinalizam as abas que vão buscar dados ao serem abertas.

## Como foi testado

- `npm test`, 219 testes passando (1 novo). `npm run typecheck` sem erros.
- **Manual no Chrome**, via DOM:
  - *Replica datte* (2100932), que só tinha dados da erai-raws: `MyAnimeList🔍` e `AniDB🔍`. Depois de abrir a aba MAL, só `AniDB🔍` continuou. A aba AniDB não foi aberta, para não gastar uma requisição.
  - *Aishiteru Game* (2100934), com tudo salvo: nenhum marcador.

## Testes criados/alterados

`src/backend/storage/seriesStore.test.ts`: novo teste de `listSavedSeriesSources`.
