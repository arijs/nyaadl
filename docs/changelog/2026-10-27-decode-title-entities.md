# Decodifica entidades HTML no título dos torrents

## Prompt original

> este título está vindo com "&amp;" (html entities), no Nyaa original eu não vejo assim no navegador
> "[AOmundson] Magical Girl Raising Project (Mahou Shoujo Ikusei Keikaku) + Specials &amp; Extras (2016) [Dual Audio] (BD x264 1080p Hi10P TrueHD-PCM)"

## O que foi implementado

O scraper em uso, [nyaaScraperServiceStream.ts](../../src/backend/services/nyaaScraperServiceStream.ts), lê os atributos com o `@arijs/stream-xml-parser`, que entrega o valor cru, sem decodificar entidades. O scraper antigo, com cheerio, decodificava. Agora o atributo `title` do link e o da categoria passam por `decodeHTML` do pacote `entities`. Esse pacote já vinha instalado como dependência do cheerio e passou a constar em `package.json`.

Como o título é decodificado antes de `sanitizePathSegment`, os campos que derivam dele (`seriesBaseRaw`, `resolution`, `matchCandidates`) também saem limpos.

## Antes / Depois

- **Antes:** `... + Specials &amp; Extras (2016) ...`
- **Depois:** `... + Specials & Extras (2016) ...`

### Correção dos dados já gravados

> quero corrigir os itens já gravados

Feito direto nos dados, com o backend parado, sem mudança de código. Um script avulso aplicou `decodeHTML` ao texto de cada arquivo e validou o resultado com `JSON.parse` antes de gravar. Só apareciam `&amp;` e `&#39;`, e nenhum dos dois precisa de escape em JSON, então a formatação ficou igual. Antes de gravar, cada arquivo ganhou uma cópia `*.pre-entities.bak`.

| Arquivo | Linhas alteradas |
|---|---|
| `data/pending.json` | 9 |
| `data/blacklist.json` | 3 |
| `data/bootstrap-discovery.json` | 1 |
| `data/decisions/2026-07.jsonl` | 15 |
| `data/decisions/2026-08.jsonl` | 15 |
| `data/decisions/2026-09.jsonl` | 13 |
| `data/decisions/2026-10.jsonl` | 3 |

Os campos afetados eram `title`, `seriesBaseRaw`, `seriesKey` e chaves da blacklist. A blacklist tinha `let&#39;s go kaiki-gumi::{480p,720p,1080p}`, que depois da correção do scraper deixaria de casar com os títulos novos. Agora as entradas são `let's go kaiki-gumi::…`, igual ao que `deriveSeriesBase` gera para `[Erai-raws] Let's Go Kaiki-gumi - 01 [...]`.

Os arquivos de `data/series/*` (XML/HTML da AniDB e MAL) não foram mexidos, porque neles as entidades fazem parte do formato de origem.

## Como foi testado

- Teste de regressão novo com `&amp;` e `&#39;` no título.
- Os 20 snapshots de página em `torrents/` que tinham entidades falharam como esperado. Um script comparou cada item com o snapshot antigo já decodificado e encontrou 0 diferenças além das entidades. Depois disso os snapshots foram regravados com `NYAADL_ACCEPT=1`, e os antigos ficaram arquivados como `snapshot.N.json`.
- `npm test`: 307 passando, 0 falhas. `npm run typecheck`: sem erros.

## Testes criados/alterados

- [nyaaDetailService.test.ts](../../src/backend/services/nyaaDetailService.test.ts): `scrapeNyaaPageHtml decodes HTML entities in the title`
