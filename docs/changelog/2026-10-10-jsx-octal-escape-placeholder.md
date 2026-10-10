# Corrige erro de build "octal escape" no placeholder de caminho

## Prompt original

> Fui rodar o `npm run dev` e o comando deu este erro:
>
> ```
> [dev:client] [PARSE_ERROR] '0'-prefixed octal literals and octal escape sequences are deprecated
> [dev:client]     ╭─[ src/frontend/components/ui/ApproveDestinationModal.tsx:94:22 ]
> [dev:client]  94 │                         placeholder="e.g. Q:\2026.2 PRIMAVERA"
> ```

## O que foi implementado

- O parser do Vite 8 (oxc, via rolldown) lê `\2` dentro de uma string de atributo JSX como um escape octal (descontinuado) e o build falha.
- Pela especificação do JSX, essas strings **não** processam escapes. Então `"Q:\\2026"` seria exibido com duas barras no TS/Babel, e com uma no oxc.
- Os dois placeholders com caminho Windows passaram a usar uma expressão JS, `placeholder={"Q:\\2026.2 PRIMAVERA"}`, que mostra uma barra em qualquer ferramenta:
  - [ApproveDestinationModal.tsx](../../src/frontend/components/ui/ApproveDestinationModal.tsx) (a causa do erro).
  - [WatchedRootsSection.tsx](../../src/frontend/components/sections/WatchedRootsSection.tsx) (tinha `\\` na string JSX; não quebrava, mas a barra aparecia de forma diferente conforme a ferramenta).

## Antes / Depois

```diff
-placeholder="e.g. Q:\2026.2 PRIMAVERA"
+placeholder={"e.g. Q:\\2026.2 PRIMAVERA"}

-placeholder="Q:\\2026.2 PRIMAVERA"
+placeholder={"Q:\\2026.2 PRIMAVERA"}
```

## Como foi testado

- O novo teste falha no código antigo, apontando `ApproveDestinationModal.tsx:94`, e passa com a correção.
- `npm test`: 220 passando, 0 falhas.
- `npm run typecheck`: sem erros.
- `npm run build`: build concluído (antes falhava com o mesmo `PARSE_ERROR`).

## Testes criados/alterados

- [src/frontend/jsxOctalEscape.test.ts](../../src/frontend/jsxOctalEscape.test.ts): varre os `.tsx` do frontend e falha se alguma string de atributo JSX (`attr="..."`) contiver `\`.
