# Design — Reestilização "Soft UI" (Preferências, popup e loader)

**Data:** 2026-09-28
**Status:** aprovado (mockups no companion visual; escolhas do usuário registradas abaixo)

## Objetivo

Reestilizar o Imprompt inteiro seguindo, com fidelidade, a linguagem visual das referências
(app de fitness em "soft UI": fundo cinza claro, cards quase brancos flutuando sobre sombras
longas e suaves, trilhos afundados, seletores em trilho com a peça ativa elevada, menu
grafite com o item ativo claro, blocos com ícone dentro de um quadrado claro, títulos enormes
e apertados, gráficos limpos) **sem copiar o conteúdo** e **sem o laranja** da referência.
Todo canto do app muda: janela de Preferências (6 abas), popup e a janelinha "Imprompting…".
Movimento fluido e com propósito em tudo, principalmente no popup.

Sucesso = o usuário reconhece a referência no Imprompt, nos dois temas, e nada do
funcionamento muda (fluxos, dados, atalhos, testes).

## Decisões do usuário

| Tema | Decisão |
|---|---|
| Cores | As do Imprompt (neutros frios, matiz 286; tinta; sinais mint/âmbar/vermelho; matiz por preset). Onde a referência usa laranja, entra a **tinta** (preto no claro, quase branco no escuro). |
| Tipografia | **Sans geométrica (Plus Jakarta Sans)** em títulos e interface; **JetBrains Mono** só em dados da máquina (atalhos, modelo, URL, chave, texto do usuário, resultado). |
| Arredondamento | **B · leve**: card 12px, bloco (tile) 10px, controle 8px, chip 7px, tecla 5px. Os círculos da referência viram **quadrados arredondados** (eco do `[I]`). |
| Movimento | Biblioteca **Motion** (`motion/react`), molas; respeita "reduzir animações" do sistema. |
| Início | Título que mostra o estado; card do atalho + 4 blocos de configuração **alinhados com o fundo** do painel "Último imprompt"; "Este mês" com card de tokens **só com dados** (sem arcos), gráfico de meses com seletor **Custo · Imprompts**, card escuro de imprompts com linha. |
| Loader | **Variante A**: logo animado (colchetes abrem, linha cinza aparece, o "I" lê da esquerda para a direita, colchetes fecham), "Imprompting" parado + pontinhos. Janela 210→**224×46**. |
| Liberdade | O usuário autorizou aplicar melhorias percebidas durante a implementação. |

## Sistema visual

Tokens em `src/styles.css`; `:root` = claro, `:root[data-theme="dark"]` = escuro (mecanismo de
`public/theme.js` inalterado). Nenhum componente usa cor literal.

