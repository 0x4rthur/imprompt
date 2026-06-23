// ApiProviderIcon.tsx — logo do provedor (por host) + nome. FONTE ÚNICA (seletor
// da aba API e rail de conexão). Marcas COLORIDAS e ANIMADAS no hover — as animações
// vivem no CSS (sem libs; gatilho = hover de .prov-pill / .nav-item). Glyphs de marca
// readaptados do itshover (que usa a lib `motion`) para SVG + CSS puro.

import { t } from "./i18n";

type IconProps = { host: string; size?: number };

// Nome amigável do provedor pelo host (ex.: "api.openai.com" → "OpenAI").
// Nomes de marca ficam hardcoded; só o fallback genérico é localizado.
export function providerName(host: string): string {
  const h = (host || "").toLowerCase();
  if (h.includes("openai")) return "OpenAI";
  if (h.includes("openrouter")) return "OpenRouter";
  if (h.includes("deepseek")) return "DeepSeek";
  if (h.includes("anthropic")) return "Anthropic";
  if (h.includes("mistral")) return "Mistral";
  if (h.includes("together")) return "Together AI";
  if (h.includes("perplexity")) return "Perplexity";
  if (h.includes("x.ai")) return "xAI";
  if (h.includes("googleapis") || h.includes("generativelanguage") || h.includes("gemini")) return "Google Gemini";
  return host || t("conn.providerFallback");
}

