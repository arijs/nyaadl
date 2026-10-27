# Parser de títulos dos grupos fora da Erai-raws, bloqueio por variante e escolha romaji/inglês

## Prompt original

> podemos fazer um parse mais avançado para essas séries como "Even the student council..." (grupos que não seguem o padrão da Erai-raws), detectar o título em romaji e título em inglês e às vezes alguns tem até o nome do episódio no arquivo. Detectar e entender todas as tags (variante da fonte, codecs de áudio/vídeo, se tem várias linguagens, crc32. Permitir bloquear somente uma variante/codec/versão de legenda. Permitir escolher título em romaji ou inglês se houver. Não precisa fazer algo "future-proof" (que seja garantido funcionar pra novas séries), só algo que reconheça corretamente os títulos que já encontramos.

Decisões tomadas no planejamento:
- uma série por grupo;
- bloqueio de variante escolhendo as tags no modal;
- converter as entradas antigas da blacklist, que eram por episódio;
- escolher romaji ou inglês no modal de pasta ao aprovar.

## O que foi implementado

- **Parser** ([releaseTitle.ts](../../src/shared/releaseTitle.ts), compartilhado entre backend e frontend):
  - Uma regex por formato de grupo já encontrado no histórico: ToonsHub, VARYG, denisplay, hisako, Judas, Doomdos, Yameii, AnoZu e SubsPlease. A Erai-raws entra só para as tags.
  - Extrai título em inglês, título em romaji (sem "2nd Season"/" 2"), temporada, episódio, versão, nome do episódio, batch, resolução e CRC32.
  - Extrai também as tags: fonte, tipo, codec de vídeo, 10bit, áudio, idiomas de áudio, legendas, censura e REPACK.
  - Títulos de outros formatos devolvem `undefined` e seguem a regra antiga.
- **Identidade** ([normalizeService.ts](../../src/backend/services/normalizeService.ts)):
  - Títulos desses grupos viram `[Grupo] <título em inglês ?? romaji>[ S02]`.
  - Pastas desses grupos viram `[Grupo] <título>`, ignorando o que vem depois do primeiro `[` ou `(`.
  - Os candidatos de match ganham `[Grupo] <romaji>` e `[Grupo] <inglês>`, então uma pasta com qualquer um dos dois títulos casa.
  - O `[ToonsHub]` volta para a chave (uma série por grupo). Isso substitui a regra só da ToonsHub feita mais cedo.
- **Blacklist por variante:**
  - **Formato da chave:** `série::res::tag=valor;tag=valor` ([blacklistService.ts](../../src/backend/services/blacklistService.ts): `buildBlacklistKey`, `parseBlacklistEntry`, `sanitizeBlacklistTags`).
  - **Verificação:** `isTorrentBlacklisted` ([matchingService.ts](../../src/backend/services/matchingService.ts)) exige que o título tenha todas as tags da entrada.
  - **Normalização:** `normalizeBlacklistKey` passa a fazer só trim e minúsculas. Reconstruir a chave a cada carregamento foi o que transformou a entrada BILI em bloqueio da série inteira hoje cedo, e também mutilaria as chaves de variante.
  - **Endpoints:** `POST /api/blacklist` e `POST /api/pending/:id/blacklist` aceitam `tags` e calculam a chave pelo mesmo `buildTorrentMatchResult` da classificação. A varredura da fila usa `isTorrentBlacklisted`.
- **Frontend:**
  - [BlacklistConfirmModal.tsx](../../src/frontend/components/ui/BlacklistConfirmModal.tsx) lista as tags como checkboxes e serve também ao botão "Blacklist" da Pending queue e ao "Bloquear" do menu "Alterar decisão".
  - O chip [ReleaseTags.tsx](../../src/frontend/components/ui/ReleaseTags.tsx) mostra grupo, EN, RO, episódio, nome do episódio e tags nos cards da fila e do histórico.
  - O gerenciador da blacklist mostra as tags de cada entrada.
  - [ApproveDestinationModal.tsx](../../src/frontend/components/ui/ApproveDestinationModal.tsx) ganha as fontes "Romaji title" e "English title" (`fromRomaji`/`fromEnglish` em `GET /api/pending/:id/folder-options`).
- `buildWatchTarget` foi extraído de `scanWatchTargets` ([watchlistService.ts](../../src/backend/services/watchlistService.ts)) para os testes usarem o mesmo código.

## Antes / Depois

| | Antes | Depois |
|---|---|---|
| Chave do Judas E04 | `[judas] seitokai ni mo ana wa aru! {even …) [uncensored] - s01e04 [][hevc x265 10bit][multi-subs] (weekly)` | `[judas] even the student council has its holes` |
| `[ToonsHub] My Stepmother … S01E12 …` | não casava com `[ToonsHub] Ibitte Konai Gibo to Gishi [1080p]` | casa (título romaji) |
| `[denisplay] … - 03 [720p] … V2` | não casava com a pasta de 720p (o `v2` entrava na chave) | casa |
| Bloquear só a BILI | impossível | `[toonshub] even the student council has its holes::1080p::source=bili` |

Comparação com dados reais: os 6.900 títulos do histórico contra as pastas e a blacklist reais, código antigo vs. novo. Mudaram só os casos acima e os bloqueios antigos por episódio. Nenhum título da Erai mudou.

## Como foi testado

- `npm test`: 306 passando. `npm run typecheck` sem erros. `npm run build` ok.
- O projeto não tem framework de E2E nem linter. O fluxo de tela foi conferido manualmente com o app rodando (ver resumo da entrega).

## Testes criados/alterados

- `src/shared/releaseTitle.test.ts` (novo): um título real por formato de grupo com o objeto completo esperado, títulos desconhecidos, hífen no lugar de dois-pontos, temporada no título de identidade e tags dual/multi.
- `src/backend/services/normalizeService.test.ts`:
  - chaves por grupo (incluindo idempotência);
  - pastas reais;
  - `deriveFolderNamesByTitle`;
  - `normalizeBlacklistKey` preservando chaves de variante;
  - o teste da ToonsHub foi atualizado, porque o prefixo voltou para a chave.
- `src/backend/services/matchingService.test.ts`:
  - match com pasta em romaji e em inglês;
  - sem match entre grupos ou resoluções diferentes;
  - blacklist por variante.
- `src/backend/services/blacklistService.test.ts`: ida e volta de chave com tags e `sanitizeBlacklistTags`.
