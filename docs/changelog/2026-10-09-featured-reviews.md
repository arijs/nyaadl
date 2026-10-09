# Reviews do MAL: 3 em destaque (uma por veredito), ordenadas por reações, com "Show all"

## Prompt original

> A lista de reviews no Aishiteru Game é muito grande.
> Vamos deixar apenas 3 vagas visíveis de início, uma reservada para cada tipo: Recomendado, Não recomendado e Mixed Feelings. Se não houverem reviews para um desses tipos, a vaga pode ser preenchida por outros tipos. Vamos ordenar a lista por número de reações (decrescente, maiores primeiro). E adicionar um toggle no canto superior direito para exibir e ocultar o resto da lista.

## O que foi implementado

- **[featuredReviews.ts](../../src/frontend/lib/featuredReviews.ts)** (novo, funções puras):
  - `sortByReactions` ordena por reações, da maior para a menor. Reviews sem reações contam como 0, e a ordem original é mantida nos empates.
  - `featuredReviews` reserva uma vaga para a review com mais reações de cada veredito: Recommended, Mixed Feelings e Not Recommended.
    - Se um veredito não tem reviews, a vaga vai para as próximas com mais reações.
    - O resultado sai na mesma ordem de reações da lista completa.
- **[TorrentDetailsModal.tsx](../../src/frontend/components/ui/TorrentDetailsModal.tsx)**
  - `Section` ganhou um slot `action` no canto superior direito do cabeçalho.
  - Na aba MAL, a seção Reviews começa com as 3 em destaque. O botão-pílula **Show all / Show less**, o mesmo padrão do `BootstrapDiscoverySection`, mostra ou esconde a lista completa, ordenada por reações.
  - O título indica o estado: "Reviews (3 of 20 · first page · most reactions first)".
  - O toggle só aparece quando há mais reviews que vagas.

## Antes / Depois

- **Antes:** as 20 reviews apareciam na ordem da página do MAL.
- **Depois:** 3 em destaque, uma por veredito, ordenadas por reações. As demais ficam atrás de "Show all".

## Como foi testado

- `npm test`, 218 testes passando (4 novos). `npm run typecheck` sem erros.
- **Manual no Chrome**, em *Aishiteru Game* (torrent 2100934):
  - **Inicial:** Not Recommended (62 reações), Recommended (28) e Mixed Feelings (22). A review com 55 reações é o segundo "Not Recommended", então fica fora do destaque, como pedido.
  - **Show all:** 20 reviews em ordem decrescente (62, 55, 28, 26, …, 2), com o botão virando "Show less".
  - **Show less:** volta para as 3.

## Testes criados/alterados

`src/frontend/lib/featuredReviews.test.ts` (novo):
- Ordenação por reações.
- Uma vaga por veredito, na ordem de reações.
- Vaga de um veredito ausente preenchida pela próxima com mais reações.
- Menos reviews que vagas, e lista vazia.
