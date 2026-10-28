# Batch já baixado reaparece como aprovado em vez de "already downloaded"

## Prompt original

> eu tenho um torrent que já foi adicionado no qbittorrent e baixado, mas quando o nyaadl faz a raspagem, ele é detectado como "novo" (auto approved) de novo, em vez de "already downloaded"
> #2178919

## Causa

O #2178919 é um batch, `[Erai-raws] Watashi no Shiawase na Kekkon Special - 01 ~ 03 [...] [BATCH]`, aprovado manualmente. Ao reencontrar um torrent com decisão no histórico, o bootstrap chama `findReplayLocalMatch`. Essa função só procurava o arquivo local pelo **título** (`findExistingLocalMatchByTitle`), e por isso falhava por dois motivos:

1. O qBittorrent salva o batch dentro da pasta raiz do torrent (`<pasta da série>\[Erai-raws] ... - 01 ~ 03 [...]\*.mkv`), e a busca só lia os arquivos do topo da pasta da série.
2. O título do batch não tem `[CRC32]`, e os arquivos têm. A comparação de `fileHash` (`hasSameOptionalToken`) rejeitaria o arquivo de qualquer forma.

Sem um match local, a decisão `approved` caía em `autoApproved` com o motivo "(replayed from history)".

## O que foi implementado

- [localLibraryService.ts](../../src/backend/services/localLibraryService.ts): nova função `findExistingLocalMatchByNames(target, names)`. Ela procura os arquivos de vídeo internos do torrent pelo nome exato, no topo da pasta da série ou um nível abaixo. Só devolve `exact` quando **todos** os arquivos existem, então um download incompleto continua sem match.
- [bootstrapDiscoveryService.ts](../../src/backend/services/bootstrapDiscoveryService.ts): `findReplayLocalMatch` tenta primeiro os `internalNames` da decisão. Se não encontrar, usa a busca por título, como antes.

## Antes / Depois

- **Antes:** o #2178919 aparecia em "auto approved" com o motivo `approved manually -> ... (replayed from history)`.
- **Depois:** aparece em "already downloaded" com o motivo `existing local files found for 3 torrent files (replayed from history; previous status: approved)`.

## Como foi testado

- Automatizado: um teste novo em `localLibraryService.test.ts` monta um batch numa subpasta e confirma o match `exact`. Depois apaga um dos arquivos e confirma que o match deixa de acontecer. `npm test`: 309/309. `npm run typecheck`: ok.
- Manual: um script avulso rodou `findExistingLocalMatchByNames` contra o watch target real `Q:\2025.1 Inverno\[Erai-raws] Watashi no Shiawase na Kekkon Special [720p]` e retornou `exact` para os 3 arquivos.

## Torrents baixados por fora do nyaadl

> Sim faça a correção também para torrents baixados por fora

Um torrent sem decisão no histórico passa por dois caminhos, e os dois também deixavam passar o batch:

- `inspectAndClassifyTorrent`, usado pela raspagem e pelo bootstrap: `findExistingLocalMatch` compara os nomes e tamanhos dos arquivos do .torrent, mas só lia o topo da pasta da série.
- No bootstrap, quando o título bate com um watch target, o caminho rápido só verificava pelo título e já baixava e aprovava o torrent.

Mudanças:

- [localLibraryService.ts](../../src/backend/services/localLibraryService.ts): `listLocalVideoPaths` lista os vídeos da pasta da série com `readdir({ recursive: true })`, subpastas incluídas. `findExistingLocalMatch`, `findExistingLocalMatchByTitle` e `findExistingLocalMatchByNames` passaram a usá-la.
- [bootstrapDiscoveryService.ts](../../src/backend/services/bootstrapDiscoveryService.ts): no caminho rápido, se a busca pelo título falha, o .torrent baixado tem a metainfo lida e passa por `findExistingLocalMatch`. Com match `exact`, a decisão é gravada como `already_downloaded` e nada vai ao qBittorrent. O registro da decisão virou a função local `recordAlreadyDownloaded`, usada pelos dois casos.

Testado: o teste do batch também cobre `findExistingLocalMatch` com os arquivos numa subpasta. Um script avulso rodou contra o `.torrent` real do #2178919 e o watch target do Q: e retornou `exact`. `npm test`: 309/309. `npm run typecheck`: ok.

## Limite da varredura

> Limite a verificação a 2 níveis e até 200 arquivos no máximo

`listLocalVideoPaths` deixou de usar `readdir({ recursive: true })`. Agora percorre a pasta nível por nível: a pasta da série e até 2 níveis de subpasta (`maxSubfolderDepth`). Para ao chegar a 200 arquivos de vídeo (`maxLocalVideoFiles`). Como a busca começa pelo nível mais raso, os arquivos do topo entram primeiro na conta.

Testado: um teste novo em `localLibraryService.test.ts` confirma que um arquivo 3 níveis abaixo não é encontrado e um 2 níveis abaixo é. Com 200 vídeos no topo, o limite é atingido antes da subpasta. `npm test`: 310/310. `npm run typecheck`: ok.

## Testes criados/alterados

- `src/backend/services/localLibraryService.test.ts`
