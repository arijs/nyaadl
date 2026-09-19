# Pending queue exibe detalhes da linha capturada no nyaa (seeders/leechers)

## Prompt original

> Preciso que o pending queue mostre todos os detalhes da linha na hora da captura no nyaa, principalmente quantidade de seeders e leechers

## O que foi implementado

Os dados já eram capturados pelo scraper e persistidos em cada `TorrentItem` (`sizeText`, `publishedAtUtc`, `seeders`, `leechers`, `downloads`) — só não eram renderizados no card da fila. Adicionada uma linha em [PendingQueueSection.tsx](../../src/frontend/components/sections/PendingQueueSection.tsx) no mesmo formato já usado no *Torrent history*, com seeders em verde e leechers em vermelho para leitura rápida. Campos ausentes mostram `n/a`.

## Antes / Depois

| | Antes | Depois |
|---|---|---|
| Card da fila | título · série · resolução · página · motivo | + `1.2 GiB · 2026-09-17T…Z · seeders 42 · leechers 3 · downloads 120` |

## Como foi testado

- **Manual**: renderização visual dos cards com itens pendentes reais (dados já presentes em `data/pending.json`).
- **Automatizado**: alteração é apenas de template (sem lógica nova) — sem teste novo. `npm test` → 161/161, `npm run typecheck` sem erros.

## Testes criados/alterados

- Nenhum.
