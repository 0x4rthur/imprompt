# Catálogo de modelos — 22 de setembro de 2026

O Imprompt oferece 18 opções selecionadas para refino, tradução e prompts de código.
São sugestões editoriais baseadas em preços publicados e no posicionamento dos
provedores. Os indicadores usam referências publicadas, sem testes locais de
qualidade ou latência. A opção sugerida
equilibra custo, uso geral e disponibilidade; não é necessariamente a mais barata.

| Provedor | Sugestão inicial | Alternativas |
| --- | --- | --- |
| OpenAI | GPT-5.6 Luna | GPT-5 Nano (economia), GPT-4.1 Nano (edições rápidas), GPT-5.6 Terra (tarefas exigentes) |
| Anthropic | Claude Haiku 4.5 | Claude Sonnet 5 (equilíbrio) |
| OpenRouter | GPT-5.6 Luna | GPT OSS 20B e Qwen 3.5 Flash (economia), DeepSeek V4.1 Flash (equilíbrio) |
| DeepSeek | DeepSeek V4.1 Flash | DeepSeek V4 Pro (tarefas exigentes) |
| Gemini | Gemini 3.5 Flash-Lite | Gemini 3.1 Flash-Lite (economia), Gemini 3.8 Flash (tarefas exigentes) |
| xAI | Grok 4.3 | Grok Build 0.1 (código), Grok 4.7 (tarefas exigentes) |

Configurações salvas não são migradas automaticamente. Modelos fora da seleção
continuam editáveis em **Personalizado…**. Cada provedor restaura seu rascunho
durante a sessão; a seleção só é persistida após **Aplicar e testar**.

## Preços e fontes

`src/modelCatalog.json` é a fonte compartilhada pela interface e pelo cálculo
de custos em Rust. Os valores são USD por milhão de tokens de texto, entrada sem
cache e saída, em chamadas normais. Não incluem impostos, descontos de lote,
armazenamento, ferramentas nem descontos de cache. Tokens de raciocínio podem
ser cobrados como saída; o consumo real depende do modelo e do texto.

- [OpenAI: modelos](https://developers.openai.com/api/docs/models) e
  [preços](https://developers.openai.com/api/docs/pricing). Luna é a sugestão para
  uso cotidiano; Nano oferece menor preço, e Terra atende instruções mais exigentes.
- [Anthropic: modelos](https://platform.claude.com/docs/en/models/overview) e
  [preços](https://platform.claude.com/docs/en/about-claude/pricing). Haiku 4.5 custa
  US$1/US$5; Sonnet 5 custa US$2/US$10 por milhão de tokens de entrada/saída.
- [OpenRouter: catálogo público](https://openrouter.ai/api/v1/models). Preços
  consultados diretamente no catálogo, convertidos de token para milhão de tokens.
  São tarifas iniciais; roteamento e disponibilidade podem alterar o custo.
- [DeepSeek: preços](https://api-docs.deepseek.com/quick_start/pricing/).
  Usamos as tarifas de pico: Flash US$0,30/US$1,20 e Pro US$1,32/US$3,96.
  Fora do pico, entrada e saída custam metade. A estimativa usa o pico e pode
  superestimar o custo. O ID atual do Flash na API direta é `deepseek-flash`.
- [Gemini: preços](https://ai.google.dev/gemini-api/docs/pricing) e
  [disponibilidade](https://ai.google.dev/gemini-api/docs/deprecations).
  A geração 2.5 está restrita a usuários anteriores e foi retirada das sugestões.
  O Flash 3.1 Lite tem retirada anunciada para, no mínimo, 7 de maio de 2027.
  A promoção do Flash 3.8 termina em 31/12/2026: UI e estimativa passam de
  US$0,75/US$3,75 para US$1,50/US$7,50 automaticamente em 01/01/2027 UTC.
  Cotas gratuitas dependem da conta e não são tratadas como preço universal zero.
- [xAI: preços](https://docs.x.ai/developers/pricing),
  [Grok Build](https://docs.x.ai/developers/models/grok-build-0.1) e
  [retirada de modelos](https://docs.x.ai/developers/migration/may-15-retirement).
  Valores para prompts abaixo de 200 mil tokens; contextos maiores têm tarifa maior.
  Os antigos Grok Fast não são mais recomendados. Aliases antigos podem redirecionar
  para modelos com tarifas diferentes.

O rodapé acompanha a seleção atual e mostra um exemplo de **1.000 tokens de
entrada + 500 de saída**, calculado a partir desses preços. Não representa uma
média medida dos textos dos usuários. Para endpoints personalizados, o preço do
servidor não é presumido mesmo quando o ID coincide com um modelo conhecido.

## Qualidade, velocidade e custo

`src/modelBenchmarks.json` registra as referências publicadas pelo
[Artificial Analysis](https://artificialanalysis.ai/models), com um link específico
por modelo, variante de raciocínio e versão do Intelligence Index (v4.3.2).
Os dados foram consultados em 22/09/2026; podem incluir estimativas do próprio
publicador. O índice é uma referência geral, não uma nota específica de refino.
A velocidade é de geração em tokens/s e não inclui a espera pelo primeiro token.
Configuração, versão e roteamento do provedor podem produzir resultados diferentes.

Os três níveis da interface têm critérios explícitos:

- Qualidade: baixa <15; média de 15 a <30; alta ≥30 no índice publicado.
- Velocidade: baixa <60; média de 60 a <150; alta ≥150 tokens/s.
- Custo do exemplo acima: baixo ≤US$0,001; médio ≤US$0,003; alto >US$0,003.

O painel aparece para todas as seleções. Os 18 modelos têm preço; 17 têm uma
referência numérica de qualidade/velocidade. Não encontramos uma medição verificável
da variante exata `qwen/qwen3.5-flash-02-23`, portanto esses dois indicadores aparecem
sem nota. Modelos personalizados desconhecidos também mostram “não verificado”,
sem confundir ausência de dados com nota zero. IDs conhecidos preservam a referência
do benchmark mesmo em um endpoint personalizado; o custo permanece não verificado.

## Substituições locais de preço

O arquivo `prices.json` na pasta de configuração aceita substituições por ID:

```json
{
  "meu-modelo": { "input_per_1m": 0.2, "output_per_1m": 0.8 }
}
```

A aplicação combina o catálogo com esse arquivo em cada refino. Novos modelos
recebem seus preços mesmo quando o arquivo foi criado por uma versão anterior.
Edições existentes têm prioridade e não são sobrescritas. Remova uma entrada do
arquivo para voltar ao preço do catálogo; isso também se aplica aos valores
gravados automaticamente por versões antigas. Instalações novas criam `{}`,
evitando congelar os preços do catálogo no disco. A interface mostra os preços
públicos de referência, enquanto a estimativa de uso respeita as substituições.

Modelos personalizados sem preço conhecido usam uma estimativa genérica marcada
como aproximada. O contador de uso não substitui a fatura do provedor.

## Atualização e validação

O catálogo é uma consulta datada, não uma sincronização automática com as APIs.
Para atualizá-lo, consulte as fontes, confirme IDs e disponibilidade, revise
recomendações e notas, e atualize `checkedAt`. Preços futuros anunciados podem usar
`future_price`, com `effective_from` em `YYYY-MM-DD` UTC.

Os testes cobrem defaults válidos, preços compartilhados, início das novas tarifas,
preservação de substituições, troca de provedor e manutenção de modelos personalizados.
Nenhuma chamada paga é necessária para esses testes. Acesso real a cada modelo
continua dependendo da conta e é verificado pelo botão **Aplicar e testar**.
