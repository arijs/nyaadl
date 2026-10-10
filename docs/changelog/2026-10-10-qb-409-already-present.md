# Retry no qBittorrent: torrent que já está na lista deixa de ficar com erro

## Prompt original

> cliquei no botão "retry" e o serviço retornou o erro:
>
> ```json
> { "status": 400, "message": "qBittorrent add failed: 409 Conflict - Conflict", "data": { "success": false, "error": "qBittorrent add failed: 409 Conflict - Conflict", "details": { "kind": "http", "torrentId": "2172211" } } }
> ```
>
> O torrent já está na lista do qbittorrent. Tem como o sistema verificar isso e não manter o torrent com erro?

## Causa

- O primeiro envio do #2172211 deu timeout no nyaadl, mas o qBittorrent acabou adicionando o torrent assim mesmo.
- No retry, o qBittorrent 5.x respondeu **409 Conflict** ao `torrents/add`. Ele usa esse status quando não adiciona nada, sem dizer o motivo.
- O nyaadl tratava qualquer resposta fora de 2xx como erro, então o item continuava na lista de falhas.

## O que foi implementado

- [qbittorrentService.ts](../../src/backend/services/qbittorrentService.ts):
  - Quando o add responde 409, `isTorrentInQbittorrent` calcula o info hash do `.torrent` (com o `parse-torrent`, que já é dependência do projeto). Depois consulta `GET /api/v2/torrents/info?hashes=<hash>`, com o mesmo cookie de sessão do add, se houver.
  - **Se o torrent existe:** o add é tratado como sucesso, com `responseText` = `Already in qBittorrent.`. O fluxo normal segue:
    - a falha sai da lista;
    - o torrent é marcado como enviado;
    - no retry, a decisão é registrada.
  - **Se não existe, ou se a consulta falhar:** o erro 409 continua como antes.
- [qbittorrent.ts](../../src/shared/qbittorrent.ts): nova constante `QBITTORRENT_ALREADY_PRESENT`, aceita por `isQbittorrentAddSuccess`. Assim, a interface conta o item como "qB Ok", e não como falha.

## Antes / Depois

- **Antes:** Retry → `400 qBittorrent add failed: 409 Conflict - Conflict`, e o item continuava em "qBittorrent submission recovery".
- **Depois:** Retry → sucesso. O item sai da lista de falhas, a decisão é registrada, e a resposta do qB fica salva como "Already in qBittorrent.".

## Como foi testado

- `npm test`: 229 passando, 0 falhas.
- `npm run typecheck`: sem erros.
- O teste de regressão falha sem a correção e passa com ela.
- **Conferência só de leitura no qBittorrent real:**
  - O info hash do arquivo `...-2172211.torrent` é `89647fc9133987e302e9ec897bd9256ea389d9a7`.
  - `GET /api/v2/torrents/info?hashes=89647fc9…` devolve o torrent, com `content_path` em `Q:\2026.4 Outono\[Erai-raws] Magical Explorer [480p]\…`, a mesma pasta de destino.
- **Não testado:** o clique em Retry depois da correção. Ele fica com o usuário, porque grava a decisão e altera o estado da aplicação.

## Testes criados/alterados

- [src/backend/services/qbittorrentService.test.ts](../../src/backend/services/qbittorrentService.test.ts) (novo):
  - Usa um `fetch` simulado e um `.torrent` mínimo de verdade.
  - Um 409 com o hash presente em `torrents/info` vira sucesso com `Already in qBittorrent.`, e a consulta usa o hash certo.
  - Um 409 com o hash ausente continua sendo erro.
- [src/shared/qbittorrent.test.ts](../../src/shared/qbittorrent.test.ts): `isQbittorrentAddSuccess` aceita `QBITTORRENT_ALREADY_PRESENT`.

## Observação

O sucesso não confere se a pasta de destino no qBittorrent é a mesma que o nyaadl usaria, só se o torrent está lá. No caso do #2172211, a pasta é a mesma.
