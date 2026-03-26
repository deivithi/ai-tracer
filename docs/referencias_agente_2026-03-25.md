# Referencias para a iteracao de agente - 2026-03-25

## Fontes primarias consultadas

- `QwenLM/Qwen-Agent`
- `QwenLM/qwen-code`
- `agentscope-ai/agentscope`
- `langchain-ai/langgraph`

## Principios extraidos

- `Qwen-Agent`: apoiar o agente em instruction following, tool usage, planning e memory, em vez de tratar a conversa como formulario.
- `Qwen Code`: experiencia de agente deve aceitar linguagem natural, manter comandos como atalho opcional e operar com fluxo agentic rico.
- `AgentScope`: a orquestracao nao deve engessar o modelo com prompts excessivamente opinativos; o agente precisa aproveitar raciocinio, memoria e tool use. O repositrio tambem destaca memory compression, long-term memory e workflows multiagente.
- `LangGraph`: agentes fortes tendem a ser stateful, long-running e com memoria de curto e longo prazo explicitamente tratada na arquitetura, nao apenas no prompt.

## Traducao para o AI Tracer

- substituir prefixos obrigatorios por entendimento de linguagem natural;
- separar `agent turn engine` da interface;
- tratar `plan`, `phases`, `execution` e `verification` como acoes internas disparadas pelo turno da conversa;
- combinar resposta natural do agente com artefatos reais no thread principal;
- persistir memoria longa no navegador com recuperacao por relevancia antes de cada turno;
- separar `controle estruturado` de `resposta final ao usuario`, para o produto nao parecer um fluxo automatizado disfarado de agente.
