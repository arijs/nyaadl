## Plan: NYAADL Node Web Automation (Refined with Real Data)

Migrar o projeto para Node.js + TypeScript strict com backend h3 e frontend Vite/Solid/Tailwind, mantendo o CLI legado em paralelo. O fluxo deve usar watchlist por pastas existentes, scraping HTTP+cheerio no Nyaa, decisão automática/manual e persistência mínima em JSON.

## Key Refinements from Real Data

1. Matching não pode depender apenas de nome literal da pasta.
- No destino real existem pastas abreviadas (ex.: "[Erai-raws] kanteishi [720p]") enquanto o Nyaa usa nome longo (ex.: "Saikyou no Shokugyou ... Kanteishi ... [720p]").
- Portanto, o sistema precisa de camada de alias/canonicalização para série base.

2. Resoluções válidas não são só 480p/720p/1080p.
- Existem itens 540p (AMZN), então resolução deve ser extraída por regex generativa ([0-9]{3,4}p), sem enum fixa.

3. Mesmo série+resolução pode ter múltiplas origens (CR/ADN/HIDIVE/AMZN/NF).
- Exemplo real: "Isekai Nonbiri Nouka 2 [480p]" coexistindo com ADN e HIDIVE.
- Como regra funcional é por série+resolução, provider não deve bloquear auto-download.

