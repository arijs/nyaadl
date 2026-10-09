# Preview da imagem faz o modal crescer até 90vh ou até o tamanho nativo

## Prompt original

> Em alguns casos, o modal não ocupa toda a altura da página porque o conteúdo é menor (ex: Kusuriya no Hitorigoto). Mas ao abrir o preview da imagem, se houver espaço, o modal deve crescer até a altura da janela ou até exibir a imagem na resolução nativa

## O que foi implementado

Em [TorrentDetailsModal.tsx](../../src/frontend/components/ui/TorrentDetailsModal.tsx):
- **Preview no fluxo:** antes ele era um overlay `absolute inset-0`, preso à altura atual do painel. Agora ocupa o lugar do conteúdo no fluxo normal.
  - As abas e o conteúdo continuam montados, só com `hidden`. Assim o estado das abas (reviews expandidas, "Show all", trailer) sobrevive ao preview.
  - O painel passa a ter a altura da imagem.
- **Tamanho da imagem:** fica no tamanho nativo, limitada por `max-h-[calc(90vh-3rem-2px)]` (o teto de 90vh do modal, menos padding e borda) e `max-w-full` (largura do modal). Se não couber, é reduzida mantendo a proporção (`object-contain`).
- **Sem encolher:** ao abrir o preview, a altura atual do painel vira `min-height`. Se a imagem for menor que o conteúdo, o modal mantém a altura que já tinha.
- **Fechar:** clique ou Esc fecham o preview, como antes, e o painel volta ao tamanho original.

O teto continua sendo o do próprio modal (`max-h-[90vh]`), não 100% da janela, para manter a margem do backdrop.

## Antes / Depois

- **Antes:** em séries com pouco conteúdo (ex.: *Kusuriya no Hitorigoto*), o preview ficava espremido na altura pequena do modal.
- **Depois:** o modal cresce até 90vh ou até a imagem aparecer no tamanho nativo, o que vier primeiro.

## Como foi testado

- `npm run typecheck` sem erros e `npm test` passando. A mudança é só de UI.
- **Manual no Chrome**, janela com 962px de altura (teto de 90vh = 866px):
  - **Kusuriya no Hitorigoto 3rd Season, aba Erai-raws:**
    - O painel cresceu de 522px para 866px.
    - A imagem nativa de 768×1085 foi exibida em 577×816, reduzida para caber.
    - Ao fechar, o painel voltou a 522px com o conteúdo de volta.
  - **Aishiteru Game, aba AniDB:**
    - A imagem nativa de 400×565 apareceu em 400×565.
    - O painel, que já tinha 866px, não encolheu.
    - Esc fechou o preview.

## Testes criados/alterados

Nenhum. Só layout e estado de UI mudaram.
