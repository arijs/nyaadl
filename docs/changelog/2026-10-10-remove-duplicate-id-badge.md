# Remove o badge antigo que repetia o ID do Nyaa

## Prompt original

> Nesse box qbittorrent recovery, no torrent history e onde mais onde mostrar o ID do nyaa duplicado (porque agora temos o novo botão do modal), podemos eliminar o badge antigo que só mostrava o ID

## O que foi implementado

O botão de detalhes (`NyaaMeta`, `🔍/📖 #<id>`, que abre o modal) já mostra o ID. Removi os badges antigos que repetiam esse ID ao lado dele:

- [ExecutionStateSection.tsx](../../src/frontend/components/sections/ExecutionStateSection.tsx), box de recuperação do qBittorrent: o badge `ID <id>` ao lado do título. O título ficou sozinho, sem o wrapper flex.
- [TorrentHistorySection.tsx](../../src/frontend/components/sections/TorrentHistorySection.tsx): o badge com o ID na coluna da direita. O botão "Bloquear série + resolução" continua lá.

Procurei pelos outros usos do `NyaaMeta` (Scraping, Pending queue, modais de destino e de bloqueio) e nenhum repete o ID.

## Antes / Depois

- **Antes:** `Título [ID 2172211]` + `🔍 #2172211 · categoria · tamanho`.
- **Depois:** `Título` + `🔍 #2172211 · categoria · tamanho`.

## Como foi testado

- `npm run typecheck` sem erros e `npm test` com 226 passando.
- **Manual no Chrome:**
  - No card de falha do qBittorrent (#2172211) e num card do Torrent history (#2111458), o ID aparece uma vez só, no botão de detalhes.
  - O layout dos cards continua certo.

## Testes criados/alterados

Nenhum. Só markup foi removido.
