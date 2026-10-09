# AniDB: informações completas da série + reviews do MAL e recomendações do AniDB

## Prompt original

> Registrei o client anidb. Tem mais informações relevantes da seção "info" que podemos pegar do AniDB?
> Neste arquivo eu peguei umas infos que o anidb mostra na versão web/html:
> @data/series/uchi-no-otouto-domo-ga-sumimasen/anidb-info-table.html
> Também, quero trazer as reviews (da primeira página, não todas) do MAL e do AniDB

## Contexto

A resposta da HTTP API (`request=anime`) foi inspecionada com uma única requisição, para a a19382, a mesma série do HTML de referência. Ela cobre quase toda a tabela "info" do site, e mais.

| Linha do site | Na API | Antes | Agora |
|---|---|---|---|
| Main/Official Title | `titles` | sim | sim |
| Type, episódios | `type`, `episodecount` | sim | sim |
| Year | `startdate`/`enddate` | sim | sim |
| Season | derivada do mês de início | — | `season` |
| Tags | `tags` (as do site têm `infobox="true"`, várias com `weight="0"`) | **perdia as de peso 0** (ex.: shounen, manga) | tags do site + demais com peso, sem spoilers, com descrição |
| Resources | `resources` (ids por tipo) | — | `resources` (ANN, MAL, site oficial, Wikipedia en/ja, Syoboi, Allcinema, Anison, Twitter, Crunchyroll, TMDB) |
| Rating / Average / Review Rating | `ratings` (`permanent`/`temporary`/`review`) | sim | sim, com os nomes do site |
| Stats, Added/Edited by | não existe na API | — | fora do escopo |
| *(só na API)* | `url`, `creators`, `characters`, `episodes`, `recommendations`, `relatedanime` | — | site oficial, staff, personagens + seiyuu, episódios (título em inglês, data, duração, nota, resumo), recomendações, anime relacionados |

### Reviews
- **MAL:** a primeira página de `/anime/<id>/_/reviews` traz 20 reviews, cada uma com o texto completo (o "Read more" só revela um trecho oculto), a nota, o veredito, o selo Preliminary e as reações.
- **AniDB:** a página de reviews fica atrás do desafio JavaScript do Cloudflare ("Just a moment…", 403 para scripts), e a série de referência tem 0 reviews. No lugar delas entram as **recomendações** que vêm na própria resposta da API (textos curtos de usuários, do tipo "Recommended").

## O que foi implementado

- **[anidbService.ts](../../src/backend/services/anidbService.ts)**
  - **Novos campos** em `parseAnidbXml`: `season`, `officialUrl`, `resources`, `creators`, `characters`, `episodes`, `recommendations` e `related`.
  - **Correção das tags:** agora entram as do infobox (inclusive as de peso 0) e as demais com peso, sem spoilers.
  - **XML bruto:** fica salvo em `data/series/<slug>/anidb.xml`. Com ele, abrir a aba ou dar Refresh nas primeiras 24h só refaz o parse do XML, sem chamar a API.
  - **Bloqueio de 24h:** o AniDB bane quem pede o mesmo anime de novo no mesmo dia. Um Refresh dentro de 24h, sem XML salvo, é recusado com a hora em que vai ser liberado.
  - A regra fica em `anidbCacheAction`, uma função pura e testada.
- **[malService.ts](../../src/backend/services/malService.ts):** `parseMalReviewsHtml`. `getMalDetails` faz uma terceira requisição (`/_/reviews`) e salva `reviews` no `mal.json`.
- **[seriesStore.ts](../../src/backend/storage/seriesStore.ts):** `readSeriesText`/`writeSeriesText`, para os payloads brutos.
- **[TorrentDetailsModal.tsx](../../src/frontend/components/ui/TorrentDetailsModal.tsx)**
  - **Aba AniDB:**
    - Season e as notas com os nomes do site.
    - Tags com a descrição no tooltip e os links da linha Resources.
    - Recomendações.
    - Uma tabela de episódios, com o resumo expansível.
    - Staff, personagens e anime relacionados.
  - **Aba MAL:** uma seção "Reviews", cada uma num `<details>` com veredito colorido, nota, autor, data, selo preliminary, reações e um resumo de 3 linhas que expande para o texto completo.
  - Um `mal.json` antigo, sem reviews, mostra um aviso pedindo Refresh.
- **Dados:** a resposta da a19382 obtida na inspeção virou `anidb.xml`/`anidb.json` de *Aishiteru Game*, mantendo o horário real da requisição. Assim, nenhuma requisição extra ao AniDB foi feita.

## Antes / Depois

- **Antes:** a aba AniDB tinha títulos, tipo, datas, 2 notas, tags parciais e descrição. A aba MAL não tinha reviews.
- **Depois:**
  - A aba AniDB cobre a tabela info do site (menos Stats e Added by) e acrescenta links, staff, personagens, episódios, recomendações e relacionados.
  - A aba MAL ganhou as 20 reviews da primeira página.
  - O Refresh do AniDB não arrisca mais um ban.

## Como foi testado

- **Automatizado:** `npm test`, 214 testes passando. `npm run typecheck` sem erros. O projeto não tem linter.
- **Parsers contra dados reais** (XML da API e HTML do MAL salvos só no scratchpad):
  - AniDB a19382: Spring 2026, as 5 tags do site + 2 com peso, os 11 links de Resources iguais aos do HTML de referência, 12 episódios, 7 personagens, 7 staff e 1 recomendação.
  - MAL 61839: 20 reviews com nota, veredito e texto completo.
- **E2E manual no Chrome**, via DOM, no torrent 2171713 (*Uchi no Otouto*):
  - A aba MAL mostrou o aviso "Saved before reviews were collected". O Refresh trouxe as 4 reviews da série, e abrir uma revela o texto completo.
  - A aba AniDB mostrou os dados salvos. O Refresh foi recusado com "already asked about this anime in the last 24h… refresh after 10/10/2026, 17:41:44".
- **Via API, em *Aishiteru Game*:**
  - A aba AniDB e o Refresh foram resolvidos a partir do `anidb.xml`, com o `fetchedAtUtc` inalterado, ou seja, sem chamada à API.
  - O MAL buscou pela primeira vez, com 20 reviews.

## Testes criados/alterados

- `src/backend/services/anidbService.test.ts`:
  - A fixture XML foi ampliada: tag infobox de peso 0, tag spoiler, categoria sem peso, resources conhecidos e desconhecidos, episódios fora de ordem + especial + crédito, recomendação e anime relacionado.
  - Testes novos para `anidbSeason` e `anidbCacheAction` (regra das 24h).
- `src/backend/services/malService.test.ts` + `fixtures/mal-reviews-sample.html`, escrita à mão: `parseMalReviewsHtml` (texto oculto incluído, `<br>`, veredito, preliminary, nota, reações).

## Fora do escopo

- Reviews do site AniDB, que ficam atrás do Cloudflare. Seria preciso usar o cookie `cf_clearance` do navegador, como foi feito com a erai-raws, e esse cookie expira rápido.
- As linhas "Stats" e "Added/Edited by" do site, que não estão na API.
- Imagens dos personagens.
- Manter os dados na tela quando um Refresh falha: hoje a aba mostra só o erro até o modal ser reaberto.