### Superfícies e sombras

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--canvas` | `oklch(.952 .004 286)` | `oklch(.17 .005 286)` | fundo das janelas (+ brilho radial `--glow` no topo) |
| `--card` | `oklch(.995 .001 286)` | `oklch(.235 .006 286)` | superfícies elevadas |
| `--sunken` / `--sunken-2` | `.926` / `.902` | `.145` / `.128` | trilhos, blocos, campos, áreas afundadas |
| `--panel` | `.935` | `.155` | painel "Último imprompt" |
| `--rail-1` → `--rail-2` | `.44` → `.285` | `.275` → `.215` | menu grafite (gradiente vertical) |
| `--dark-1` → `--dark-2` | `.43` → `.27` | `.36` → `.265` | card escuro (imprompts, apoio) |
| `--sh-card` | camadas suaves 1/3/14px | 1/16px, preto | elevação padrão |
| `--sh-lift` | maior | maior | hover de card/botão |
| `--sh-float` | 20–44px | 24–48px | menu, popovers, barras flutuantes |
| `--hl` | `inset 0 1px 0 branco .95` | `branco .07` | brilho da borda superior de peças elevadas |
| `--inset` | sombra interna leve | sombra interna escura | peças afundadas |

Tinta, rampa de texto e sinais continuam os mesmos (`--ink`, `--body`, `--dim`, `--stone`,
`--faint`, `--mint*`, `--amber*`, `--danger*`), com `--faint`/`--stone` ajustados para
manter ≥ 4.5:1 sobre `--canvas` (mais escuro que o fundo antigo).

### Tipografia

- `--sans`: Plus Jakarta Sans (400/500/600/700, latin + latin-ext, empacotada via @fontsource).
- `--mono`: JetBrains Mono (inalterada).
- Escala: título de página 38px/600 (Início: 44px — o mockup usava 46; 44 mantém "Connect your API." numa linha até a janela estreitar pra 860px), −0.045em; h2 19px; título de card 14.5px/600;
  corpo 13px; ajuda 12.5px; rótulos 11.5px; micro-rótulo 10–10.5px maiúsculo espaçado.
- Números: `font-variant-numeric: tabular-nums`.
- Os colchetes `[ Título ]` saem dos títulos de seção (o `[I]` fica no menu e no popup).

### Componentes

- **Botões**: primário (tinta, sombra própria), secundário (card elevado; **sobre card vira
  bloco cinza sem sombra**), fantasma, perigo. Hover sobe 1px; clique encolhe para .97.
- **Seletor segmentado** (`Segmented`): trilho afundado; a peça clara **desliza** (layoutId).
  Botões com `aria-pressed`.
- **Chave** (`input.switch`): retangular (raio 8), knob quadrado arredondado; checkbox nativo.
- **Campos**: afundados, sem borda; foco = card + anel. Somente leitura = contorno fino.
- **Lista suspensa**: botão elevado; lista flutuante que cresce do topo; itens em cascata.
- **Blocos (tiles)**: afundados, com um quadrado elevado contendo o ícone e o rótulo embaixo.
  Seleção = **contorno de tinta que desliza** entre blocos (preset padrão, provedor).
- **Teclas** (`kbd`): elevadas, mono.
- **Etiquetas**: preset (matiz), status (mint), selos (tinta / afundado).

## Telas

### Janela de Preferências (920×720)

- **Menu** grafite flutuante (100px, margem 12px, raio 18): logo `[I]` no topo; itens com ícone
  num bloco de 42px + rótulo embaixo; **bloco claro único desliza** até o item ativo; rodapé com
  Configurações e o status da conexão (logo do provedor num bloco claro + ponto mint com pulso).
  Os ícones mantêm as micro-animações de hover.
- **Barra de título**: controles minimizar/fechar em quadrados de 30×26 (fechar fica vermelho).
- **Troca de aba**: a aba nova entra na hora (sem esperar saída, para não atrasar a UI/testes)
  com as seções em cascata vindo de baixo ou de cima conforme a direção do menu.

### Início

Topo em duas colunas **de mesma altura**:
- Esquerda: título de estado ("Tudo pronto." / "Um instante…" / "Falta conectar a API."),
  subtítulo; **card do gesto** (afundado, estica para alinhar): "Selecione um texto em qualquer
  app e aperte" + teclas `Ctrl + C ×2` + modo e saída; botão de tinta para o Atalho. Sem conexão,
  o card vira o chamado para configurar a API. Embaixo, **4 blocos**: API (logo + provedor),
  Preset (ponto + nome), Saída, Tema — cada um leva à aba correspondente.
- Direita: **painel "Último imprompt"** (etiqueta de tinta no topo): texto original (bloco
  afundado à direita) + tempo relativo; resultado (card elevado à esquerda) com a etiqueta do
  preset; botão "Ver no Histórico". Vazio: instrução com as teclas.

"Este mês" (título + seletor **Custo · Imprompts**):
- Card de **tokens só com dados**: linhas Entrada/Saída (valor + %) e total do mês.
- Card de **meses**: barras finas verticais (trilho + preenchimento; mês atual em tinta),
  rótulo e valor embaixo; o seletor troca custo ↔ imprompts.
- **Card escuro**: imprompts do mês + custo por imprompt + linha dos meses (se ≥ 2 meses).

### Histórico
Grupos por dia (micro-rótulo); cada imprompt é um card: hora, etiqueta do preset, prévia,
chevron num quadrado; abre com altura animada mostrando Original (afundado) e Resultado
(contorno) + "Copiar resultado" (troca para "Copiado ✓" deslizando). Vazio: card instrutivo.

### Presets
Card "Preset padrão" com blocos (grade auto) e contorno deslizante; card "Presets" com linhas
(ponto, nome, selos PADRÃO/EDITADO, Editar, Duplicar, lixeira com confirmação) e o formulário
abrindo dentro do card; "+ Novo preset" e "Restaurar padrões" (confirmação em 2 cliques);
card da chave "Usar exemplos".

### API
Card Provedor: 7 blocos com logo (6 provedores + Personalizado) e contorno deslizante; faixa
âmbar de privacidade; formato (se personalizado) e Base URL. Card Modelo: lista suspensa + ficha
(afundada) com os 3 eixos do benchmark em mini-cards, preços e detalhes. Card Chave. Card
"Priorizar velocidade". Notas. **Barra de aplicar flutuante** fixa no rodapé (primário + selo
"Conectado" que surge com mola, ou o erro).

### Atalho
Card do atalho: gravador (teclas elevadas numa área afundada, cursor piscando ao gravar),
slider da janela entre toques (trilho afundado, preenchimento de tinta, knob quadrado),
ajuda. Dois cards lado a lado: "Quando ativar" e "O que fazer com o resultado" (segmentados).

### Configurações
Duas colunas: Atualizações (versão grande + status + botão); Iniciar com o sistema + Idioma.
Tema (texto à esquerda, segmentado à direita). Card escuro "Apoiar o Imprompt" com botão claro.

### Popup (496×430, redimensionável dentro dos limites atuais)
Fundo `--canvas`. Cabeçalho (logo, "Imprompt", `Esc`). Texto capturado em bloco afundado (2
linhas, expandir). Presets num trilho afundado com a **peça clara deslizante**, número em
quadrado (ativo = tinta). Resultado em card elevado (selo "API · modelo"); erro em card
vermelho suave. **Rodapé flutuante** (card): nota de destino + ações.

### Loader (224×46)
Card com o **logo animado (variante A)** + "Imprompting" + pontinhos. CSS puro em
`loader.html`. Com "reduzir animações": logo parado.

## Movimento

- Molas (Motion): `snappy` (indicadores deslizantes), `soft` (entradas), `pop` (selos/números).
  CSS: `--spring` (`linear()`) para transições de knob/hover; `--out` (expo).
- Entradas: seções em cascata (45ms), 16px na direção da navegação.
- Início: números contam (0→valor), barras crescem em cascata, linha se desenha.
- Popup: abre com escala .965→1 + cascata; preset desliza e o número pula; Imprompt → botão
  "Imprompting" com pontinhos + card com esqueleto brilhante; resultado → card cresce até o
  texto e o texto se revela de cima para baixo; ações entram da direita em cascata; Copiar →
  "Copiado ✓"; Aplicar → encolhe e some antes de colar; erro → tremida curta; Esc → fade.
- `MotionConfig reducedMotion="user"` + `@media (prefers-reduced-motion)` para CSS.

## Textos novos (EN + pt-BR, paridade obrigatória)

Título de estado do Início, card do gesto, rótulos dos 4 blocos, "Último imprompt",
"Ver no Histórico", vazio do painel, seletor Custo/Imprompts, "Tokens no mês",
"Imprompts por mês", "~US$ {cost} cada", saída abreviada (Substitui/Copia).

## Arquitetura e arquivos

- `package.json`: + `motion`, + `@fontsource/plus-jakarta-sans`.
- `src/fonts.ts`: + Plus Jakarta Sans.
- `src/motion.ts`: molas, `stagger`, `usePageEnter`, `useCountUp`, detecção de ambiente sem
  animação (jsdom) para os testes.
- `src/ui/Segmented.tsx` (novo), ícones compartilhados em `src/ui/icons.tsx`.
- `src/styles.css`: reescrito (tokens + componentes + telas + popup).
- `src/App.tsx`, `src/tabs/*.tsx`, `src/ConnectionStatus.tsx`, `src/ModelBenchmark.tsx`,
  `src/UpdateStatus.tsx`: nova marcação.
- `src/popup.tsx` → `src/Palette.tsx` (componente testável) + `src/popup.tsx` (entrada).
- `loader.html`: logo animado; `src-tauri/src/lib.rs`: loader 224×46.
- `src/dev/tauri-mock/*` + `vite --mode mock` (`npm run dev:mock`): renderiza as janelas no
  navegador com dados de exemplo, para verificação visual. Não entra no build de produção.
- Docs: `docs/DESIGN.md` e `docs/PRODUCT.md` atualizados.

## Preservado (não quebrar)

Fluxos e dados; atalhos do popup (Enter refina/aplica, R refaz, 1–9, Esc, auto-repeat ignorado);
focus trap e foco inicial do popup; reuso da janela do popup (`captured-text`); arraste pelas
barras; i18n; MotorTab montada escondida (preserva rascunhos); nomes acessíveis usados pelos
testes ("Settings", "API", "Apply and test", "Prioritize speed", "Connected" ×2, "Model",
"Custom", "API key", "Base URL", "API format", "Model id", "Check for updates",
"Download and restart", "Testing…"); `data-testid="model-cost-note"`.

## Verificação

`npm run typecheck`, `npm test` (existentes + novos: Segmented, Início, Palette), `npm run build`,
`cargo fmt/clippy/test`; conferência visual de todas as telas nos dois temas e idiomas via
`dev:mock` no navegador; build do app Tauri.
