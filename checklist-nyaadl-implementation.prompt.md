## Plan: NYAADL Node Web Automation

Migrar o projeto para uma arquitetura Node.js + TypeScript strict com backend h3 e frontend Vite/Solid/Tailwind, mantendo o CLI legado em paralelo, para automatizar scraping, decisão e download de torrents com persistência mínima em JSON. O fluxo principal será: carregar watchlist por scan de pastas observadas, coletar páginas do Nyaa do antigo para o novo com checkpoint, decidir automaticamente por correspondência exata de pasta, e enviar o restante para aprovação manual via dashboard.

## Execution Order

1. Base do projeto e contratos compartilhados.
2. Persistência JSON e scan da watchlist.
3. Normalização, aliases e matching com nome da página + nome interno do torrent.
4. Scraper Nyaa com checkpoint e bootstrap assistido.
5. Classificador, downloader e gravação de snapshots.
6. API h3.
7. Dashboard Solid/Tailwind.
8. Validação em dados reais e documentação.

## Module-by-Module File Order

1. src/shared/
2. src/backend/storage/
3. src/backend/services/normalizeService.ts
4. src/backend/services/watchlistService.ts
5. src/backend/services/nyaaClient.ts e src/backend/services/nyaaParser.ts
6. src/backend/services/checkpointService.ts
7. src/backend/services/classifierService.ts
8. src/backend/services/downloaderService.ts
9. src/backend/server.ts e src/backend/routes/
10. src/frontend/
11. data/
12. README.md

**Steps**
1. Fase 1 - Fundação do monorepo app web (bloqueante para as demais fases)
1.1 Definir estrutura com backend e frontend separados em src/backend e src/frontend, mantendo index.ts legado sem quebra.
1.2 Atualizar package manager para npm e scripts de desenvolvimento/build/start para backend h3 e frontend Vite.
1.3 Ajustar TypeScript strict para Node (tipos Node, paths compartilhados para tipos comuns).
1.4 Definir contrato de dados compartilhado (tipos): TorrentItem, DecisionStatus, PendingItem, AppState, BlacklistEntry, WatchTarget.
2. Fase 2 - Persistência JSON e serviços base (depende da Fase 1)
2.1 Criar camada de storage JSON com leitura/escrita atômica para data/folders-config.json, data/last_processed.json, data/blacklist.json e filas pendentes.
2.2 Definir schema lógico de last_processed: último torrent conhecido, última página processada, data da execução e modo de bootstrap inicial.
2.3 Implementar serviço de scan de watchlist: ler pastas observadas de folders-config.json, listar apenas subpastas de primeiro nível, normalizar nomes e manter cada pasta como alvo independente.
2.4 Implementar utilitários de normalização e matching: igualdade exata para alvo série+resolução; extração de série base para regra de blacklist por série.
3. Fase 3 - Scraper Nyaa com continuidade (depende da Fase 2)
3.1 Implementar cliente HTTP (fetch/undici) para páginas Nyaa sem Playwright.
3.2 Implementar parser cheerio para extrair por linha da tabela: título completo, link .torrent, link view, timestamp (quando disponível), e id do torrent.
3.3 Implementar estratégia de paginação antigo→novo: descobrir limite navegável e processar do mais antigo ao mais novo; na ausência de last_processed, habilitar modo assistido via UI por página (carregar próxima ou parar).
3.4 Implementar checkpoint de retomada: ao reencontrar o último torrent conhecido, interromper coleta histórica e processar somente novos itens.
3.5 Persistir snapshot por página em torrents/page-YYYY-MM-DD-N/ como diretório da página, agrupando snapshot e .torrent baixados por data e número da página.
4. Fase 4 - Motor de decisão e download (depende da Fase 3; 4.3 pode rodar em paralelo com início da Fase 5)
4.1 Classificar cada torrent em automático, bloqueado ou pendente.
4.2 Regras: match exato com watch target => download automático; série base em blacklist => bloqueado; demais => pendente.
4.3 Implementar downloader .torrent via HTTP com resolução de nome por Content-Disposition (fallback para nome sanitizado do título).
4.4 Salvar .torrent em torrents/page-YYYY-MM-DD-N/ do projeto e registrar decisão persistida para idempotência.
4.5 Atualizar last_processed no fim de ciclos consistentes para garantir retomada segura.
5. Fase 5 - API h3 e dashboard web (depende da Fase 2; integra com Fases 3 e 4)
5.1 Backend h3: endpoints para iniciar varredura, listar torrents por status, listar pendentes, aprovar, blacklistar e pular.
5.2 Endpoints de ação pendente: Aprovar => baixa torrent e marca aprovado; Blacklist => inclui série base na blacklist e reclassifica; Pular => ignora só item atual.
5.3 Frontend Vite+Solid+Tailwind: dashboard com visão geral, filtros por status, e ações de pendentes em um clique.
5.4 Exibir estado de execução (em progresso/parado), página atual, último checkpoint e contadores por status.
6. Fase 6 - Compatibilidade Windows e validação final (depende das Fases 3, 4 e 5)
6.1 Garantir compatibilidade com caminhos Windows (Q:\...) e tratamento robusto de permissões/path separators.
6.2 Testes de fluxo ponta a ponta com dados reais: primeira execução sem checkpoint, retomada com checkpoint, blacklist por série base e aprovação manual.
6.3 Documentar operação no README: configuração de data/folders-config.json, ciclo de scrape, uso do dashboard e recovery de estado.

