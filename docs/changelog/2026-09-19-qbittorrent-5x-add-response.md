# 2026-09-19 — Suportar resposta JSON do `torrents/add` (qBittorrent 5.2+)

## Prompt original

> Eu atualizei o `qBittorrent` para a versão 5.2.3, parece que a resposta da api web mudou em comparação com que o app nyaadl esperava antes. Idealmente, quero que o nyaadl suporte pelo menos qualquer versão 5.x do qBittorrent.
> Exemplo: `qbResponseText: "{\"added_torrent_ids\":[\"963b28bc...\"],\"failure_count\":0,\"pending_count\":0,\"success_count\":1}"`

## O que foi implementado

- Novo helper `isQbittorrentAddSuccess(text)` em `src/shared/qbittorrent.ts`. Aceita o texto legado (`Ok.`) e o JSON do 5.2+ (`success_count > 0` ou `pending_count > 0`). `Fails.`, `failure_count` sem sucesso, vazio ou JSON inválido → falha.
- `BootstrapDiscoverySection.tsx`: o contador "qB" da seção Scraping status usa o helper em vez de `value === 'Ok.'`. Nas linhas de "auto approved" / "backfilled", o texto do qB é abreviado para `Ok` em caso de sucesso; em caso de falha o corpo completo continua visível para depuração.
- `qbittorrentService.ts`: após um HTTP 2xx, se o corpo não indica sucesso, lança `QbittorrentRequestError('http')`. Assim `Fails.` ou `failure_count: 1` caem no fluxo de falha existente (`recordQbittorrentFailure`) em vez de marcar o torrent como enviado.

## Antes / depois

| Resposta do qB | Antes | Depois |
|---|---|---|
| `Ok.` (≤ 5.1) | ok | ok |
| JSON `success_count: 1` (5.2+) | contado como falha na UI; backend marcava como enviado | ok |
| `Fails.` / JSON `failure_count: 1` | backend marcava como enviado; UI contava falha | backend registra falha e mantém na lista de retry |

## Como foi testado

- Automatizado: `npm test` (164 testes, todos passando) e `npm run typecheck` sem erros.
- Manual: pendente. Rodar scan com qB 5.2.3 e confirmar que o contador "qB" conta ok e o torrent aparece pausado no qBittorrent.

## Testes criados/alterados

- `src/shared/qbittorrent.test.ts` (novo): casos `Ok.`, `Fails.`, vazio, undefined, JSON inválido, JSON com sucesso, pending e falha.
