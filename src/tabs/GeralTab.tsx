// GeralTab.tsx — aba "Geral": iniciar com o sistema (autostart) + idioma da UI.
// O estado real do autostart é a fonte da verdade do plugin; vive no App.
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import type { Settings } from "../types";
import { setLocale } from "../i18n";
import { useT } from "../i18n/useT";
import HandHeartIcon from "../HandHeartIcon";

// Link de pagamento da Stripe (doação), aberto no navegador via `open_url`.
// Link de PRODUÇÃO — recebe doações reais.
const DONATE_URL = "https://donate.stripe.com/4gM7sK4Tz23E0JAbUl93y00";

type Props = {
  autostart: boolean;
  toggleAutostart: (on: boolean) => void;
  autostartErr: string;
  settings: Settings;
  update: (patch: Partial<Settings>) => Promise<void>;
};

export default function GeralTab({ autostart, toggleAutostart, autostartErr, settings, update }: Props) {
  const { t } = useT();
  const [version, setVersion] = useState("");

  // Versão do app pro rodapé; falha silenciosa não quebra a aba.
  useEffect(() => {
    getVersion().then(setVersion).catch(console.error);
  }, []);

  return (
    <section className="card">
      {/* Iniciar com o sistema (autostart) */}
      <div className="field">
        <label>{t("geral.autostart")}</label>
        <div className="seg" role="group" aria-label={t("geral.autostart")}>
          <button aria-pressed={!autostart} className={!autostart ? "active" : ""} onClick={() => toggleAutostart(false)}>{t("geral.autostart.no")}</button>
          <button aria-pressed={autostart} className={autostart ? "active" : ""} onClick={() => toggleAutostart(true)}>{t("geral.autostart.yes")}</button>
        </div>
        {autostartErr && <div className="field-err">✗ {autostartErr}</div>}
        <p className="help">
          {autostart ? t("geral.autostart.on.help") : t("geral.autostart.off.help")}
        </p>
      </div>

      {/* Idioma da interface */}
      <div className="field">
        <label>{t("geral.language")}</label>
        <div className="seg" role="group" aria-label={t("geral.language")}>
          <button aria-pressed={settings.locale === "en"} className={settings.locale === "en" ? "active" : ""}
                  onClick={() => { setLocale("en"); update({ locale: "en" }); }}>English</button>
          <button aria-pressed={settings.locale === "pt-BR"} className={settings.locale === "pt-BR" ? "active" : ""}
                  onClick={() => { setLocale("pt-BR"); update({ locale: "pt-BR" }); }}>Português</button>
        </div>
        <p className="help">{t("geral.language.help")}</p>
      </div>

      {/* Apoiar o projeto — doação via Stripe (abre no navegador). */}
      <div className="support">
        <p className="support-title">{t("geral.support.title")}</p>
        <p className="support-desc">{t("geral.support.desc")}</p>
        <button className="donate" onClick={() => { invoke("open_url", { url: DONATE_URL }).catch(console.error); }}>
          <HandHeartIcon size={18} />
          {t("geral.support.button")}
        </button>
      </div>

      {version && <p className="foot">Imprompt v{version}</p>}
    </section>
  );
}
