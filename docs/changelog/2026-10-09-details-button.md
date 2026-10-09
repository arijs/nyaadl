# Botão de detalhes com emoji, sem o link da Nyaa na lista

## Prompt original

> O ícone para abrir o modal ficou muito feio. Vamos trocar para emojis ou texto, e tirar o link do nyaa da lista que pode ser acessado por dentro do modal.

## O que foi implementado

[NyaaMeta.tsx](../../src/frontend/components/ui/NyaaMeta.tsx), usado em todas as listas e modais que mostram um torrent:
- O ícone `ⓘ` foi trocado por um botão-pílula `🔍 #<id>` (detalhes ainda não baixados) ou `📖 #<id>` (detalhes salvos, com destaque azul). O tooltip continua explicando o estado.
- O link `nyaa #<id> ↗` saiu da lista. Ele continua no modal, na aba Nyaa ("Nyaa ↗").

## Antes / Depois

- **Antes:** `ⓘ nyaa #2171713 ↗ · categoria · tamanho`
- **Depois:** `📖 #2171713 · categoria · tamanho`

## Como foi testado

- `npm run typecheck` sem erros e `npm test` passando. A mudança é só visual, sem lógica nova para testar.
- **Manual no Chrome**, via DOM:
  - Apareceram 15 botões na página: `📖 #2171713` (já salvo) e `🔍` nos demais.
  - Não sobrou nenhum link `nyaa.si/view` na lista.
  - Clicar abriu o modal, com o link "Nyaa ↗" na aba Nyaa.

## Testes criados/alterados

Nenhum. Só markup e estilo mudaram.