**Relevant files**
- /d:/dev/github/nyaadl/package.json — migrar scripts/deps para Node + h3 + Vite + Solid + Tailwind mantendo execução do legado.
- /d:/dev/github/nyaadl/tsconfig.json — manter strict e ajustar ambiente Node/frontend compartilhado.
- /d:/dev/github/nyaadl/index.ts — manter como CLI legado (escopo de convivência, sem remoção inicial).
- /d:/dev/github/nyaadl/README.md — atualizar instruções de execução/configuração.
- /d:/dev/github/nyaadl/data/folders-config.json — fonte de diretórios observados.
- /d:/dev/github/nyaadl/data/last_processed.json — checkpoint de continuidade.
- /d:/dev/github/nyaadl/data/blacklist.json — blacklist por série base.

**Verification**
1. Validar scan da watchlist com diretório de temporada real no Windows e confirmar captura apenas de subpastas de primeiro nível.
2. Executar scrape assistido sem last_processed e confirmar prompts por página no dashboard até parada manual.
3. Executar nova varredura com last_processed presente e confirmar retomada sem reprocessar histórico inteiro.
4. Validar classificação de exemplo real: match exato => automático; série base blacklisted => bloqueado; caso novo => pendente.
5. Aprovar um pendente no dashboard e confirmar download do .torrent em torrents/ com nome correto via Content-Disposition.
6. Acionar blacklist em pendente e confirmar persistência em data/blacklist.json e ausência em execuções seguintes.
7. Acionar pular e confirmar que o item é ignorado somente nesta ocorrência.
8. Testar reinício do servidor e confirmar consistência dos JSONs (fila pendente, decisões e last_processed).

**Decisions**
- Manter CLI legado junto com a nova arquitetura web/API (sem substituição imediata).
- Blacklist por série base (não por série+resolução).
- Primeira execução sem checkpoint em modo assistido por página (decisão do usuário a cada avanço).
- Download salvo em torrents/ dentro do projeto.

**Further Considerations**
1. Definir se a chave de deduplicação será torrent id do Nyaa ou hash do título+data; recomendação: usar torrent id do link /download/{id}.torrent.
2. Definir limite de retry para falhas HTTP (ex.: 3 tentativas com backoff curto) para evitar bloqueios por falha transitória.
3. Definir tamanho máximo da fila pendente por execução para manter UI responsiva em varreduras longas.


## NYAADL Implementation Checklist

## 1) Foundation (Node + TS + Structure)

