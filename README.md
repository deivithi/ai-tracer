# AI Tracer

Control plane spec-driven para transformar objetivo, contexto e critérios de aceite em artefatos operacionais auditáveis.

## O que o produto entrega

- `Goal Studio`: captura objetivo, resultado desejado, restrições, critérios de aceite e anexos curtos.
- `Plan`: gera north star, workstreams, riscos, approval gates e first move.
- `Phases`: quebra o plano em etapas operacionais com deliverables e dependências.
- `Execution`: monta checklist, passos, evidências e handoff packets para agentes.
- `Verification`: compara a evidência de implementação com o plano original.
- `Workspace`: persiste runs localmente e exporta todo o pacote em bundle zip.

## Princípios do projeto

- Static-first e compatível com GitHub Pages.
- Sem segredo embutido no bundle publicado.
- Chave do OpenRouter fica apenas em `sessionStorage`.
- Artefatos e histórico ficam no navegador do usuário.
- Fluxo resiliente a respostas parciais do modelo via validação, repair pass e defaults operacionais.

## Stack

- React 19 + TypeScript
- Vite
- Framer Motion
- Zod
- JSZip
- Vitest + Testing Library
- Playwright

## Runtime do modelo

- Provider: OpenRouter
- Modelo default: `minimax/minimax-m2.7`
- Endpoint: `https://openrouter.ai/api/v1/chat/completions`

O app usa `response_format: json_object`, timeout explícito e `provider.require_parameters = true` para reduzir drift de providers que não respeitam a request completa.

## Segurança

- A chave nunca vai para `localStorage`.
- A chave nunca vai para o bundle de produção.
- O deploy publicado funciona sem credencial embarcada.
- A CSP restringe `connect-src` ao próprio app e ao OpenRouter.
- O workspace exportado não inclui a chave da sessão.

## Scripts

```bash
npm install
npm run dev
npm run verify
npm run verify:live
```

### O que cada script valida

- `npm run verify`
  - lint
  - unit tests
  - build de produção
  - smoke E2E demo
- `npm run verify:live`
  - tudo do `verify`
  - fluxo live ponta a ponta com OpenRouter

Para o smoke live:

```bash
set OPENROUTER_API_KEY=seu-token
set OPENROUTER_MODEL=minimax/minimax-m2.7
npm run test:e2e:live
```

## Deploy no GitHub Pages

O repositório já está preparado para deploy estático com GitHub Actions.

Fluxo esperado:

1. Subir o projeto para um repositório GitHub.
2. Garantir que a branch default seja `main`.
3. O workflow `deploy-pages.yml` roda build e publica a pasta `dist/`.
4. Ativar GitHub Pages em `Settings -> Pages -> Source: GitHub Actions`.

## Estrutura

```text
src/
  app/
    engine.ts
    openrouter.ts
    prompts.ts
    schemas.ts
    storage.ts
  components/
  styles/
tests-e2e/
.github/workflows/
```

## Estado atual de qualidade

- Fluxo demo validado por Playwright.
- Fluxo live validado ponta a ponta com `minimax/minimax-m2.7`.
- Motor endurecido contra respostas parciais do modelo.
- Build pronto para GitHub Pages.
