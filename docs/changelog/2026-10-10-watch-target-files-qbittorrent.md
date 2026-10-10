# Arquivos fora do histórico: dados do torrent vindos de um índice local do qBittorrent

## Prompts originais

> Entendi, aiomodarkelf não está no history. Nesses casos que não estão no history, será que conseguimos fazer uma query no qbittorrent para pegar as informações nele se o torrent estiver na lista? Apenas responda, e se sim, com os detalhes que teríamos de volta. Não implemente ainda.

> Sim, vamos fazer de forma eficiente, sem gravar um json monstro de 64 MB, e com sincronização incremental

> Nada é gravado em disco? Isso não me parece eficiente. Esse app não fica rodando o tempo todo, eu inicio ele só quando vou usar, e não quero ter que fazer a carga total toda vez que quiser consultar um torrent antigo. Proponha uma forma eficiente de armazenar uma cópia desses dados do qbittorrent.

> Bom, pode usar um jsonl/ndjson em vez de json puro para armazenar o índice (antes do gzip). Prefiro carga só manual. Pode fazer.

## Por que não `sync/maindata` com `rid` gravado

- O qBittorrent guarda o `rid` por sessão, e a sessão expira 1h depois do último uso.
- Como o app não fica aberto o tempo todo, na próxima abertura o qBittorrent mandaria a lista completa de novo (~20s, mais de 60 MB) mesmo com o `rid` gravado.
- A primeira versão (cópia só em memória, sincronizada por `rid`) foi substituída pelo índice abaixo.

## O que foi implementado

**Backend**
- [qbittorrentIndexService.ts](../../src/backend/services/qbittorrentIndexService.ts) (novo):
  - **Índice em disco:** `data/qbittorrent-index.jsonl.gz`, NDJSON com gzip, gravado e lido como stream, linha a linha.
    - Primeira linha: `{"version":1,"fullSyncAt":"…","newTorrentsCheckedAt":"…"}`.
    - Depois, uma linha por torrent: `["<hash>","<content_path>","<name>","<id do Nyaa>"|null,<added_on>,<size>]`. Só campos que quase nunca mudam.
    - A gravação é atômica (arquivo `.tmp` + rename) e só acontece quando algo mudou.
    - Um índice por `content_path` normalizado (minúsculas, `/`) aponta para o hash. Num torrent de um arquivo só, o `content_path` é o próprio arquivo.
  - **Ao iniciar:** o backend carrega o índice. Se o arquivo estiver danificado, o índice começa vazio e o app sobe mesmo assim.
  - **Torrents novos:** `torrents/info?sort=added_on&reverse=true&limit=200&offset=…`, página a página, parando no primeiro hash já conhecido.
    - Roda em segundo plano ao iniciar, e ao abrir uma lista quando algum arquivo não está no índice. No máximo a cada 5 minutos.
    - Não roda enquanto o índice estiver vazio.
  - **Dados ao vivo:** estado, progresso, ratio, seeders, leechers e tags vêm de `torrents/info?hashes=a|b|…`, só para os torrents da lista aberta. Eles não são gravados. A mesma chamada corrige o índice:
    - um hash que não volta é um torrent removido;
    - um `content_path` diferente é um torrent movido.
  - **Carga total:** só manual, por `POST /api/qbittorrent/index/rebuild`, que baixa `torrents/info` completo e substitui o índice.
  - As atualizações do índice rodam uma de cada vez, então o rebuild nunca se mistura com a checagem de torrents novos.
- [qbittorrentService.ts](../../src/backend/services/qbittorrentService.ts):
  - `getQbittorrentJson`: GET genérico que faz login uma vez se a sessão faltar ou expirar. A busca do 409 passou a usar esse helper.
  - **Cookie de sessão:** esta versão do qBittorrent (WebAPI 2.15.1) chama o cookie de `QBT_SID_6055`, não de `SID`. O padrão aceito agora é `SID` ou `QBT_SID_<porta>`, tanto no login quanto em qualquer resposta. A sessão é reaproveitada em vez de abrir uma nova a cada requisição.