- [x] Escrever novo projeto usando APIs Node.js que possam executar em runtimes compatíveis, como Bun.
- [x] Atualizar dependências para backend h3 + scraper cheerio + frontend Vite/Solid/Tailwind.
- [x] Definir scripts npm para dev/build/start (backend e frontend).
- [x] Garantir TypeScript strict para backend e frontend.
- [x] Criar estrutura base:
  - [x] src/backend
  - [x] src/frontend
  - [x] src/shared
  - [x] data

## 2) Shared Types and Contracts

- [x] Criar tipos compartilhados em src/shared/types.ts:
  - [x] TorrentItem
  - [x] WatchTarget
  - [x] DecisionStatus
  - [x] PendingItem
  - [x] LastProcessed
  - [x] AppStatus
- [x] Criar tipos de resposta para API em src/shared/api.ts.

## 3) JSON Persistence Layer

- [x] Criar utilitário de leitura/escrita JSON atômica em src/backend/storage/jsonStore.ts.
- [x] Inicializar arquivos de dados quando não existirem:
  - [x] data/folders-config.json
  - [x] data/blacklist.json
  - [x] data/last_processed.json
  - [x] data/bootstrap-discovery.json
  - [x] data/pending.json
  - [x] data/decisions.json
  - [x] data/aliases.json
  - [x] data/qbittorrent-failures.json
  - [x] data/qbittorrent-submitted.json
- [x] Implementar validação de schema mínima por arquivo.

## 4) Watchlist Scan (Windows-first)

- [x] Criar serviço src/backend/services/watchlistService.ts.
- [x] Ler pastas observadas de data/folders-config.json.
- [x] Listar apenas subpastas de primeiro nível (não recursivo).
- [x] Construir WatchTarget por pasta (sem agrupar por série).
- [x] Extrair resolução por regex [0-9]{3,4}p (incluindo 540p).
- [x] Gerar seriesKey com normalização + aliases.

## 5) Normalization, Alias, Matching

- [x] Criar src/backend/services/normalizeService.ts com regras:
  - [x] lowercase
  - [x] remover prefixo [Erai-raws]
  - [x] remover sufixo hash [XXXXXXXX]
  - [x] normalizar espaços
- [x] Extrair série base de torrent e de pasta.
- [x] Aplicar aliases de data/aliases.json para canonical key.
- [x] Gerar normalizedKey: seriesKey::resolution.
- [x] Normalizar providers reais na extração de origem local (ADN, HIDIVE, CR, NF, AMZN e similares).

## 6) Dual-Source Matching (Nyaa + Torrent Interno)

- [x] Baixar o .torrent em memória antes da decisão final.
- [x] Decodificar o metainfo do .torrent para extrair o nome do(s) arquivo(s) de vídeo.
- [x] Usar dois candidatos de matching por item:
  - [x] título completo da página do Nyaa
  - [x] nome do arquivo interno do vídeo dentro do torrent
- [x] Canonicalizar ambos os nomes antes da comparação com a watchlist.
- [x] Considerar auto-download quando qualquer um dos dois nomes casar com a pasta observada da mesma resolução.
- [x] Registrar aliases reais descobertos a partir do nome interno do torrent.

## 7) Nyaa Scraper (HTTP + Cheerio)

- [x] Criar src/backend/services/nyaaClient.ts para fetch de páginas.
- [x] Criar src/backend/services/nyaaParser.ts para parse HTML da tabela torrent-list.
- [x] Extrair por item:
  - [x] torrentId (de /download/{id}.torrent)
  - [x] title
  - [x] viewUrl
  - [x] downloadUrl
  - [x] size
  - [x] data UTC (data-timestamp)
  - [x] seeders/leechers/downloads