4. Parser do Nyaa precisa ignorar link de comentários.
- Na coluna de nome pode haver anchor "#comments" antes do anchor principal de /view/{id}.
- A extração deve selecionar o anchor com href /^\/view\/\d+$/ (sem #comments).

5. ID do torrent deve ser chave primária de deduplicação/checkpoint.
- Extrair de /download/{id}.torrent e usar em last_processed + decisões já aplicadas.

6. O nome interno do vídeo dentro do .torrent também é uma fonte de matching.
- Alguns torrents têm título completo na página, mas o arquivo de vídeo interno usa nome abreviado.
- O sistema deve baixar o .torrent em memória, decodificar o metainfo e extrair o nome dos arquivos internos.
- O matching deve considerar dois nomes por item: o título da página do Nyaa e o nome do arquivo de vídeo dentro do torrent.
- As pastas observadas devem ser comparadas contra ambos os nomes para aumentar a taxa de auto-download e detectar aliases reais de release.

## Architecture

1. Backend
- h3 server com rotas REST.
- Serviços isolados: scan, scraper, classifier, downloader, storage.

2. Frontend
- Vite + Solid + Tailwind.
- Dashboard com visão global e fila de pendentes (aprovar/blacklist/pular).

3. Persistência JSON (mínima)
- data/folders-config.json (começa vazio e é editado pela UI/API)
- data/blacklist.json
- data/last_processed.json
- data/bootstrap-discovery.json
- data/pending.json
- data/decisions.json
- data/aliases.json (novo, para abreviações/canonicalização)
- data/qbittorrent-failures.json (fila de falhas de envio para qBittorrent)
- data/qbittorrent-submitted.json (controle de torrents já submetidos ao qBittorrent)

## qBittorrent Integration (HTTP API Direct)

1. Estratégia de integração
- Sem Playwright para upload: usar API HTTP nativa do qBittorrent.
- Endpoint principal: POST /api/v2/torrents/add.
- Host fixo inicial: http://localhost:7055, com possibilidade de ajuste em runtime via frontend.

2. Payload de upload
- Envio multipart/form-data com fileselect[], savepath e stopped=true.
- Novos torrents entram pausados (stopped) e não iniciam download automaticamente.

3. Fluxos cobertos
- Aprovação manual de pendentes.
- Auto-download no scrape normal.
- Auto-download no bootstrap discovery.

4. Falhas e recuperação
- Se o envio ao qBittorrent falhar, o item entra em fila de falhas persistida.
- O sistema expõe retry do mesmo item (reusando o mesmo .torrent local e a mesma pasta alvo).
- O sistema expõe supressão por item ("não adicionar torrent na fila") para concluir sem nova tentativa.
- Timeout/host indisponível devem orientar o usuário a verificar se o qBittorrent está em execução e permitir alterar a base URL.

5. Estado de submissão
- Torrent processado não é considerado "submetido" só por existir em decisions.
- A marca de submissão é persistida separadamente em qbittorrent-submitted.
- Isso evita pular itens históricos que ainda não foram realmente enviados ao qBittorrent.

## Data Model (Essential)

1. TorrentItem
- torrentId: string
- title: string
- viewUrl: string
- downloadUrl: string
- page: number
- publishedAtUtc?: string
- sizeText?: string
- seeders?: number
- leechers?: number
- downloads?: number
- seriesBaseRaw: string
- resolution: string

2. WatchTarget
- folderName: string
- folderPath: string
- seriesKey: string
- resolution: string
- normalizedKey: string (seriesKey + resolution)

3. DecisionStatus
- auto_downloaded | blocked | pending | approved | skipped

4. LastProcessed
- lastTorrentId?: string
- lastSeenPage?: number
- lastRunAt: string
- bootstrapMode: assisted | checkpoint

## Matching Strategy (Critical)

1. Normalização textual
- lowercase
- remover prefixo [Erai-raws]
- remover episódio " - XX"
- remover bloco final hash [XXXXXXXX]
- manter resolução separada
- remover duplicidade de espaços

2. Derivação de série base
- De título torrent: extrair trecho entre prefixo e " - episodio".
- De pasta observada: extrair série de "[Erai-raws] Nome [res]".

3. Canonical key
- seriesKey = aliasMap[nomeNormalizado] ?? nomeNormalizado
- normalizedKey = `${seriesKey}::${resolution}`

4. Auto-download
- Se normalizedKey do torrent existir na watchlist atual => auto_downloaded.

5. Blacklist (decisão já definida)
- Blacklist por série base (sem resolução), como você escolheu.
- Se seriesKey estiver na blacklist => blocked.

6. Pendente
- Não está na watchlist e não está na blacklist => pending.

7. Matching dual-source para watchlist
- Para cada torrent, gerar candidatos de nome a partir de:
	- título completo da página do Nyaa
	- nome do arquivo de vídeo dentro do torrent
- Se qualquer candidato canonicalizado casar com uma pasta observada da mesma resolução, classificar como auto_downloaded.
- Se nenhum candidato casar e a série base estiver na blacklist, classificar como blocked.
- Se nenhum candidato casar e não estiver na blacklist, classificar como pending.

4. Gestão de roots
- `data/folders-config.json` inicia com `folders: []`.
- O dashboard deve permitir adicionar e remover roots manualmente.
- O backend deve persistir as mudanças imediatamente e refletir os roots atuais em `/api/status`.

5. Verificação de duplicidade local antes do auto-download
- Quando um torrent casar com uma pasta observada, o sistema deve verificar se o mesmo episódio e a mesma origem já existem localmente.
- A confirmação final deve comparar também nome do arquivo e tamanho do arquivo contra o metainfo do `.torrent`.
- A extração de origem deve normalizar providers reais como ADN, HIDIVE, CR, NF, AMZN e variações conhecidas.
- Se nome e tamanho baterem, o item deve ser tratado como `already_downloaded` em vez de baixar novamente.
- Se episódio/origem já existirem mas nome ou tamanho divergirem, o item deve ir para `pending` com motivo de conflito local.

## Nyaa Scraping Strategy (HTTP + Cheerio)

1. URL base
- https://nyaa.si/?f=0&c=1_2&q=Erai-raws+-HEVC&p={page}

2. Extração por linha
- tabela: table.torrent-list > tbody > tr
- view link: a[href^="/view/"] que não contenha #comments
- torrent link: a[href^="/download/"][href$=".torrent"]
- data: td[data-timestamp]
- size/seeders/leechers/downloads por índice de coluna

3. Ordem de processamento
- Sempre aplicar lógica em ordem antiga -> nova.
- Com checkpoint: descobrir janela nova e processar nessa ordem.
- Sem checkpoint (modo assistido): UI pergunta por página carregada se deve carregar próxima; após definir limite N, processar N -> 1.

## Download Strategy

1. Download via fetch/undici (sem Playwright).
2. Filename por prioridade:
- Content-Disposition filename
- fallback: título sanitizado + .torrent
3. Salvar em torrents/page-YYYY-MM-DD-N/.
4. Salvar snapshot por página:
- torrents/page-YYYY-MM-DD-N/snapshot.html
- torrents/page-YYYY-MM-DD-N/snapshot.json
5. Ler o metainfo do .torrent em memória e extrair o nome do(s) arquivo(s) de vídeo para alimentar aliases e matching.

## API Endpoints (h3)

1. GET /api/status
- estado atual, contadores, checkpoint.

2. POST /api/watchlist/scan
- escaneia pastas observadas e atualiza targets em memória.

3. POST /api/scrape/run
- inicia ciclo de scrape/classificação.

4. GET /api/torrents
- lista itens com filtros por status/page/date.

5. GET /api/pending
- fila pendente.

6. POST /api/pending/:id/approve
- baixa .torrent e marca aprovado.

7. POST /api/pending/:id/blacklist
- adiciona série base à blacklist e reclassifica.

8. POST /api/pending/:id/skip
- marca skip apenas para ocorrência atual.

9. POST /api/bootstrap/next-page
- modo assistido sem checkpoint: decide continuar ou encerrar descoberta.

10. POST /api/bootstrap/discover-last-downloaded
- sem body: inicia em `page=1` e `itemIndex=0`
- com body `{ page, itemIndex, cursorToken }`: continua de um cursor retornado anteriormente

- processa uma janela incremental por chamada, avançando item a item até atingir uma condição de parada:
	- salva snapshot da página atual
	- auto-processa blacklist e title-match
	- só baixa `.torrent` em memória quando title-match falhar
	- acumula listas de `autoApproved`, `autoRejected`, `alreadyDownloaded` e `backfilled`
	- para ao encontrar o primeiro item `pending` (manual review), retornando esse item em `actionItem`
	- se não houver pendente até o fim da página, retorna `mode=page_completed` e cursor para a próxima página
- retorna cursor atual e próximo cursor para continuidade controlada pelo frontend
- valida `cursorToken` para detectar cursor obsoleto quando continuar na mesma página
- para itens já processados mas ainda não submetidos ao qBittorrent, tenta backfill reutilizando o .torrent já salvo localmente

## Bootstrap Discovery Item-by-item Flow (Current)

1. Entrada e cursor
- Cada chamada usa `{ page, itemIndex, cursorToken }` para continuar exatamente de onde parou.
- O backend valida `cursorToken` quando continua na mesma página para evitar cursor obsoleto.

2. Passo rápido por item
- Ignora itens já decididos (`decisions`) ou já pendentes (`pending`).
- Aplica checagem rápida de blacklist por chave série+resolução.
- Tenta match por título/aliases sem abrir metainfo quando possível.

3. Classificação automática detalhada
- Se necessário, baixa o `.torrent` em memória e extrai nomes internos de vídeo.
- Classifica cada item em `auto_downloaded`, `blocked`, `already_downloaded` ou `pending`.

4. Acumulação de resultado da chamada
- `auto_downloaded` entra em `autoApproved`.
- `blocked` entra em `autoRejected`.
- `already_downloaded` entra em `alreadyDownloaded`.
- `backfilled` entra em `backfilled` (itens antigos já processados que foram finalmente submetidos ao qBittorrent nesta chamada).
- `pending` interrompe a chamada e retorna `actionItem` para revisão manual.

5. Condições de parada
- Parada por manual review: encontrou um `pending`.
- Parada por fim de página: varreu tudo sem pendente e retorna `nextPage`.

6. Comportamento no frontend
- Exibe `actionItem` normalmente quando houver pendente.
- Exibe sempre os blocos automáticos da chamada (`Auto approved`, `Auto rejected`, `Already downloaded`, `Backfilled`).
- Cada bloco usa preview de 5 itens e botão `Show all`.
- Em caso de falha de envio ao qBittorrent, exibe painel de recuperação com:
	- lista de falhas pendentes
	- campos de base URL, usuário e senha
	- ação de retry do mesmo torrent
	- ação de supressão (não adicionar torrent na fila)
- Usuário clica em `Continue discovery` para continuar no cursor retornado.

## Frontend Dashboard

1. Blocos principais
- Status de execução
- Contadores por status
- Lista geral (auto/blocked/pending/approved/skipped)
- Fila de pendentes com ações

2. Ações rápidas por item pendente
- Aprovar
- Blacklistar série
- Pular ocorrência

3. Informações úteis na lista
- título
- série base + resolução detectada
- página
- data UTC
- seed/leech/downloads

## Phased Implementation

1. Fundação Node + scripts npm + estrutura backend/frontend.
2. Storage JSON + tipos compartilhados + scan de watchlist.
3. Parser/normalização/aliases + classificador.
4. Scraper paginado + checkpoint + bootstrap assistido.
5. Downloader + gravação snapshots + inspeção do metainfo do .torrent.
6. API h3 completa.
7. UI Solid/Tailwind.
8. Testes de fluxo real no Windows.

## Validation Checklist

1. Pasta abreviada (ex.: kanteishi) casa com título longo do Nyaa via aliases.
2. Item 540p é detectado e classificado corretamente.
3. Item com comments link não quebra parser do título principal.
4. Torrent ID evita duplicação entre execuções.
5. Blacklist por série bloqueia todas resoluções dessa série.
6. Sem checkpoint, bootstrap assistido controla corretamente até a página-limite.
7. Processamento final acontece em ordem antiga -> nova.
8. Download usa filename de Content-Disposition quando disponível.
9. Nome abreviado dentro do .torrent também casa com a pasta observada quando o título da página não bater literalmente.
10. Bootstrap autônomo encontra o último episódio realmente baixado comparando episódio, origem, nome e tamanho com a biblioteca local.
11. Resultado do bootstrap autônomo persiste em arquivo para sobreviver a reinícios.
12. Bootstrap incremental retorna apenas um item manual por chamada e fornece `nextPage/nextItemIndex` para continuidade.

## Decisions Confirmed

1. Manter CLI legado junto da nova arquitetura web/API.
2. Blacklist por série base.
3. Primeira execução sem checkpoint em modo assistido por página.
4. Salvar .torrent em torrents/page-YYYY-MM-DD-N/ dentro do projeto.
5. Antes do auto-download, verificar duplicidade local por episódio + origem + nome + tamanho.