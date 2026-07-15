# Blacklist retroativa por série + resolução

**Data:** 2026-07-14

## Prompt original

> Por um equívoco meu ao aprovar os torrents, o torrent 2132102
> (`[Erai-raws] Grand Blue Season 3 - 02 [1080p CR WEB-DL AVC AAC][MultiSub][8007EEDE]`)
> foi automaticamente aprovado. Nesse caso específico, eu só quero manter as resoluções
> 480p e 720p dessa série, e bloquear a resolução 1080p. Vamos planejar e descrever em um
> documento as regras e a interface de como o usuário pode adicionar uma série e resolução
> retroativamente na blacklist, certificando que novos episódios não venham a ser
> automaticamente baixados por causa do histórico.
>
> (segundo turno) prossiga com a implementação

Design em [docs/design/2026-07-14-blacklist-retroativa-serie-resolucao.md](../design/2026-07-14-blacklist-retroativa-serie-resolucao.md).

## O que foi implementado

1. **R2 — precedência da blacklist sobre watch-target** ([nyaaTorrentService.ts](../../src/backend/services/nyaaTorrentService.ts)):
   `inspectAndClassifyTorrent` agora bloqueia antes de checar match de watch-target. A decisão
   de precedência virou função pura `classifyTorrentDecision` (fonte única, testável). Como
   bônus, a varredura local em disco (`findExistingLocalMatch`) é pulada quando o item está
   blacklistado. O caminho de bootstrap já checava a blacklist antes do title-match; sem mudança.

2. **`POST /api/blacklist`** ([server.ts](../../src/backend/server.ts)): endpoint novo que aceita
   `{ series, resolution }` (entrada manual) ou `{ torrentId }` (deriva do último `DecisionRecord`).
   Adiciona a chave `deriveSeriesBase(série)::resolution` e faz a **varredura retroativa (R3)**:
   remove da fila os `pending` que casam a chave e registra `DecisionRecord` `blocked`. Não mexe
   em downloads já enviados ao qBittorrent.

3. **Frontend**:
   - Histórico ([TorrentHistorySection.tsx](../../src/frontend/components/sections/TorrentHistorySection.tsx)):
     botão "Bloquear série + resolução" por linha que abre um modal custom
     ([BlacklistConfirmModal.tsx](../../src/frontend/components/ui/BlacklistConfirmModal.tsx)),
     no mesmo padrão do seletor de pasta (`ApproveDestinationModal`). O modal mostra a chave a
     bloquear, o efeito retroativo e estados de loading/erro; confirma chamando `{ torrentId }`.
   - Gerenciador de blacklist ([BlacklistManagerSection.tsx](../../src/frontend/components/sections/BlacklistManagerSection.tsx)):
     formulário "Adicionar bloqueio" (série + select de resolução) chamando `{ series, resolution }`.
   - Hooks `useTorrentHistoryFilter` e `useBlacklistManager` ganharam as ações + estados de loading/erro.
   - Tipos em [src/shared/api.ts](../../src/shared/api.ts).

## Antes / depois

- **Antes:** um torrent que casava um watch-target era `auto_downloaded` mesmo se a série+resolução
  estivesse na blacklist (a blacklist só valia quando não havia target). Não havia como adicionar
  um bloqueio arbitrário pela UI — só a partir de um item pending vivo.
- **Depois:** blacklist vence o watch-target para a mesma resolução (bloqueia 1080p, mantém 480p/720p).
  Usuário adiciona bloqueio retroativo pelo histórico (1 clique no torrent ofensor) ou pelo formulário
  do gerenciador; pendências afetadas são limpas na hora.

## Como foi testado

- **Automatizado:** `npm test` → 111/111 (6 novos em `blacklistPrecedence.test.ts`). `npm run typecheck` limpo.
- **Manual:** não executado nesta sessão (requer backend na 8900 + qBittorrent). Fluxo esperado:
  abrir histórico → localizar 2132102 → "Bloquear série + resolução" → confirmar
  `grand blue season 3::1080p`; próximos scrapes classificam episódios 1080p como `blocked` e
  480p/720p seguem normais.

## Testes criados/alterados

- **Criado:** [src/backend/services/blacklistPrecedence.test.ts](../../src/backend/services/blacklistPrecedence.test.ts)
  — precedência da blacklist sobre watch-target (regressão do 2132102) + escopo por resolução do Grand Blue.
