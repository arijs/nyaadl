# Título completo, quebrando linha, no box de recuperação do qBittorrent

## Prompt original

> O box qbittorrent recovery está escondendo parte do título com trema "..." quando o título não cabe em uma linha. Em vez disso, deixe o título completo aparecer, quebrando em linhas normalmente

## O que foi implementado

Em [ExecutionStateSection.tsx](../../src/frontend/components/sections/ExecutionStateSection.tsx), o título do card de falha trocou `truncate` (uma linha só, terminando em "…") por `wrap-break-word`. É a mesma classe que o Torrent history usa.

## Antes / Depois

```diff
-<p class="truncate font-medium text-white">{failure.item.title}</p>
+<p class="wrap-break-word font-medium text-white">{failure.item.title}</p>
```

- **Antes:** `[Erai-raws] Magical Explorer - 03 [480p CR WE…`
- **Depois:** o título completo, em 3 linhas no layout atual.

## Como foi testado

- `npm run typecheck` sem erros e `npm test` passando.
- **Manual no Chrome**, no card do #2172211:
  - O título ocupa 3 linhas (60px de altura com line-height de 20px), sem reticências.
  - `scrollWidth` é igual a `clientWidth`, ou seja, nada fica escondido.
  - Conferido também no screenshot.

## Testes criados/alterados

Nenhum. Só a classe CSS mudou.
