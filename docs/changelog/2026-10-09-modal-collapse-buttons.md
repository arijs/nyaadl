# Modal de detalhes: recolher reviews, fechar trailers e resumos do AniDB

## Prompt original

> Na aba do MAL, os reviews expandem mas não contraem de volta, e os vídeos PV abrem mas não fecham. Precisamos adicionar isso, também no anidb se houver. O site já tem um padrão que faz isso em outros componentes, normalmente um botão no canto superior direito. Nos reviews do MAL, mova o link para o final da linha de título, mas na mesma coluna, não em uma coluna separada.

## O que foi implementado

Em [TorrentDetailsModal.tsx](../../src/frontend/components/ui/TorrentDetailsModal.tsx), os `<details>` saíram e entrou o padrão do dashboard: um botão-pílula **Expand/Collapse** no canto superior direito. O estilo é `rounded-full border-slate-300/30 bg-slate-300/10 text-[11px]`, o mesmo do `BootstrapDiscoverySection` e do `ExecutionStateSection`.

- **`PillButton`:** esse botão, reutilizado em todos os pontos abaixo.
- **`ExpandableCard`:** um card com a linha de cabeçalho à esquerda e o botão Expand/Collapse à direita. O texto fica limitado a 3 linhas até ser expandido.
  - O botão só aparece quando o texto é longo (mais de 280 caracteres ou mais de 3 linhas).
  - É usado nas **reviews do MAL** e nas **recomendações do AniDB**.
- **Link das reviews do MAL:** o "MAL ↗" agora fica no fim da linha de título, no mesmo grupo das demais informações. Antes ele tinha `ml-auto` e era empurrado para uma coluna à direita.
- **Trailers do MAL:** o player ganhou um cabeçalho com o título do vídeo e um botão **Close** no canto superior direito. Fechar remove o iframe, o que também para o vídeo.
- **Episódios do AniDB:** o resumo, que antes ficava num `<details>`, agora abre com o botão **Summary** e fecha com **Collapse**, no canto superior direito da célula do título.

## Antes / Depois

- **Antes:**
  - A review expandia clicando no cabeçalho, sem botão visível para recolher.
  - O trailer não tinha como fechar.
  - O link da review ficava isolado à direita.
- **Depois:**
  - Expand/Collapse e Close em todos esses pontos, no padrão visual do resto do site.
  - O link fica na mesma linha das informações da review.

## Como foi testado

- `npm run typecheck` sem erros e `npm test` passando. A mudança é só de UI.
- **Manual no Chrome**, via DOM:
  - **MAL**, torrent 2171713:
    - A review começa limitada a 3 linhas. Expand mostra o texto completo e o botão vira "Collapse". Collapse volta a limitar.
    - O cabeçalho tem 2 filhos: o grupo de informações, com o link `reviews.php` dentro, e o botão.
    - Clicar numa miniatura abre o iframe com o botão Close, e Close remove o iframe.
  - **AniDB**, *Aishiteru Game*, aberto via `openTorrentDetails('2100934')`:
    - Summary mostra o resumo do episódio, e Collapse esconde.
    - A recomendação de 304 caracteres ganhou o botão Expand.

## Testes criados/alterados

Nenhum. Só markup e estado de UI mudaram.