- [x] Ignorar link de comentários (#comments) e usar apenas /view/{id} principal.
- [x] Salvar snapshot por página:
  - [x] torrents/page-YYYY-MM-DD-N/ (diretório por página e data)
  - [x] snapshot.html e snapshot.json dentro do diretório da página

## 8) Continuity and Bootstrap

- [x] Criar src/backend/services/checkpointService.ts.
- [x] Implementar retomada por last_processed.json usando torrentId.
- [x] Implementar modo assistido quando não houver checkpoint:
  - [x] carregar página atual
  - [x] aguardar decisão para carregar próxima
  - [x] marcar página limite
- [x] Processar itens sempre na ordem antiga -> nova.

## 9) Classification Engine

- [x] Criar src/backend/services/classifierService.ts.
- [x] Regras:
  - [x] se normalizedKey existe na watchlist => auto_downloaded
  - [x] se normalizedKey existe na watchlist mas episódio+origem+nome+tamanho já existem localmente => already_downloaded
  - [x] se normalizedKey existe na watchlist mas há conflito local de episódio/origem com nome ou tamanho divergente => pending
  - [x] se seriesKey em blacklist => blocked
  - [x] senão => pending
- [x] Evitar duplicação por torrentId já decidido.

## 10) Downloader

- [x] Criar src/backend/services/downloaderService.ts.
- [x] Fazer download .torrent com HTTP simples.
- [x] Resolver filename por Content-Disposition quando disponível.
- [x] Fallback para título sanitizado + .torrent.
- [x] Salvar em torrents/page-YYYY-MM-DD-N/.
- [x] Atualizar decisions.json após sucesso.

## 11) h3 API

- [x] Criar src/backend/server.ts.
- [x] Criar rotas em src/backend/routes:
  - [x] GET /api/status
  - [x] POST /api/watchlist/scan
  - [x] POST /api/scrape/run
  - [x] GET /api/torrents
  - [x] GET /api/pending
  - [x] POST /api/pending/:id/approve
  - [x] POST /api/pending/:id/blacklist
  - [x] POST /api/pending/:id/skip
  - [x] POST /api/bootstrap/next-page
  - [x] POST /api/bootstrap/discover-last-downloaded
- [x] Retornos JSON tipados e consistentes.
- [x] Bootstrap discovery incremental com cursor:
  - [x] inicia sem parâmetros em página 1, item 0
  - [x] aceita `{ page, itemIndex, cursorToken }` para continuar
  - [x] continua varrendo até encontrar um pendente ou terminar a página
  - [x] retorna no máximo um item manual por chamada (`actionItem`)
  - [x] acumula por chamada os itens `autoApproved`, `autoRejected` e `alreadyDownloaded`
  - [x] acumula por chamada a lista `backfilled` para reenvios históricos ao qBittorrent
  - [x] não interrompe mais no primeiro `already_downloaded`
  - [x] em fim de página sem pendente retorna cursor para próxima página
  - [x] retorna cursor atual e próximo cursor
  - [x] detecta cursor obsoleto com `cursorToken` quando continuar na mesma página
  - [x] frontend reseta automaticamente para item 0 em cursor obsoleto e oferece retry da página

## 11.1) qBittorrent API Integration and Recovery

- [x] Integrar envio direto ao qBittorrent via HTTP API (`/api/v2/torrents/add`) sem Playwright.
- [x] Enviar torrents em `multipart/form-data` com `fileselect[]`, `savepath` e `stopped=true`.
- [x] Adicionar torrents ao qBittorrent em modo parado (sem iniciar download automático).
- [x] Cobrir envio ao qBittorrent em:
  - [x] aprovação manual (`/api/pending/:id/approve`)
  - [x] auto-download no scrape
  - [x] auto-download no bootstrap discovery
- [x] Persistir fila de falhas de envio (`qbittorrent-failures.json`) com dados suficientes para retry do mesmo item.
- [x] Persistir marca de itens já submetidos (`qbittorrent-submitted.json`) para diferenciar "processado" de "submetido".
- [x] Criar endpoint para atualizar base URL/credenciais do qBittorrent em runtime.
- [x] Criar endpoint para retry de falha de envio por torrent.
- [x] Criar endpoint de supressão (`não adicionar torrent na fila`) por torrent.
- [x] Em erro de timeout/host indisponível, devolver mensagem orientando checagem do qBittorrent e ajuste da base URL.
- [x] Implementar backfill no discovery para itens já processados mas ainda não submetidos ao qBittorrent.

## 12) Frontend Dashboard (Vite + Solid + Tailwind)

- [x] Criar app frontend base em src/frontend.
- [x] Configurar Tailwind e tema simples funcional.
- [x] Implementar telas:
  - [x] status geral
  - [x] lista de torrents com filtros por status
  - [x] fila pendente com ações
- [x] Implementar ações dos pendentes:
  - [x] aprovar
  - [x] blacklistar série
  - [x] pular ocorrência
- [x] Mostrar metadados úteis (page, data UTC, seed/leech/downloads).
- [x] Expor ação de bootstrap autônomo para descobrir o último episódio realmente baixado.
- [x] Exibir resultado do bootstrap autônomo no dashboard.
- [x] Exibir bloco dedicado de `Already downloaded` no resumo do bootstrap (fundo azul).
- [x] Exibir preview de 5 itens por bloco (`Auto approved`, `Auto rejected`, `Already downloaded`) com toggle `Show all`.
- [x] Exibir bloco dedicado de `Backfilled` no resumo do bootstrap (fundo cinza).
- [x] Exibir preview de 5 itens no bloco `Backfilled` com toggle `Show all`.
- [x] Exibir painel de recuperação de qBittorrent com:
  - [x] lista de falhas pendentes
  - [x] campos de base URL, usuário e senha
  - [x] botão de retry do mesmo torrent
  - [x] botão `Nao adicionar torrent na fila`

## 13) Config and Data Files

- [x] Criar templates iniciais:
  - [x] data/folders-config.json com array vazio em `folders`
  - [x] data/blacklist.json como array vazio
  - [x] data/last_processed.json com bootstrapMode assisted
  - [x] data/pending.json vazio
  - [x] data/decisions.json vazio
  - [x] data/aliases.json com exemplos reais (ex.: kanteishi -> nome canônico)
 - [x] Gerenciar roots manualmente pelo frontend e backend:
  - [x] adicionar pasta observada
  - [x] remover pasta observada
  - [x] refletir roots atuais em /api/status

## 14) Validation (Real-World)

- [ ] Validar scan de watchlist com _listing real da temporada.
- [ ] Validar matching abreviado vs nome longo do Nyaa (aliases).
- [ ] Validar item 540p sendo detectado corretamente.
- [ ] Validar parser com linhas contendo comments link.
- [ ] Validar deduplicação por torrentId.
- [ ] Validar matching contra nome interno abreviado extraído do .torrent.
- [ ] Validar blacklist por série base em todas resoluções.
- [ ] Validar modo assistido sem checkpoint.
- [ ] Validar retomada com checkpoint existente.
- [ ] Validar download com filename de Content-Disposition.
- [x] Validar que snapshot e .torrent ficam em torrents/page-YYYY-MM-DD-N/.
- [x] Validar detecção de item já baixado por episódio + origem + nome + tamanho.
- [ ] Validar bootstrap autônomo encontrando checkpoint real na biblioteca local.
- [ ] Validar bootstrap incremental em múltiplas chamadas até avançar para próxima página via cursor.
- [ ] Validar em execução real que `alreadyDownloaded` é acumulado e exibido junto com `pending` na mesma chamada.
- [ ] Validar em execução real que itens históricos já processados, mas não submetidos, entram em `backfilled` quando reenviados ao qBittorrent.
- [ ] Validar em execução real o fluxo de recuperação de falhas do qBittorrent (retry/supressão/ajuste de base URL).

## 15) Docs and Operational Guide

- [x] Atualizar README com:
  - [x] configuração de pastas observadas
  - [x] execução backend/frontend
  - [x] fluxo de bootstrap assistido
  - [x] fluxo de bootstrap autônomo por biblioteca local
  - [x] manutenção de aliases
  - [x] recuperação de estado JSON

## 16) Nice-to-have After MVP

- [x] Retry com backoff para falhas HTTP transitórias.
- [x] Filtro por período na UI.
- [x] Exportar relatório da execução por data.
- [x] Ação de "aprovar todos compatíveis" na fila pendente.