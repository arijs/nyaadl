# Lista de arquivos por combo no box Watch targets

## Prompt original

> No box Watch Targets, adicione um pequeno botão para mostrar a lista de arquivos (se houver mais de um combo, ex: "2025.2 Primavera/aiomodarkelf [480p]" com "adn/multisub" e "hidive/mono", deve haver um botão por combo e mostrar somente os arquivos daquele combo). Os arquivos devem ser listados com os dados do torrent e o botão pra abrir o modal com detalhes do torrent e as abas "nyaa/erai/MAL/anidb".

## O que foi implementado

**Backend**
- [localLibraryService.ts](../../src/backend/services/localLibraryService.ts):
  - `listMatchingVideoFiles`: lista os vídeos da pasta que são da série e da resolução do target. Antes, essa lógica estava duplicada em `countMatchingLocalFiles` e `analyzeFingerprintCombos`, que agora a usam.
  - `buildFingerprintComboKey`: monta a chave do combo, por exemplo `adn|none|true`.
  - Cada `FingerprintComboBreakdown` ganhou o campo `key`.
- [watchTargetFilesService.ts](../../src/backend/services/watchTargetFilesService.ts) (novo):
  - `buildLocalFileTorrentIndex`: acha o torrent de um arquivo local no histórico de decisões. Tenta, nesta ordem:
    1. os nomes internos do torrent;
    2. o título do torrent (nos Erai-raws, é o nome do arquivo sem extensão);
    3. o hash `[CRC32]` que o título e o arquivo trazem.
  - Quando há várias decisões para o mesmo torrent, vale a mais recente.
  - `listWatchTargetFiles`: devolve os arquivos do combo pedido, ordenados por episódio, com o tamanho e o torrent (ID, status, dados da listagem do Nyaa).
- [server.ts](../../src/backend/server.ts): nova rota `POST /api/watchlist/target-files` `{ folderPath, comboKey? }`. Ela só aceita a pasta de um watch target conhecido; qualquer outro caminho recebe 404.
- [watchTargetService.ts](../../src/backend/services/watchTargetService.ts): removidas as cópias locais de `FingerprintComboBreakdown`, `WatchTargetRow` e da página. Agora usa os tipos de `@shared/api`.

**Frontend**
- [WatchedRootsSection.tsx](../../src/frontend/components/sections/WatchedRootsSection.tsx): um botão **Files** / **Hide files** por combo.
  - Com um combo só, ele fica na linha do combo.
  - Com vários, fica em cada caixa de combo, quando o target é expandido.
- [WatchTargetFileList.tsx](../../src/frontend/components/ui/WatchTargetFileList.tsx) (novo): busca e lista os arquivos do combo. Cada linha mostra:
  - o nome e o tamanho do arquivo;
  - o status da decisão, o botão `🔍/📖 #id` (que abre o modal com as abas Nyaa/Erai-raws/MyAnimeList/AniDB), a categoria e o tamanho;
  - a data de publicação, seeders, leechers e downloads;
  - o título do torrent, quando é diferente do nome do arquivo (match pelo hash);
  - "No torrent for this file in the history.", quando não há match.
- [statusTag.ts](../../src/frontend/lib/statusTag.ts): `statusTagClass` saiu de `TorrentHistorySection` para ser usada pelas duas listas.

## Antes / Depois

- **Antes:** o Watch targets mostrava só o resumo de cada combo (fonte, multisub ou mono, número de episódios, episódios faltando).
- **Depois:** cada combo tem um botão Files, que mostra só os arquivos daquele combo, com os dados do torrent e o botão do modal.

## Como foi testado

- **Automatizado:**
  - `npm test`: 234 passando, 0 falhas.
  - `npm run typecheck`: sem erros.
  - `npm run build`: build concluído.
- **API com os dados reais:**
  - `aiomodarkelf [480p]` e `[720p]` têm os combos `adn|none|true` (12) e `hidive|none|false` (12). Nenhum arquivo tem torrent, porque a série é de 2025.2 e não aparece no histórico (busca no histórico: 0).
  - Targets de 2026.4 (Magical Explorer, Ao Ashi S2, Chii Fuyo, entre outros): todos os arquivos têm torrent.
  - Uma pasta fora dos targets (`C:\Windows`) recebe 404.
- **Manual no Chrome:**
  - Em `aiomodarkelf [480p]`, expandido, há um botão Files por combo. O do hidive lista só os 12 arquivos HIDIVE, e o adn continua fechado.
  - Em `Magical Explorer [480p]` (um combo só), o Files lista os episódios 01 e 02 com "approved", `#2169226`/`#2169231`, a categoria, o tamanho, a data e as estatísticas.
  - O botão `#2169226` abre o modal com as abas Nyaa, Erai-raws, MyAnimeList e AniDB.

## Testes criados/alterados

- [src/backend/services/watchTargetFilesService.test.ts](../../src/backend/services/watchTargetFilesService.test.ts) (novo):
  - O match funciona pelo nome interno, pelo título (inclusive um título com ponto, "Dr. Stone") e pelo hash, e devolve a decisão mais recente.
  - A listagem com uma pasta temporária: chaves dos combos, filtro por combo, ordem por episódio, tamanho, torrent conhecido e desconhecido, e o arquivo que não é vídeo fica de fora.