- [watchTargetFilesService.ts](../../src/backend/services/watchTargetFilesService.ts): `attachQbittorrentTorrents` cuida só dos arquivos sem histórico:
  - acha o torrent no índice (checando torrents novos antes, se algum arquivo não estiver nele);
  - busca os dados ao vivo;
  - se o qBittorrent não responder, usa os dados do índice, marcados `live: false`.
- [server.ts](../../src/backend/server.ts):
  - A resposta de `/api/watchlist/target-files` traz `qbittorrentIndex` (número de torrents e datas) e `qbittorrentError`.
  - Nova rota de rebuild.
  - O índice é carregado ao iniciar, e a checagem de torrents novos roda em segundo plano.

**Frontend** ([WatchTargetFileList.tsx](../../src/frontend/components/ui/WatchTargetFileList.tsx))
- **Com o qBittorrent respondendo:** etiqueta **qBittorrent**, estado e progresso, o botão `🔍 #id` do Nyaa (que abre o modal), as datas em que foi adicionado e concluído, ratio, seeders, leechers e tags.
- **Com o qBittorrent fechado:** "offline (from the local index)", com nome, ID do Nyaa, data em que foi adicionado e tamanho.
- **Arquivo que não está nem no histórico nem no índice:**
  - "The qBittorrent index is not built yet." com o botão **Build qBittorrent index**; ou
  - "N file(s) not in the qBittorrent index (… torrents, full load <data>)" com o botão **Rebuild qBittorrent index**.
  - Durante a carga, o botão mostra "Loading the whole qBittorrent list…", e a lista é recarregada no fim.

## Antes / Depois

- **Antes (primeira versão, só em memória):** cada vez que o app era aberto, a lista inteira era baixada de novo (~20s, mais de 60 MB).
- **Depois:**
  - A carga total acontece uma vez, pelo botão.
  - Nas aberturas seguintes, o índice carrega do disco em ~0,3s. Os torrents novos chegam em segundo plano (~4,5s, uma página), e cada lista busca ao vivo só os torrents dela.

## Como foi testado

- **Automatizado:**
  - `npm test`: 242 passando, 0 falhas.
  - `npm run typecheck`: sem erros.
  - `npm run build`: build concluído.
- **Com o qBittorrent real (27.127 torrents):**
  - Sem índice: a lista responde em 0,09s, sem acessar a rede, e mostra "not built yet" com o botão.
  - **Build pelo botão, no Chrome:** 17,5s. Em seguida, os 12 arquivos HIDIVE de `aiomodarkelf [480p]` aparecem com `stalledUP · 100%`, `#1956750` etc.
  - **Arquivo gerado:** 2,15 MB (7,76 MB de NDJSON antes do gzip), com 27.128 linhas (cabeçalho + torrents).
  - **Carga do índice do disco:** 293 ms.
  - **Checagem de torrents novos:** 4,5s sem novidades. Simulando 3 torrents adicionados com o app fechado: 5,1s, e os 3 foram adicionados.
  - **Reinício do backend:** a primeira lista depois de subir voltou em 0,16s com dados ao vivo, sem carga total.

## Testes criados/alterados

- [src/backend/services/qbittorrentIndexService.test.ts](../../src/backend/services/qbittorrentIndexService.test.ts) (novo):
  - Busca por caminho que ignora maiúsculas e o sentido da barra, e acompanha um torrent movido. Gravar os mesmos dados de novo não marca mudança.
  - Formato em disco (gzip + NDJSON: cabeçalho + uma linha por torrent) e a leitura de volta.
  - Arquivo ausente dá índice vazio; arquivo danificado dá erro.
  - `fetchNewTorrents` pagina do mais novo para o mais antigo e para no primeiro hash conhecido.
  - `applyLiveTorrents` remove os torrents que sumiram e registra os movidos.
- [src/backend/services/watchTargetFilesService.test.ts](../../src/backend/services/watchTargetFilesService.test.ts) (`attachQbittorrentTorrents`):
  - Só os arquivos sem histórico usam o índice. Torrents novos são checados quando falta algum arquivo, e só os hashes encontrados vão ao vivo.
  - Com o qBittorrent offline, o arquivo recebe os dados do índice com `live: false`.
  - Um torrent removido no qBittorrent deixa o arquivo sem dados do qBittorrent.