// OpenAI — traço (6 arcos); anima "redesenhando" no hover (stroke-dashoffset).
function OpenAILogo({ size }: { size: number }) {
  const paths = [
    "M11.217 19.384a3.501 3.501 0 0 0 6.783 -1.217v-5.167l-6 -3.35",
    "M5.214 15.014a3.501 3.501 0 0 0 4.446 5.266l4.34 -2.534v-6.946",
    "M6 7.63c-1.391 -.236 -2.787 .395 -3.534 1.689a3.474 3.474 0 0 0 1.271 4.745l4.263 2.514l6 -3.348",
    "M12.783 4.616a3.501 3.501 0 0 0 -6.783 1.217v5.067l6 3.45",
    "M18.786 8.986a3.501 3.501 0 0 0 -4.446 -5.266l-4.34 2.534v6.946",
    "M18 16.302c1.391 .236 2.787 -.395 3.534 -1.689a3.474 3.474 0 0 0 -1.271 -4.745l-4.308 -2.514l-5.955 3.42",
  ];
  return (
    <svg className="ico ico-openai" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="#10A37F" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-label="OpenAI" role="img">
      {paths.map((d, i) => <path key={i} className="oai-draw" pathLength={1} d={d} />)}
    </svg>
  );
}
// Anthropic — "A" + barra; a barra dá um pulse (skew/scale) no hover.
function AnthropicLogo({ size }: { size: number }) {
  return (
    <svg className="ico ico-anthropic" viewBox="0 0 24 24" width={size} height={size} fill="#D97757" aria-label="Anthropic" role="img">
      <path d="M6.57 3.52h3.767L16.906 20h-3.674l-1.343-3.461H5.017L3.673 20H0L6.57 3.522zm4.132 9.959L8.453 7.687 6.205 13.48H10.7z" />
      <path className="ant-i" d="M13.827 3.52h3.603L24 20h-3.603l-6.57-16.48z" />
    </svg>
  );
}
// OpenRouter — sem ícone do itshover; mantém a marca + zoom leve no hover.
function OpenRouterLogo({ size }: { size: number }) {
  return (
    <svg className="ico ico-openrouter" viewBox="0 0 24 24" width={size} height={size} fill="#64748B" aria-label="OpenRouter" role="img">
      <path d="M16.778 1.844v1.919q-.569-.026-1.138-.032-.708-.008-1.415.037c-1.93.126-4.023.728-6.149 2.237-2.911 2.066-2.731 1.95-4.14 2.75-.396.223-1.342.574-2.185.798-.841.225-1.753.333-1.751.333v4.229s.768.108 1.61.333c.842.224 1.789.575 2.185.799 1.41.798 1.228.683 4.14 2.75 2.126 1.509 4.22 2.11 6.148 2.236.88.058 1.716.041 2.555.005v1.918l7.222-4.168-7.222-4.17v2.176c-.86.038-1.611.065-2.278.021-1.364-.09-2.417-.357-3.979-1.465-2.244-1.593-2.866-2.027-3.68-2.508.889-.518 1.449-.906 3.822-2.59 1.56-1.109 2.614-1.377 3.978-1.466.667-.044 1.418-.017 2.278.02v2.176L24 6.014Z" />
    </svg>
  );
}
// DeepSeek — animação PRÓPRIA (simples): um "swim" / wiggle no hover.
function DeepSeekLogo({ size }: { size: number }) {
  return (
    <svg className="ico ico-deepseek" viewBox="0 0 24 24" width={size} height={size} fill="#4D6BFE" aria-label="DeepSeek" role="img">
      <path d="M23.748 4.651c-.254-.124-.364.113-.512.233-.051.04-.094.09-.137.137-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.155-.708-.311-.955-.65-.172-.24-.219-.509-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.094.172.187.129.323-.082.28-.18.553-.266.833-.055.179-.137.218-.328.14a5.5 5.5 0 0 1-1.737-1.179c-.857-.828-1.631-1.743-2.597-2.46a12 12 0 0 0-.689-.47c-.985-.957.13-1.743.387-1.836.27-.098.094-.433-.778-.428-.872.003-1.67.295-2.687.685a3 3 0 0 1-.465.136 9.6 9.6 0 0 0-2.883-.101c-1.885.21-3.39 1.1-4.497 2.622C.082 8.776-.231 10.854.152 13.02c.403 2.284 1.568 4.175 3.36 5.653 1.857 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.132-.284 4.994-1.86.47.234.962.328 1.78.398.629.058 1.235-.031 1.705-.129.735-.155.684-.836.418-.961-2.155-1.004-1.682-.595-2.112-.926 1.095-1.295 2.768-3.598 3.284-6.733.05-.346.115-.834.108-1.114-.004-.171.035-.238.23-.257a4.2 4.2 0 0 0 1.545-.475c1.397-.763 1.96-2.016 2.093-3.517.02-.23-.004-.467-.247-.588M11.58 18.168c-2.088-1.642-3.101-2.183-3.52-2.16-.39.024-.32.472-.234.763.09.288.207.487.371.74.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.168-1.361-.801-2.5-1.86-3.301-3.306-.775-1.393-1.225-2.888-1.299-4.482-.02-.385.094-.522.477-.592a4.7 4.7 0 0 1 1.53-.038c2.131.311 3.946 1.264 5.467 2.774.868.86 1.525 1.887 2.202 2.89.72 1.066 1.494 2.082 2.48 2.915.348.291.626.513.892.677-.802.09-2.14.109-3.055-.615zm1.001-6.44a.306.306 0 0 1 .415-.287.3.3 0 0 1 .113.074.3.3 0 0 1 .086.214c0 .17-.136.307-.308.307a.303.303 0 0 1-.306-.307m3.11 1.596c-.2.081-.4.151-.591.16a1.25 1.25 0 0 1-.798-.254c-.274-.23-.47-.358-.551-.758a1.7 1.7 0 0 1 .015-.588c.07-.327-.007-.537-.238-.727-.188-.156-.426-.199-.689-.199a.6.6 0 0 1-.254-.078.253.253 0 0 1-.114-.358 1 1 0 0 1 .192-.21c.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.392.451.462.576.685.915.176.264.336.536.446.848.066.194-.02.353-.25.45" />
    </svg>
  );
}
// Gemini — estrela; gira 180° + leve zoom no hover.
function GeminiLogo({ size }: { size: number }) {
  return (
    <svg className="ico ico-gemini" viewBox="0 0 24 24" width={size} height={size} fill="#8E75B2" aria-label="Google Gemini" role="img">
      <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" />
    </svg>
  );
}
// xAI — "X" em 4 partes; explode pra fora e volta no hover.
function XaiLogo({ size }: { size: number }) {
  return (
    <svg className="ico ico-xai" viewBox="0 0 24 24" width={size} height={size} fill="#18181b" aria-label="xAI" role="img">
      <path className="xai-1" d="M6.469 8.776L16.512 23h-4.464L2.005 8.776H6.47z" />
      <path className="xai-2" d="M6.465 16.676l2.233 3.164L6.467 23H2l4.465-6.324z" />
      <path className="xai-3" d="M22 1l-9.952 14.095-2.233-3.163L17.533 1H22z" />
      <path className="xai-4" d="M22 2.582V23h-3.659V7.764L22 2.582z" />
    </svg>
  );
}
// Glifo genérico (nuvem) pros provedores sem marca conhecida.
function GenericLogo({ size }: { size: number }) {
  return (
    <svg className="ico ico-generic" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-label="API" role="img">
      <path d="M7 18a4 4 0 0 1-.3-7.99A5 5 0 0 1 16.6 8.6 3.5 3.5 0 0 1 18 18z" />
    </svg>
  );
}

export function ApiProviderIcon({ host, size = 18 }: IconProps) {
  const h = (host || "").toLowerCase();
  if (h.includes("openai")) return <OpenAILogo size={size} />;
  if (h.includes("anthropic")) return <AnthropicLogo size={size} />;
  if (h.includes("openrouter")) return <OpenRouterLogo size={size} />;
  if (h.includes("deepseek")) return <DeepSeekLogo size={size} />;
  if (h.includes("x.ai")) return <XaiLogo size={size} />;
  if (h.includes("googleapis") || h.includes("generativelanguage") || h.includes("gemini")) return <GeminiLogo size={size} />;
  return <GenericLogo size={size} />;
}
