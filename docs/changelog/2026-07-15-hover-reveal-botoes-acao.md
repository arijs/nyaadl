# Reveal on hover para botões de ação (Torrent history + Watched roots)

## Prompt original

> Assim como nós temos no componente da blacklist, que o botão "remove" só aparece
> no hover da linha, vamos replicar esse comportamento no botão "bloquear série +
> resolução" no bloco "Torrent history" e no botão "remove" do bloco "watched roots"

## O que foi implementado

Replicado o padrão de "reveal on hover" já usado no botão **Remove** do
`BlacklistManagerSection` para outros dois botões de ação:

- Botão **Bloquear série + resolução** no `TorrentHistorySection`.
- Botão **Remove** no `WatchedRootsSection`.

O padrão consiste em:

1. Adicionar a classe `group` no container da linha.
2. No botão, deixar `opacity-0 pointer-events-none` por padrão e revelar com
   `group-hover:opacity-100 group-hover:pointer-events-auto`, além de
   `group-focus-within:*` e `focus-visible:*` para acessibilidade via teclado, com
   `transition-opacity duration-150`.

## Comparação antes/depois

**TorrentHistorySection** — container da linha:
- Antes: `class="max-w-full rounded-2xl ..."`
- Depois: `class="group max-w-full rounded-2xl ..."`

Botão "Bloquear série + resolução":
- Antes: `... text-rose-200 transition hover:bg-rose-400/20`
- Depois: `... text-rose-200 opacity-0 pointer-events-none transition-opacity duration-150 hover:bg-rose-400/20 group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto`

**WatchedRootsSection** — container da linha do root ganhou `group`; o
`ActionButton` "Remove" passou a receber as mesmas classes de reveal via prop
`class` (o componente já concatena `props.class`).

## Como foi testado

- Automatizado: `npm run typecheck` — sem erros.
- Manual: alteração puramente visual (Tailwind). O botão fica oculto até o hover
  ou foco por teclado na linha correspondente, espelhando o comportamento da
  blacklist.

## Testes criados/alterados

Nenhum teste automatizado criado — a mudança é exclusivamente de estilo/CSS
(classes utilitárias Tailwind), sem lógica nova a cobrir.

---

# Ajuste no botão "Remove" dos Watched roots

## Prompt original

> No watched roots, ficou feio o espaço vazio à direita do pill/badge "ok" quando o
> botão remove está oculto. Vamos mudar a ordem, colocar o botão "remove" antes do
> pill verde "ok", e vamos tornar o botão "remove" vermelho como os botões da
> blacklist e do torrent history.

## O que foi implementado

No `WatchedRootsSection`:

- Ordem invertida: o botão **Remove** agora vem **antes** do pill "OK"/"Missing",
  eliminando o espaço vazio à direita quando o botão está oculto.
- O `ActionButton` foi substituído por um `<button>` com o estilo vermelho dos
  botões da blacklist e do torrent history
  (`border-rose-400/30 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20`),
  mantendo o reveal-on-hover.

## Como foi testado

- Automatizado: `npm run typecheck` — sem erros.
- Manual: alteração visual; o botão vermelho fica oculto até o hover/foco e o pill
  "OK" encosta na borda direita sem buraco.

---

# Toggle para o formulário "Adicionar bloqueio" na Blacklist

## Prompt original

> Na blacklist, oculte o bloco "adicionar bloqueio", e adicione um botão toggle
> antes do botão "collapse" pra exibir e ocultar esse bloco

## O que foi implementado

No `BlacklistManagerSection`:

- Novo signal `showAddForm` (inicia em `false`) — o formulário "adicionar
  bloqueio" fica oculto por padrão, envolvido por `Show when={showAddForm()}`.
- Botão toggle adicionado no cabeçalho, **antes** do botão "Collapse", alternando
  entre **"Adicionar bloqueio"** e **"Ocultar bloqueio"**. Só é exibido quando a
  seção está expandida (`Show when={!collapsed()}`).

## Como foi testado

- Automatizado: `npm run typecheck` — sem erros.
- Manual: o formulário só aparece ao clicar no toggle; some ao clicar novamente e
  ao colapsar a seção.

## Testes criados/alterados

Nenhum teste automatizado criado — ambas as alterações são de UI/estilo e
alternância de exibição, sem lógica de negócio nova a cobrir.
