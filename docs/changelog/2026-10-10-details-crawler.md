# Serviço de download dos detalhes (Nyaa / Erai / MAL / AniDB) dos watch targets

## Prompt original

> Agora, quero que faça um serviço que fique rodando pra baixar os dados dos torrents do nyaa, erai, MAL e AniDB, no máximo 1 série a cada 3 segundos. Esse serviço deve ser iniciado manualmente. Quero que ele inicie das pastas mais recentes (cada pasta é uma temporada), e siga buscando os targets em ordem alfabética. Não precisa baixar os detalhes nyaa de todos os vídeos, somente o primeiro arquivo basta. Os controles e relatórios pra isso devem ficar abaixo do bloco Watch targets.

Decisões tomadas com o usuário:
- dados já salvos são pulados (sem refresh);
- a espera de 3s vale só depois de uma série que usou a rede.

## O que foi implementado

**Backend**
- [detailsCrawlerService.ts](../../src/backend/services/detailsCrawlerService.ts) (novo):
  - **Ordem.** `seasonOrder` e `orderCrawlTargets` ordenam os roots pela temporada (`YYYY.N` no nome da pasta), da mais recente para a mais antiga, e os targets de cada root em ordem alfabética. Pastas fora desse padrão ficam no fim.
  - **`crawlTarget`**, para cada target:
    1. **Arquivo:** pega o primeiro arquivo, por episódio, que tiver ID de torrent: do histórico ou do índice local do qBittorrent, sem chamar o qBittorrent.
    2. **Nyaa:** salva os detalhes desse torrent.
    3. **Slug:** lê o slug da erai-raws no link "Information".
    4. **Erai-raws:** salva a página da série.
    5. **MAL e AniDB:** só busca quando a página da Erai tem o link. Sem link, nada é buscado, e a próxima volta também não espera.
    - Dados já salvos são pulados sem rede.
    - Um erro da AniDB fica só no passo dela. Se a AniDB não estiver configurada ou nos banir, ela é desligada pelo resto da execução.
    - Uma sessão expirada da erai-raws é fatal e para o serviço.
  - **`runCrawlLoop`:**
    - Depois de uma série que usou a rede, a próxima só começa 3s depois do início dela.
    - Stop interrompe entre um target e outro.
    - O relatório inclui o estado, o progresso, o target atual, contadores por fonte e resultado, e as últimas 50 entradas.
  - O estado fica só em memória. O serviço é iniciado à mão, e retomar é barato, porque o que já foi salvo passa direto.
- [server.ts](../../src/backend/server.ts): `GET /api/details-crawler`, `POST /api/details-crawler/start` e `POST /api/details-crawler/stop`.
- [watchTargetService.ts](../../src/backend/services/watchTargetService.ts): `getRootMatch` passou a ser exportado.
- [api.ts](../../src/shared/api.ts): tipos `DetailsCrawlerStatus`, `DetailsCrawlerEntry`, `DetailsCrawlerSource` e `DetailsCrawlerStepResult`.

**Frontend**
- [DetailsCrawlerPanel.tsx](../../src/frontend/components/ui/DetailsCrawlerPanel.tsx) (novo): bloco "Details downloader" abaixo do Watch targets, dentro do box Watched roots, com Expand/Collapse.
  - O cabeçalho mostra o estado e o progresso, por exemplo "(running 8/669)".
  - Botões Start e Stop.
  - O relatório mostra o início, a duração, "N of M targets", o target atual, o motivo da parada e os contadores por fonte (fetched / saved / no link / errors, mais no torrent e skipped).
  - Cada entrada mostra o target, o botão `#id` do Nyaa (que abre o modal) e o resultado de cada fonte, com cores.
  - Enquanto roda, o painel atualiza a cada 2s. No fim, os ícones 📖/🔍 dos botões do Nyaa são atualizados.
- [WatchedRootsSection.tsx](../../src/frontend/components/sections/WatchedRootsSection.tsx): monta o painel depois do bloco Watch targets.

