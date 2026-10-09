# Preview da imagem de destaque ocupando o modal inteiro

## Prompt original

> Adicione um modo preview que exiba a imagem de destaque ocupando todo o espaço do modal, inclusive as abas, ao clicar nela. Ao clicar de novo, fecha o preview. Nas três abas.

## O que foi implementado

Em [TorrentDetailsModal.tsx](../../src/frontend/components/ui/TorrentDetailsModal.tsx):
- **`SeriesImage`:** a imagem de destaque das abas Erai-raws, MyAnimeList e AniDB ficou clicável, com cursor `zoom-in` e tooltip "Click to preview". Ela recebe `onPreview` da aba.
- **Overlay:** o modal guarda a imagem em preview num signal `preview`.
  - Ela aparece num overlay `absolute inset-0` sobre todo o painel (abas, botão ✕ e conteúdo), com fundo opaco e a imagem em `object-contain` dentro do espaço disponível.
  - O painel ganhou `relative overflow-hidden`.
- **Fechar:** um clique em qualquer ponto do preview fecha o overlay (cursor `zoom-out`).
- **Esc:** com o preview aberto, Esc fecha só o preview. Um segundo Esc fecha o modal.

## Antes / Depois

- **Antes:** a imagem era só uma miniatura de 9rem.
- **Depois:** clicar na miniatura abre a imagem ocupando o modal inteiro, e clicar de novo volta.

## Como foi testado

- `npm run typecheck` sem erros e `npm test` passando. A mudança é só de UI.
- **Manual no Chrome**, em *Aishiteru Game*, nas 3 abas:
  - O clique na miniatura abre o overlay com a mesma imagem.
  - O ponto onde ficam as abas passa a cair no overlay (`elementFromPoint`).
  - A imagem cabe na altura disponível.
  - Um clique no overlay fecha o preview.
  - O overlay mede 894×864 dentro de um painel de 896×866: cobre todo o interior, e só a borda de 1px do modal continua visível.
  - Esc com o preview aberto fechou só o preview. O segundo Esc fechou o modal.

## Testes criados/alterados

Nenhum. Só markup e estado de UI mudaram.
