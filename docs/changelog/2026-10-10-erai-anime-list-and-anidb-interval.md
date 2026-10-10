# Slug da erai-raws pela Anime List e intervalo maior na AniDB

## Prompt original

> os dados baixaram para todos os targets. O AniDB retornou banned em um request e os outros foram skipped. Entendo que releases que não são do Erai-raws não vão ter link, mas quero entender por que várias séries do Erai retornaram no-link.

> aumente o intervalo dos requests da AniDB.
> Além disso, vamos ver se achamos as entradas faltantes do Erai na página de Anime List (veja que há uma página para cada letra inicial)
> https://www.erai-raws.info/anime-list/

## Causa dos `no-link` em séries da Erai-raws

São 11 targets em que o link "Information" do Nyaa não é a página da série (`…/anime-list/<slug>/`). Sem slug não há página da Erai, e é dela que saem os links do MAL e da AniDB.

- **Torrents antigos (2018–2020):** o link é só a home do site (`https://erai-raws.info` ou `https://www.erai-raws.info`). Casos: Sunohara-sou, Island, Ongaku Shoujo, Shichisei no Subaru e Kimi to Boku… (540p e 720p).
- **Torrents recentes (2026):** `No information.` no torrent escolhido. Casos: Clevatess II, Mushoku Tensei III, Oni no Hanayome, Needy Girl Overdose e Youkoso Jitsuryoku… S4.

## O que foi implementado

- [eraiAnimeListService.ts](../../src/backend/services/eraiAnimeListService.ts) (novo):
  - A Anime List tem todas as séries numa página só; as letras são âncoras (`#menu_A`…). São ~2.500 entradas e ~700 KB.
  - `parseEraiAnimeListHtml` lê os links `a.aa_ss_ops_new` para `/anime-list/<slug>//`.
  - `eraiTitleKey` monta uma chave comparável: ignora pontuação (nas pastas, `:` vira `-`) e normaliza a temporada (`S4`, `4th Season` e `Season 4` viram `season 4`).
  - `seriesNameFromTorrentTitle` tira do título o grupo, o episódio, o intervalo de batch (`01 ~ 12`) e os metadados.
  - `findEraiSlugByTitle` procura o título exato e, se não achar, o título antes de `:` (por exemplo "…4th Season: 2-nensei-hen 1 Gakki" para "… S4"). Só aceita um resultado único.
  - `resolveEraiSeriesSlug(detail)` usa o link do Nyaa primeiro. Sem ele, e só para títulos `[Erai-raws]`, procura o título na lista.
  - A lista fica em cache em `data/erai-anime-list.json`, por até 24h, e só é baixada quando precisa procurar um slug.
- [eraiRawsService.ts](../../src/backend/services/eraiRawsService.ts): `fetchEraiHtml` passou a ser exportado (sessão, User-Agent do DDoS-Guard e status da sessão).
- [detailsCrawlerService.ts](../../src/backend/services/detailsCrawlerService.ts): o slug vem de `resolveSlug(detail)`. Se a busca na lista encontrar a sessão da erai expirada, o serviço para, como no resto da Erai.
- [server.ts](../../src/backend/server.ts): o modal de detalhes também usa `resolveEraiSeriesSlug`. Assim, as abas Erai, MAL e AniDB funcionam nesses torrents. Se a busca falhar, as abas só ficam desativadas, como antes.
- [anidbService.ts](../../src/backend/services/anidbService.ts): o intervalo mínimo entre requisições à AniDB passou de **2s para 5s**.

## Antes / Depois

- **Antes:** 20 targets com Erai/MAL/AniDB `no-link`, 11 deles da Erai-raws.
- **Depois:** 10, **todos de outros grupos** (VARYG, ToonsHub e Yurasuka). Todas as séries da Erai-raws têm slug.

## Como foi testado

- **Automatizado:**
  - `npm test`: 262 passando, 0 falhas.
  - `npm run typecheck`: sem erros.
- **Validação offline com a página real salva, nos 639 targets da Erai-raws que já tinham slug pelo Nyaa:**
  - a busca por título concorda em 624;
  - não acha nada em 13 (o título só é usado quando não há link, então isso não afeta nada);
  - discorda em 2. Nesses 2 (`Honzuki no Gekokujou … Ryushu no Youjo`), quem está errado é o link do Nyaa, que aponta para `niwatori-fighter`. Como o link do Nyaa continua tendo prioridade, nada muda para eles.
- **Os 11 da Erai-raws foram todos recuperados**, por exemplo `Island → island`, `Youkoso … S4 → …-4th-season-2-nensei-hen-1-gakki` e `Mushoku Tensei III- … → mushoku-tensei-iii-isekai-ittara-honki-dasu`.
- **Execução real do serviço:** passou pelos 667 targets em 93s.
  - A lista foi baixada uma vez (258 KB salvos).
  - Erai e MAL das séries recuperadas foram baixados: 5 páginas novas da Erai. As outras já estavam salvas pela outra resolução.
  - A AniDB continuou banida: 1 erro, e o restante ficou `skipped`.

## Testes criados/alterados

- [src/backend/services/eraiAnimeListService.test.ts](../../src/backend/services/eraiAnimeListService.test.ts) (novo):
  - leitura da página no formato real (minificado, href sem aspas, barra dupla), sem duplicados e sem links que não são de série;
  - a chave comparável;
  - o nome da série a partir do título, incluindo batch;
  - a busca exata, a busca antes de `:` e a recusa de resultados ambíguos;
  - `resolveEraiSeriesSlug`: link primeiro, a lista só para `[Erai-raws]`.
- [src/backend/services/detailsCrawlerService.test.ts](../../src/backend/services/detailsCrawlerService.test.ts):
  - regressão: slug encontrado pela lista quando o link é só a home do site;
  - sessão expirada na busca da lista é fatal.
