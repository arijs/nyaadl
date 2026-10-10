# Torrent recuperado no qBittorrent muda de box no Scraping

## Prompt original

> Agora o retry funcionou, mas o box Scraping continua mostrando 74 de 75. Pelo que vi, o torrent 2172211 está com status: auto_downloaded, e deveria entrar no "auto approved".

## Causa

- O retry e o "Do not add torrent to queue" registram a decisão, mas não atualizavam o resultado salvo do scrape. Um item em "qB failed" continuava lá mesmo depois de recuperado.
- O resultado que estava na tela era de um scrape anterior ao box "qB failed". Nesse resultado o #2172211 não estava em lista nenhuma, então essa correção não tem o que mover. Ele só aparece depois de um novo scrape da página 1.

## O que foi implementado

- [bootstrapDiscoveryService.ts](../../src/backend/services/bootstrapDiscoveryService.ts):
  - `applyQbittorrentRecovery` (pura) e `recordQbittorrentRecovery` (aplica e salva):
    - Se o item é uma entrada manual pendente, recebe o status da decisão (`approved`).
    - Se o item está em `qbFailed`, sai de lá e entra em `autoApproved` (decisão `auto_downloaded`) ou em `manual` (decisão `approved`). Ele entra na posição da página, com o motivo e a resposta do qB.
- [server.ts](../../src/backend/server.ts): `retryQbittorrentFailureById` (que agora guarda o `responseText` do envio) e `suppressQbittorrentFailureById` chamam `recordQbittorrentRecovery`.

## Antes / Depois

- **Antes:** depois do Retry, o item continuava em "qB failed", ou continuava fora das listas, e o contador seguia em "74 of 75".
- **Depois:** depois do Retry, o item aparece em "Auto approved" com "qB: Ok", e o contador volta a 75 of 75. Isso vale para resultados que já têm o box "qB failed".

## Como foi testado

- `npm test`: 232 passando, 0 falhas.
- `npm run typecheck`: sem erros.
- **Conferido no resultado salvo:** o scrape das 17:45 UTC não tem `qbFailed` nem o #2172211 em lista nenhuma, o que explica os 74.

## Testes criados/alterados

- [src/backend/services/bootstrapManualDecision.test.ts](../../src/backend/services/bootstrapManualDecision.test.ts):
  - Regressão: uma falha `auto_downloaded` recuperada vai para Auto approved, na ordem da página e com a resposta do qB.
  - Uma falha `approved` vai para Manual approved.
  - Um pendente manual recuperado vira approved.
  - Um torrent desconhecido não muda nada.
