# Design — Blacklist retroativa por série + resolução

**Data:** 2026-07-14
**Status:** Proposta (planejamento, sem implementação)

## 1. Problema

Por engano na aprovação, o torrent **2132102**
(`[Erai-raws] Grand Blue Season 3 - 02 [1080p CR WEB-DL AVC AAC][MultiSub][8007EEDE]`)
foi aprovado e enviado ao qBittorrent. Para essa série o usuário quer **manter 480p e 720p**
e **bloquear 1080p** — não só desfazer este episódio, mas garantir que **episódios futuros
em 1080p não sejam baixados automaticamente** por causa do histórico.

Objetivo: permitir adicionar retroativamente um par `série + resolução` à blacklist,
pela interface, e garantir que a regra pegue tanto o histórico quanto o que vier depois.

## 2. Estado atual (o que já existe)

- **Chave da blacklist:** string `"<seriesKey>::<resolution>"`, ex. `grand blue season 3::1080p`.
  Gerada por `buildNormalizedKey(deriveSeriesBase(série), resolution)`
  ([normalizeService.ts:54](../../src/backend/services/normalizeService.ts#L54)).
  Armazenada em `data/blacklist.json` (`{ items: string[] }`).
- **Verificação:** `isTorrentBlacklisted`
  ([matchingService.ts:54](../../src/backend/services/matchingService.ts#L54)) — casa a chave exata
  ou qualquer `matchCandidate` combinado com a resolução do torrent. Já é **por resolução**:
  blacklistar `::1080p` nunca afeta um torrent 720p da mesma série.
- **Adição hoje:** só existe `POST /api/pending/:id/blacklist`
  ([server.ts:590](../../src/backend/server.ts#L590)) — parte sempre de um item **pending vivo**.
  Não há endpoint para blacklistar um par arbitrário nem para varrer o histórico.
- **Remoção:** `DELETE /api/blacklist` (`{ key }`), e a UI `BlacklistManagerSection` só **remove**
  ("prune"), não adiciona.

### O bloqueio crítico (precedência)

Na classificação ([nyaaTorrentService.ts:46-79](../../src/backend/services/nyaaTorrentService.ts#L46-L79))
a ordem é:

```
1. matchedTarget existe? → already_downloaded / conflict(pending) / auto_downloaded
2. senão, blacklistHit?  → blocked
3. senão               → pending
```

Ou seja: **um watch-target que casa vence a blacklist.** Se existir uma pasta observada
`Grand Blue Season 3 [1080p]`, novos episódios 1080p continuariam em `auto_downloaded`
mesmo com a série na blacklist. Como o usuário quer justamente bloquear a resolução 1080p
de uma série que ele acompanha, **a blacklist precisa passar a ter precedência sobre o
watch-target para a mesma resolução** — senão a feature não cumpre o requisito.

## 3. Regras propostas

### R1 — Derivação da chave
A chave retroativa usa a mesma receita do fluxo atual:
`buildNormalizedKey(deriveSeriesBase(série), resolution.toLowerCase())`.
Fonte da série/resolução: o próprio `DecisionRecord`/`TorrentItem` da linha do histórico
(caminho ergonômico) ou entrada manual no gerenciador. Persistir via `saveBlacklist`
(normaliza, dedup, ordena, escrita atômica).

### R2 — Blacklist passa a ter precedência sobre watch-target (mesma resolução)
Mover a verificação de blacklist para **antes** do bloco `matchedTarget` em
`inspectAndClassifyTorrent`:

```
1. blacklistHit? → blocked   ← movido para o topo
2. matchedTarget existe? → already_downloaded / conflict / auto_downloaded
3. senão → pending
```

Como a chave é por resolução, isso bloqueia só 1080p; as pastas/watch-targets de 480p e 720p
seguem funcionando normalmente. Aplicar a mesma ordem no caminho de bootstrap
(`processBootstrapItem`).

> Decisão adotada: blacklist vence watch-target. Alternativa descartada — "watch-target
> sempre vence" — porque tornaria impossível bloquear uma resolução de série acompanhada,
> que é exatamente o pedido.

### R3 — Semântica retroativa (o que a ação faz com cada estado)
Ao adicionar `grand blue season 3::1080p`:

| Estado do torrent (histórico)        | Ação                                                                 |
|--------------------------------------|----------------------------------------------------------------------|
| **Futuro** (episódio ainda não visto)| Classificado como `blocked` por R2. **Objetivo principal.**           |
| **Pending** (na fila)                | Remover da fila e registrar `DecisionRecord` `blocked`.               |
| **auto_downloaded / approved**       | Deixar como está — já foi enviado ao qBittorrent. Registrar `blocked` opcional para auditoria. **Não** apaga do qBittorrent (fora de escopo). |
| **already_downloaded**               | Sem ação — arquivo local existe; R2 evita re-download futuro.         |
| **blocked / skipped**                | Já bloqueado; nada a fazer.                                            |

Ponto-chave: a ação **não remove o que já baixou** (o episódio 02 permanece). Ela garante o
futuro e limpa a fila. Remover o download do episódio 02 é passo manual do usuário no qBittorrent.

### R4 — Idempotência e reload
- Não duplicar chave já presente (`includes` antes do `push`).
- `GET /api/blacklist` recarrega `blacklistState` do disco
  ([server.ts:496](../../src/backend/server.ts#L496)); a adição **deve** persistir com `saveBlacklist`
  antes de retornar, para não ser sobrescrita por um reload em memória.

### R5 — Interação com o re-check de replay existente
O commit "Re-check blacklist when replaying blocked/skipped decisions"
([bootstrapDiscoveryService.ts:308-348](../../src/backend/services/bootstrapDiscoveryService.ts#L308-L348))
re-avalia itens `blocked/skipped` quando **não** estão mais na blacklist. Com a chave presente,
esse re-check **não** dispara (fica bloqueado), que é o comportamento desejado. Nenhuma mudança
necessária ali além de garantir que ele considere a resolução do título (já faz via `matchCandidates`).

## 4. Interface

Dois pontos de entrada; o primeiro é o que resolve o caso relatado.

### I1 — Ação na linha do histórico (recomendado / primário)
Em `TorrentHistorySection`, cada linha já traz série + resolução + `torrentId`. Adicionar botão
**"Bloquear série + resolução"**. Ao clicar, abre confirmação exibindo a chave derivada
(`grand blue season 3::1080p`) e o resumo da R3 (quantos pending serão removidos; que downloads
já feitos não são apagados). Confirma → chama I3.

Isso casa direto com o fluxo do usuário: "o 2132102 foi aprovado errado → bloqueia daqui a partir dele".

### I2 — Formulário de adição no gerenciador de blacklist
`BlacklistManagerSection` ganha um formulário **"Adicionar bloqueio"**: campo série (texto) +
select de resolução (`480p / 720p / 1080p / unknown`). Para o caso geral, sem partir de um item.
A chave é normalizada no backend (usuário não precisa acertar o formato).

### I3 — Endpoint novo: `POST /api/blacklist`
Corpo aceita uma das formas:
- `{ series: string, resolution: string }` — origem I2 (entrada manual), ou
- `{ torrentId: string }` — origem I1 (deriva série/resolução do último `DecisionRecord`).

Fluxo:
1. Derivar `blacklistKey`.
2. Se ausente, `blacklistState.push(key)`.
3. **Varredura retroativa (R3):** remover de `pendingState` os itens cuja chave casa
   (`isTorrentBlacklisted`) e registrar `DecisionRecord` `blocked` para cada.
4. `saveBlacklist` + `savePending` + `saveDecisions`.
5. Retornar `{ success, data: { key, removedPending: n } }`.

Reaproveita quase inteiramente a lógica de `POST /api/pending/:id/blacklist`, generalizada para
não depender de um único item pending.

## 5. Fluxo do caso concreto (2132102)

1. Usuário abre o histórico, acha a linha do 2132102 (Grand Blue Season 3, 1080p, `approved`).
2. Clica **"Bloquear série + resolução"** → confirma chave `grand blue season 3::1080p`.
3. Backend: adiciona a chave; nenhum pending casa (já estava aprovado) → `removedPending: 0`;
   registra `blocked` para auditoria; **não** apaga o download do ep. 02.
4. Episódio 03 em 1080p aparece no próximo scrape → R2 classifica `blocked`. Não baixa.
5. Episódios 480p/720p da mesma série seguem casando seus watch-targets e baixando normalmente.
6. (Manual) usuário remove o ep. 02 1080p do qBittorrent se quiser.

## 6. Casos de borda

- **`resolution: "unknown"`** — se o título não tem resolução, a chave vira `série::unknown`.
  Bloquear `unknown` não afeta 480p/720p/1080p. Ok, mas avisar na UI que só bloqueia "unknown".
- **Alias/normalização divergente** — a série derivada do histórico deve passar por
  `deriveSeriesBase` (igual à classificação) para a chave bater com futuros torrents; senão o
  bloqueio não pega. Mostrar a chave final na confirmação evita surpresa.
- **Watch-target de 1080p ainda existe em disco** — com R2 a pasta é ignorada para downloads
  (fica "órfã"). Não removemos pasta automaticamente (fora de escopo); apenas paramos de baixar.

## 7. Testes propostos

Regressão do bug e cobertura da regra:

1. **Precedência (R2):** torrent 1080p de série com watch-target 1080p **e** chave na blacklist →
   `blocked` (hoje daria `auto_downloaded`). Este é o teste de regressão do incidente.
2. **Resolução isolada:** mesma série, torrent 720p, blacklist só `::1080p` → **não** `blocked`
   (casa watch-target 720p).
3. **Endpoint I3 por `torrentId`:** deriva a chave correta do `DecisionRecord`; idempotente
   (segundo POST não duplica).
4. **Varredura pending (R3):** pending que casa a nova chave é removido e vira `DecisionRecord`
   `blocked`; `auto_downloaded`/`approved` preexistentes são preservados.
5. **Persistência (R4):** após I3, `GET /api/blacklist` (que recarrega do disco) retorna a chave.

## 8. Fora de escopo

- Apagar/pausar o download já enviado ao qBittorrent (ação manual do usuário).
- Remover pastas de watch-target órfãs.
- Blacklist por série inteira (todas as resoluções) — a granularidade pedida é série+resolução.

## 9. Resumo do esforço de implementação (referência)

- Backend: mover 1 checagem de precedência (R2, ~3 linhas em `nyaaTorrentService.ts` + espelho no
  bootstrap); 1 endpoint novo `POST /api/blacklist` generalizando o handler existente.
- Frontend: 1 botão + modal de confirmação em `TorrentHistorySection`; 1 formulário de adição em
  `BlacklistManagerSection`; wiring no hook de API.
- Tipos: adicionar o request de `POST /api/blacklist` em `src/shared/api.ts`.
