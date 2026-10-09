# "Saved" e "Refresh" na linha do título das abas do modal

## Prompt original

> Na aba do MAL, há uma linha no topo para a data "saved" e o botão "refresh". Vamos deixar esses elementos na mesma linha que o título da série, ainda alinhado à direita, para não ocupar uma linha inteira.

## O que foi implementado

Em [TorrentDetailsModal.tsx](../../src/frontend/components/ui/TorrentDetailsModal.tsx):
- **`TabToolbar`:** a data "Saved …" + o botão Refresh, extraídos da antiga linha do `TabState`.
- **`TitleRow`:** o título (`h3`) à esquerda e a toolbar à direita, na mesma linha.
- **`TabState`:**
  - Com dados, entrega a toolbar para o conteúdo da aba, via `children(data, toolbar)`.
  - Durante "Fetching…" e em erro não existe título, então a toolbar continua numa linha própria, alinhada à direita, e o Refresh segue disponível para tentar de novo.
- **Abas:** o mesmo layout foi aplicado às **4 abas** (Nyaa, Erai-raws, MyAnimeList, AniDB), por consistência, já que todas usavam a mesma linha.
  - Nas abas com imagem, a coluna do título ganhou `flex-1`, para a toolbar encostar na borda direita.
  - O aviso "série sem link para MAL/AniDB" (`MissingLink`) também recebe a toolbar.

## Antes / Depois

- **Antes:** uma linha inteira só com `Saved … | Refresh` acima do título.
- **Depois:** `Título da série ……… Saved … | Refresh` numa linha só.

## Como foi testado

- `npm run typecheck` sem erros e `npm test` passando. A mudança é só de layout.
- **Manual no Chrome**, em *Aishiteru Game*, nas 4 abas:
  - O título e o Refresh estão na mesma linha, com o mesmo topo, e não há linha acima do título.
  - O Refresh fica encostado na borda direita da área de conteúdo. Nas abas cujo conteúdo rola, sobra a largura da barra de rolagem (15px).
  - Refresh na aba MAL: durante "Fetching…" a toolbar continua visível (com o Refresh desabilitado) numa linha própria. Ao terminar, volta para a linha do título com a nova data "Saved".
- **Nota sobre o teste:** abrir o modal via `import()` do módulo de estado precisa usar a mesma URL que o app carregou (`useTorrentDetails.ts?t=…`, depois de um hot reload do Vite). Caso contrário, o import cria outra instância do módulo, e o modal não abre.

## Testes criados/alterados

Nenhum. Só layout mudou.
