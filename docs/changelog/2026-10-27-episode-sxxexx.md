# Detecta episódio no formato S01E03 e nome de série da ToonsHub

## Prompt original

> Tem uma parte que o código detecta o número do episódio no nome de um torrent. Preciso que ele detecte também este formato: "S01E03", exemplo:
> "[ToonsHub] Even the Student Council Has Its Holes S01E03 REPACK 1080p UNCENSORED ADN WEB-DL AAC2.0 H.264 (Seitokai ni mo Ana wa Aru!, Multi-Subs)"

Depois:

> Sim faça isso para a ToonsHub

(Proposta aceita: tirar do título da ToonsHub o `SxxExx`, o que vem depois dele e o prefixo `[ToonsHub]` ao calcular o nome da série.)

## O que foi implementado

`reEpisode` em [localLibraryService.ts](../../src/backend/services/localLibraryService.ts), usado por `extractReleaseFingerprint`, agora aceita também `SxxExx`. O episódio vem sem a temporada (`S01E03` dá `03`), para que `Título - 03` e `Título S01E03` sejam reconhecidos como o mesmo episódio. Revisões continuam valendo (`S02E12v2` dá `12v2`).

Em [normalizeService.ts](../../src/backend/services/normalizeService.ts), `canonicalizeToonsHubTitle` reescreve títulos `[ToonsHub] Nome S01E03 resto` no formato da Erai: `[ToonsHub] Nome - 03 [resto]`. Com isso as regras de episódio e metadados que já existiam passam a valer para eles. A reescrita roda em `normalizeText` (nome da série e candidatos de match) e em `deriveFolderNameFromTitle` (sugestão de pasta ao aprovar). O prefixo `[ToonsHub]` também passou a ser removido, como o `[Erai-raws]`. A temporada 1 sai do nome; a partir da 2, o `S02` fica no nome da série, porque senão as temporadas cairiam todas na mesma série.

Títulos de outros grupos não mudam.

### Aplicação retroativa (só "Even the Student Council Has Its Holes")

> Vamos aplicar essa regra da ToonsHub retroativamente (só para essa série "Even the Student Council Has Its Holes"). Podemos alterar a pasta dos torrents já adicionados no qbittorrent?

Escolhas do usuário: **uma série só para todas as variantes**, com raiz em `Q:\2026.4 Outono`. Feito direto nos dados e no qBittorrent, sem mudança de código:

- **qBittorrent:** os 3 torrents aprovados (#2178159 OV, #2178190 ADN, #2179519 REPACK ADN; estavam `stoppedDL` com 0% baixado) foram movidos com `torrents/setLocation` para `Q:\2026.4 Outono\[ToonsHub] Even the Student Council Has Its Holes [1080p]`. As 3 pastas antigas estavam vazias e foram apagadas. Depois de reler as pastas, o novo alvo tem a chave `even the student council has its holes::1080p`.
- **Blacklist:** a entrada da variante BILI H.265 (`[toonshub] … s01e04 bili …::1080p`) passaria a ser normalizada como `even the student council has its holes::1080p`, bloqueando a série inteira. O servidor (`tsx watch`) já tinha reiniciado com a regra nova e estava com essa chave em memória. Ela foi removida com `DELETE /api/blacklist`, o que também regravou `data/blacklist.json`. Nenhum torrent foi bloqueado no intervalo.
- **Histórico e fila:** o `seriesBaseRaw` gravado não foi reescrito, porque todo uso passa por `deriveSeriesBase`, que já reconhece o valor antigo. Só o texto exibido continua o antigo.

Verificado com o servidor no ar: um título `[ToonsHub] … S01E05 1080p …` (ADN e BILI) cai na pasta nova; Judas e VARYG não.

## Antes / Depois

- **Antes:** `extractReleaseFingerprint('... S01E03 REPACK 1080p ...').episode` dava `undefined`.
- **Depois:** dá `'03'`. O formato `- 03` continua igual.
- **Nome da série, antes:** `[toonshub] even the student council has its holes s01e03 repack uncensored adn web-dl aac2.0 h.264 (seitokai ni mo ana wa aru!, multi-subs)`
- **Nome da série, depois:** `even the student council has its holes`. A pasta sugerida é `[ToonsHub] Even the Student Council Has Its Holes [1080p]`.

## Como foi testado

- `npm test`: 282 passando. `npm run typecheck` sem erros.

## Testes criados/alterados

- `src/backend/services/localLibraryService.test.ts`: novo teste `extractReleaseFingerprint reads the episode from an SxxExx token`, com o título do exemplo, uma revisão `S02E12v2` e o formato `- 07`.
- `src/backend/services/normalizeService.test.ts`: novo teste `ToonsHub SxxExx titles reduce to the series name and an Erai-style folder name`, que cobre o nome da série, a temporada 2 e a pasta sugerida.