## Antes / Depois

- **Antes:** os detalhes só eram baixados quando uma aba do modal era aberta.
- **Depois:** um Start percorre os 669 targets, da `2026.4 Outono` para trás, e deixa os dados salvos. Abrir o modal depois não precisa mais de download.

## Como foi testado

- **Automatizado:**
  - `npm test`: 252 passando, 0 falhas.
  - `npm run typecheck`: sem erros.
  - `npm run build`: build concluído.
- **Manual no Chrome, com os dados reais:**
  - **Start:** a execução começou em `2026.4 Outono / [Erai-raws] Ao Ashi Season 2 [480p]`, depois `[720p]`, `Ao no Hako Season 2 [1080p]`, `Chii Fuyo`… em ordem alfabética.
  - O `[720p]` reaproveitou a Erai, o MAL e a AniDB do 480p (`cached`) e só buscou o próprio Nyaa.
  - O início de cada série com download ficou a pelo menos 3s do início da anterior.
  - Os contadores e as entradas atualizaram a cada 2s.
  - **Stop:** parou em 3,5s, depois de terminar o target atual, com "Stopped by the user" e 8 de 669 processados. Os ícones 🔍 viraram 📖.
  - **Start de novo:** os 8 targets já salvos passaram no mesmo segundo, sem rede, e o serviço seguiu baixando do 9º em diante. Parei em seguida, sem erros.
  - **Modal do `#2169858`:** as abas MyAnimeList e AniDB não mostram mais 🔍 (dados já em disco).

## Ajuste: targets sem arquivo no disco ("Nyaa: no-torrent")

> Alguns itens deram "Nyaa: no-torrent". Pode investigar e ver se conseguimos resolver?

- **Causa:** os 4 casos (`Romelia Senki` e `Keroro Gunsou (2026)`, em 480p e 720p) tinham as pastas **vazias**.
  - Os torrents já tinham sido enviados ao qBittorrent: eles aparecem em `qbittorrent-add-responses.json` com `targetFolderPath` na pasta, e também no índice do qBittorrent.
  - Só que o nyaadl adiciona os torrents parados, então os arquivos ainda não estavam no disco.
  - O serviço só olhava os arquivos que existem na pasta.
- **Correção:** quando nenhum arquivo da pasta tem torrent, `crawlTarget` usa os torrents enviados a ela (`findFolderTorrents`):
  - os envios com `ok` do histórico do qBittorrent para essa pasta;
  - os torrents do índice local cujo arquivo está dentro dela.
  - `pickFolderTorrentId` escolhe o de menor episódio.
- **Resultado:** os 4 targets passaram a usar o torrent do episódio 01 (`#2169093`, `#2169092`, `#2168893`, `#2168892`) e baixaram Nyaa, Erai, MAL e AniDB. Uma nova execução nos primeiros 47 targets terminou com 0 `no-torrent`.
- **Testes:**
  - `pickFolderTorrentId` escolhe o menor episódio.
  - Regressão: com a pasta vazia, o torrent enviado à pasta é usado.
  - `npm test`: 254 passando.

## Testes criados/alterados

- [src/backend/services/detailsCrawlerService.test.ts](../../src/backend/services/detailsCrawlerService.test.ts) (novo):
  - Ordem das temporadas e targets em ordem alfabética.
  - Primeiro arquivo com torrent: o ID vem do índice do qBittorrent.
  - Tudo salvo não usa a rede. O que falta é buscado.
  - Sem link de MAL/AniDB, os getters não são chamados.
  - Target sem torrent e página do Nyaa sem link da erai-raws.
  - AniDB banida: o erro fica no passo dela e a AniDB é desligada pelo resto da execução.
  - Sessão erai expirada é fatal.
  - Ritmo de 3s só depois de uma série que usou a rede (com relógio falso).
  - Stop e erro fatal interrompem o loop.
