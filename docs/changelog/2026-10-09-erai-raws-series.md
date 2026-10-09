# Página da série na erai-raws.info com o cookie do usuário

## Prompt original

> Quando os detalhes de um torrent buscado e salvo contém um link para "erai-raws.info" no campo "information", eu quero que o script acesse o link e salve as informações relevantes. Mas acho que o site só mostra as informações para o usuário logado. Quero ver como podemos fazer o script conseguir acessar as informações, seja passando meus cookies ou fazendo uma extensão do chrome que abra a página pelo meu navegador

Decisões tomadas com o usuário:
- **Autenticação:** cookie colado numa UI. Não há arquivo para editar à mão e não foi feita extensão do Chrome.
- **Campos:** definidos inspecionando a página logada no Chrome.
- **Armazenamento:** um arquivo por série.

## Contexto

- **Página deslogada:** a erai-raws.info mostra só "Log in to see the content of the website".
- **Página logada:** inspecionada no Chrome do usuário.
  - O cookie de login do WordPress é HttpOnly, então não aparece em `document.cookie`. Por isso a UI pede o header `Cookie` inteiro, copiado do DevTools.
  - Há cookies DDoS-Guard (`__ddg*`), que costumam ser amarrados ao navegador. Por isso o backend reenvia o cookie com o `navigator.userAgent` do mesmo Chrome.
- **Formato do link:** `information` aponta para a página da **série** (`/anime-list/<slug>/`), não do episódio. Vários torrents compartilham o mesmo link.

## Dados salvos em `data/erai-raws/<slug>.json`

| Campo | Origem na página | Exemplo |
|---|---|---|
| `title` | `article h1.entry-title` | `Replica datte, Koi wo Suru` |
| `synopsis` | `.entry-content-story` | |
| `links[]` | `a.entry-sub-content-buttons` | NZB, SUB, AniDB, AniList, Kitsu, LiveChart, MAL |
| `releases[].type` | `a.tooltip2` | `A` (episódio) / `E` (encode HEVC) / `S` |
| `releases[].title` / `url` | `a.aa_ss_ops_new` | `Replica datte, Koi wo Suru - 13` |
| `releases[].releasedAt` | `font.clock_font` (texto, sem fuso conhecido) | `Jun 30, 2026 11:34` |
| `releases[].subtitles` | `span.flag-icon-<cc>` | `["us","br","mx",…]` |
| `releases[].variants[]` | `th > span` (`1080p \| Size: 1.38GB \| CR WEB-DL AVC AAC`) | `{ resolution, sizeText, source }` |

Também são salvos `url`, `slug` e `fetchedAtUtc`. As releases vêm só da aba **All** (`#menu0`), que lista as 20 mais recentes.

**Fica de fora:**
- O feed RSS e os links de torrent/magnet desses botões, porque carregam o token pessoal do usuário.
- Os botões de conta (My Anime List, My Settings).

## O que foi implementado

- **[eraiRawsService.ts](../../src/backend/services/eraiRawsService.ts)**
  - `parseEraiSeriesHtml` (cheerio). Lança `EraiRawsAuthError` quando a página vem deslogada.
  - Sessão `{ cookie, userAgent }` em `data/erai-raws-session.json`. A pasta `data/` já está no `.gitignore`.
  - `archiveEraiSeries(url)` é best-effort e só faz `console.warn` em caso de falha. Rebusca a página se o arquivo tiver mais de 24h (TTL fixo).
  - Status em memória: `unknown` / `ok` / `expired` / `loggedInAs`.
  - `saveEraiRawsSession` grava a sessão e a testa numa série já referenciada (ou na home). Se o teste passar, faz o backfill das séries citadas em `data/YYYY-MM/*.json`.
- **[nyaaDetailService.ts](../../src/backend/services/nyaaDetailService.ts):** `archiveNyaaDetail` chama `archiveEraiSeries(information)`, tanto para detalhes novos quanto para os já salvos.
- **[server.ts](../../src/backend/server.ts)**
  - `GET /api/status` ganhou `eraiRaws`. O cookie nunca é devolvido.
  - Nova rota `POST /api/erai-raws/session` (`{ cookie, userAgent }`). Retorna 400 se o cookie vier vazio.
- **UI:** [EraiRawsSessionPanel.tsx](../../src/frontend/components/sections/EraiRawsSessionPanel.tsx) fica dentro de *Execution state*.
  - Mostra o status, as instruções em 3 passos, uma textarea e o botão "Save and test".
  - Envia `navigator.userAgent` junto com o cookie.

## Antes / Depois

- **Antes:** `information` era salvo só como URL, e o conteúdo da erai-raws ficava inacessível ao script.
- **Depois:** com o cookie salvo pela UI, cada série referenciada vira `data/erai-raws/<slug>.json`, atualizado no máximo uma vez a cada 24h. Quando o cookie expira, o card mostra "Session expired" e nada é gravado.

## Como foi testado

- **Automatizado:** `npm test`, 202 testes passando. `npm run typecheck` sem erros. O projeto não tem linter configurado.
- **Manual (E2E, sem infraestrutura de E2E no projeto):**
  - Cookie vazio → 400 "Missing erai-raws cookie".
  - Cookie inválido → status `expired`, sem `data/erai-raws/` criado.
  - O card aparece em *Execution state* no dashboard (verificado no Chrome).
  - Cookie real colado pelo usuário: o card mostrou o usuário logado, e o backfill criou `data/erai-raws/replica-datte-koi-wo-suru.json` e `aishiteru-game-wo-owarasetai.json`. Cada arquivo tem 20 releases, todas com legendas e variantes, e nenhum token ou magnet.
  - Essa primeira rodada revelou dois botões de conta em `links`: "My Anime List (0)" e "My Settings" (`/wp-admin/profile.php`).
    - Correção: links da erai-raws.info fora de `/nzbs/` e `/subs/` agora são descartados, e os dois botões entraram na fixture como regressão.
    - Os dois JSONs foram regerados.

## Testes criados/alterados

- `src/backend/services/eraiRawsService.test.ts`, com 4 testes:
  - parser com a fixture;
  - página deslogada;
  - `eraiSeriesSlug`;
  - `listArchivedEraiSeriesUrls`.
- `src/backend/services/fixtures/erai-series-sample.html`: escrita à mão a partir da estrutura real, sem tokens.

## Fora do escopo

- O "«Show more»": só as 20 releases mais recentes da aba All são lidas.
- Páginas por episódio (`/episodes/<slug>-NN/`).
- Exibir os dados da erai-raws na UI.
- Extensão do Chrome. Só vale a pena se o DDoS-Guard bloquear o `fetch` do Node mesmo com cookie e User-Agent corretos.
