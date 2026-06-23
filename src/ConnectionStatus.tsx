// ConnectionStatus.tsx — indicador de conexão no rodapé do rail.
//
// Mostra o logo do provedor + host + um ESTADO REAL de saúde da conexão com a API:
//   • verificando… (âmbar)   — testando o provedor
//   • conectado   (verde)    — o teste passou, está funcionando
//   • erro        (vermelho) — sem chave salva, ou o ping falhou
//
// A verificação é de verdade: checa a chave no cofre (get_api_key_status) e dá um
// ping no provedor (test_api_connection). Esse ping cria um ApiEngine próprio SEM
// usage tracker, então NÃO conta no contador de uso/custo. Roda ao montar, sempre
// que base/modelo mudam, e ao clicar no indicador (re-testar manualmente).
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ApiKeyStatus, Settings } from "./types";
import { ApiProviderIcon, providerName } from "./ApiProviderIcon";
import { t as translate } from "./i18n";
import { useT } from "./i18n/useT";

type Health = "checking" | "connected" | "error";

function hostOf(url: string): string {
  try { return new URL(url).host || url; } catch { return url || translate("conn.invalidProvider"); }
}
function dotClass(h: Health): string {
  return h === "connected" ? "ok" : h === "checking" ? "busy" : "bad";
}
function shortErr(e: string): string {
  const s = e.replace(/^Error:\s*/, "").trim();
  return s.length > 64 ? s.slice(0, 61) + "…" : s;
}

export default function ConnectionStatus({ settings }: { settings: Settings }) {
  const { t } = useT();
  const { api_base_url, api_model } = settings;
  const [health, setHealth] = useState<Health>("checking");
  const [detail, setDetail] = useState("");

  // Token de geração: ignora respostas de pings ANTIGOS (ex.: trocou de provedor e
  // re-testou — o resultado do host velho não pode "vencer" o do host novo).
  const genRef = useRef(0);
  const check = useCallback(() => {
    const myGen = ++genRef.current;
    setHealth("checking");
    setDetail("");
    invoke<ApiKeyStatus>("get_api_key_status")
      .then((s) => {
        if (myGen !== genRef.current) return;
        if (!s.saved) { setHealth("error"); setDetail(translate("conn.noKey")); return; }
        invoke<string>("test_api_connection", { baseUrl: api_base_url, model: api_model })
          .then(() => { if (myGen === genRef.current) { setHealth("connected"); setDetail(""); } })
          .catch((e) => { if (myGen === genRef.current) { setHealth("error"); setDetail(shortErr(String(e))); } });
      })
      .catch((e) => { if (myGen === genRef.current) { setHealth("error"); setDetail(shortErr(String(e))); } });
  }, [api_base_url, api_model]);

  // Verifica ao montar e sempre que base/modelo mudarem. Debounce de 300ms
  // coalesce mudanças quase simultâneas (ex.: o "Aplicar e testar" muda as
  // settings logo antes do próprio test_api_connection que ele já dispara),
  // evitando um segundo ping redundante ao provedor. O re-teste manual
  // (onClick=check) segue imediato (ver auditoria PERF-1).
  useEffect(() => {
    const t = setTimeout(check, 300);
    return () => clearTimeout(t);
  }, [check]);

  const host = hostOf(api_base_url);
  const name = providerName(host);
  const stateLabel = health === "checking" ? t("conn.checking") : health === "connected" ? t("conn.connected") : t("conn.disconnected");

  return (
    <button
      type="button"
      className={"conn api " + health}
      onClick={check}
      disabled={health === "checking"}
      title={
        health === "error" && detail
          ? t("conn.title.error", { name, detail })
          : t("conn.title.test", { name, host })
      }
    >
      <span className="conn-ico"><ApiProviderIcon host={host} /></span>
      <span className="conn-label">{stateLabel}</span>
      <span className={"conn-dot " + dotClass(health)} />
    </button>
  );
}
