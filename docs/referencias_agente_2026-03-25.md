# Referencias para a iteracao de agente - 2026-03-25

## Fontes primarias consultadas

- `QwenLM/Qwen-Agent`
- `QwenLM/qwen-code`
- `agentscope-ai/agentscope`

## Principios extraidos

- `Qwen-Agent`: apoiar o agente em instruction following, tool usage, planning e memory, em vez de tratar a conversa como formulario.
- `Qwen Code`: experiencia de agente deve aceitar linguagem natural, manter comandos como atalho opcional e operar com fluxo agentic rico.
- `AgentScope`: a orquestracao nao deve engessar o modelo com prompts excessivamente opinativos; o agente precisa aproveitar raciocinio, memoria e tool use.

## Traducao para o AI Tracer

- substituir prefixos obrigatorios por entendimento de linguagem natural;
- separar `agent turn engine` da interface;
- tratar `plan`, `phases`, `execution` e `verification` como acoes internas disparadas pelo turno da conversa;
- combinar resposta natural do agente com artefatos reais no thread principal.
