# Refino rápido — 23/09/2026

O Imprompt prioriza velocidade por padrão (`api_fast_mode`, incluindo configurações
antigas). Em **API → Priorizar velocidade**, desligue a opção e aplique para usar
os padrões de raciocínio do provedor em tarefas mais complexas. O modelo escolhido
e a tarifa de processamento normal são preservados; nenhum serviço Priority/Fast
mais caro é ativado.

## O que mudou

- O app pede menos raciocínio interno em pares de provedor/modelo documentados.
  Omitir o parâmetro não significa desligá-lo: vários modelos raciocinam por padrão.
- As instruções, exemplos e formatos de saída dos cinco presets permanecem
  idênticos à versão 0.1.2. Presets editados pelo usuário também são preservados.
  A otimização modifica o esforço de raciocínio, sem mudar a função dos prompts.
- O cliente HTTP permanece em cache e agora mantém conexões ociosas por até dez
  minutos quando o servidor permite, reduzindo reconexões entre refinos.
- Um erro 400/422 que rejeite explicitamente o controle adicionado permite uma
  única tentativa sem ele; o cliente guarda essa compatibilidade durante a sessão.
  Erros de modelo ou autenticação não acionam essa alternativa. Uma chamada bem
  sucedida continua fazendo uma única geração.

## Controles verificados

| Provedor e modelo | Pedido no modo rápido |
| --- | --- |
| OpenAI GPT-5.6 Luna/Terra | esforço `none` |
| OpenAI GPT-5, Mini e Nano, incluindo snapshots 2025-08-07 | esforço `minimal` |
| Anthropic Claude Sonnet 5 | `thinking.type: disabled` |
| DeepSeek Flash/V4 Pro | thinking desativado; Responses usa esforço `none` |
| Gemini 3.1/3.5 Flash-Lite | esforço `minimal` |
| Gemini 3.8 Flash | esforço `low`, menor nível suportado |
| xAI Grok 4.7 | esforço `low`; não aceita desligar raciocínio |
| OpenRouter GPT-5.6 Luna | esforço `none` |
| OpenRouter GPT OSS 20B | esforço `low`; raciocínio obrigatório |
| OpenRouter DeepSeek V4.1 Flash e Qwen 3.5 Flash | `reasoning.enabled: false` |

Endpoints ou modelos não reconhecidos mantêm os parâmetros da API, beneficiando-se
da reutilização de conexão. Não se presume suporte a
partir do nome de um modelo hospedado em um servidor personalizado.

Fontes consultadas:

- [OpenAI Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna),
  [Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra),
  [GPT-5 minimal](https://developers.openai.com/api/docs/changelog#august-2025) e
  [otimização de latência](https://developers.openai.com/api/docs/guides/latency-optimization).
- [Claude Sonnet 5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5).
- [DeepSeek thinking](https://api-docs.deepseek.com/guides/thinking_mode/).
- [Gemini thinking](https://ai.google.dev/gemini-api/docs/thinking) e
  [compatibilidade OpenAI](https://ai.google.dev/gemini-api/docs/openai).
- [xAI reasoning](https://docs.x.ai/developers/model-capabilities/text/reasoning).
- [OpenRouter reasoning](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)
  e metadados `reasoning` do [catálogo público](https://openrouter.ai/api/v1/models).

## Validação e limites

Em 23/09/2026 executamos seis chamadas reais com GPT-5 Nano, usando a configuração
salva, textos sintéticos e exatamente os mesmos prompts da versão 0.1.2. Cada
caso foi chamado uma vez com o padrão da API e uma vez com esforço `minimal`,
alternando a ordem entre casos e reutilizando o mesmo cliente HTTP.

| Preset | Padrão da API | Raciocínio mínimo |
| --- | ---: | ---: |
| Corrigir & clarear | 8,96 s | 1,65 s |
| Traduzir p/ EN | 8,25 s | 1,11 s |
| Front-end | 13,88 s | 3,20 s |

A média observada caiu de 10,36 s para 1,99 s (aproximadamente 81%). É uma amostra
pequena, sem estimativa estatística e sem medição dos demais provedores. As duas
variantes de correção preservaram prazo e valor; as traduções preservaram o nome
da função, a regra dos negativos e a mensagem literal. O caso Front-end manteve
a tarefa de escrever um prompt, as seções, a inspeção do projeto e as restrições
de histórico e alinhamento; com mínimo gerou 1.655 caracteres contra 3.439 no padrão.
Essa diferença de tamanho também influencia o tempo. Não é prova de qualidade
equivalente para qualquer pedido complexo.

O teste manual opt-in `ab_latency_saved_model` registra as entradas, saídas e
tempos em `src-tauri/target/latency-ab.json`, sem alterar configurações, histórico
ou contadores do app. Reexecução explícita: definir `IMPROMPT_LIVE_LATENCY_TEST=1`
e rodar `cargo test --lib ab_latency_saved_model -- --ignored --nocapture` dentro
de `src-tauri` (usa a chave salva e gera cobranças do provedor).

Os testes locais verificam payloads, preservação integral do texto de entrada,
alternativa de compatibilidade, configuração e navegação. Não prometemos um percentual fixo de ganho:
tamanho da saída, rede, fila do provedor e modelo continuam influenciando o tempo.
Reduzir raciocínio pode diminuir qualidade em tarefas complexas.

Não cortamos o texto nem impomos um limite pequeno à resposta para aparentar
velocidade. Respostas truncadas continuam sendo rejeitadas. Os benchmarks exibidos
no catálogo mantêm a variante publicada como referência; não representam medições
do modo rápido do Imprompt.
