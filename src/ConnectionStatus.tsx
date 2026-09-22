// ConnectionStatus.tsx — indicador de conexão no rodapé do rail.
//
// Mostra o logo do provedor + host + um ESTADO REAL de saúde da conexão com a API:
//   • verificando… (âmbar)   — testando o provedor
//   • conectado   (verde)    — o teste passou, está funcionando
//   • erro        (vermelho) — sem chave salva, ou o ping falhou
//
// Shares probes/results with the API form. The backend resolves the credential
// for this endpoint (optional on localhost). A click explicitly refreshes health.
import { useEffect, useSyncExternalStore } from "react";
import type { Settings } from "./types";
import { apiConfig, configId, connection } from "./connection";
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
  const { api_base_url } = settings;
  const config = apiConfig(settings);
  const id = configId(config);
  const { health, detail } = useSyncExternalStore(connection.subscribe, () => connection.snapshot(config));
  useEffect(() => {
    void connection.check(config);
  }, [id]);

  const host = hostOf(api_base_url);
  const name = providerName(host);
  const stateLabel = health === "checking" ? t("conn.checking") : health === "connected" ? t("conn.connected") : t("conn.disconnected");

  return (
    <button
      type="button"
      className={"conn api " + health}
      onClick={() => void connection.check(config, true)}
      disabled={health === "checking"}
      title={
        health === "error" && detail
          ? t("conn.title.error", { name, detail: shortErr(detail) })
          : t("conn.title.test", { name, host })
      }
    >
      <span className="conn-ico"><ApiProviderIcon host={host} /></span>
      <span className="conn-label">{stateLabel}</span>
      <span className={"conn-dot " + dotClass(health)} />
    </button>
  );
}
