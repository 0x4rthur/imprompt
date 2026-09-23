// GeralTab.tsx — aba "Geral": iniciar com o sistema (autostart) + idioma da UI.
// O estado real do autostart é a fonte da verdade do plugin; vive no App.
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import type { Settings } from "../types";
import { setLocale } from "../i18n";
import { useT } from "../i18n/useT";
import HandHeartIcon from "../HandHeartIcon";
import UpdateStatus from "../UpdateStatus";
import type { AppUpdater } from "../useAppUpdater";

// Link de pagamento da Stripe (doação), aberto no navegador via `open_url`.
// Link de PRODUÇÃO — recebe doações reais.
const DONATE_URL = "https://donate.stripe.com/4gM7sK4Tz23E0JAbUl93y00";

type Props = {
  autostart: boolean;
  toggleAutostart: (on: boolean) => void;
  autostartErr: string;
  settings: Settings;
  update: (patch: Partial<Settings>) => Promise<void>;
  updater: AppUpdater;
};

export default function GeralTab({ autostart, toggleAutostart, autostartErr, settings, update, updater }: Props) {
  const { t } = useT();
  const [version, setVersion] = useState("");

  // Versão do app pro rodapé; falha silenciosa não quebra a aba.
  useEffect(() => {
    getVersion().then(setVersion).catch(console.error);
  }, []);

  return (
    <section className="card">
      <div className="field">
        <h2 className="sec-title">{t("app.update.section")}</h2>
        <p className="help">{version ? t("app.update.installed", { version }) : "Imprompt"}</p>
        <UpdateStatus updater={updater} />
        <div className="api-row">
          <button className="btn-dl" disabled={updater.checking || updater.installing} onClick={updater.check}>{t("app.update.check")}</button>
          {updater.version && <button className="btn-dl primary" disabled={updater.checking || updater.installing} onClick={updater.install}>{t("app.update.btn")}</button>}
        </div>
      </div>
      {/* Iniciar com o sistema (autostart) */}
      <div className="field">
        <label className="switch-row">
          <span className="sec-title">{t("geral.autostart")}</span>
          <input type="checkbox" className="switch" checked={autostart} onChange={(e) => toggleAutostart(e.target.checked)} />
        </label>
        {autostartErr && <div className="field-err" role="alert">{autostartErr}</div>}
        <p className="help">
          {autostart ? t("geral.autostart.on.help") : t("geral.autostart.off.help")}
        </p>
      </div>

      {/* Idioma da interface */}
      <div className="field">
        <h2 className="sec-title">{t("geral.language")}</h2>
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
        <h2 className="support-title">{t("geral.support.title")}</h2>
        <p className="support-desc">{t("geral.support.desc")}</p>
        <button className="donate" onClick={() => { invoke("open_url", { url: DONATE_URL }).catch(console.error); }}>
          <HandHeartIcon size={18} />
          {t("geral.support.button")}
        </button>
      </div>

    </section>
  );
}
