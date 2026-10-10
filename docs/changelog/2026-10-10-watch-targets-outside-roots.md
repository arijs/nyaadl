# Watch targets expande sem precisar expandir Watched roots

## Prompt original

> Depois, no box Watched roots, coloque o Watch targets fora (mas ainda no mesmo bloco), para que o usuário possa expandir o targets sem precisar expandir o roots

## O que foi implementado

Em [WatchedRootsSection.tsx](../../src/frontend/components/sections/WatchedRootsSection.tsx), o bloco Watch targets (cabeçalho, filtros, lista e paginação) saiu de dentro do `<Show>` que esconde o conteúdo dos roots. Ele continua na mesma `<section>`, logo abaixo, com o próprio Expand/Collapse.

## Antes / Depois

- **Antes:** com Watched roots recolhido (o padrão quando há roots), o Watch targets não aparecia. Era preciso expandir os roots para chegar aos targets.
- **Depois:** o cabeçalho "Watch targets (669)" aparece sempre, abaixo de "Watched roots (12)", e cada um expande e recolhe de forma independente.

## Como foi testado

- `npm test` passando, `npm run typecheck` sem erros e `npm run build` concluído.
- **Manual no Chrome:**
  - No estado inicial, os roots estão recolhidos ("Watched roots (12)") e "Watch targets (669)" aparece recolhido.
  - Expandir só os targets mostra os filtros e 10 linhas, com os roots ainda recolhidos.
  - Expandir os roots mostra os dois.
  - Recolher os roots de novo mantém os targets abertos.

## Testes criados/alterados

Nenhum. A mudança é só de estrutura do layout.
