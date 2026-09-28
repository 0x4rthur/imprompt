// GeralTab.tsx — aba "Configurações": atualizações (versão em destaque), iniciar
// com o sistema, idioma, tema e o apoio ao projeto (card escuro). O estado real
// do autostart é a fonte da verdade do plugin; vive no App.
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import type { Settings } from "../types";
import { setLocale } from "../i18n";
import { applyTheme } from "../theme";
import Segmented from "../ui/Segmented";
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

  // Versão do app em destaque; falha silenciosa não quebra a aba.
  useEffect(() => {
    getVersion().then(setVersion).catch(console.error);
  }, []);

  return (
    <div className="page-stack page-fill">
      <div className="grid-2">
        {/* Atualizações: a versão instalada em destaque + status + ações. */}
        <section className="card upd" data-enter>
          <h2 className="card-title">{t("app.update.section")}</h2>
          <p className="ver">{version ? `v${version}` : "Imprompt"}{version && <small>{t("geral.version.installed")}</small>}</p>
          <UpdateStatus updater={updater} />
          <div className="api-row">
            <button className="btn-dl" disabled={updater.checking || updater.installing} onClick={updater.check}>{t("app.update.check")}</button>
            {updater.version && <button className="btn-dl primary" disabled={updater.checking || updater.installing} onClick={updater.install}>{t("app.update.btn")}</button>}
          </div>
        </section>

        <div className="page-stack">
          {/* Iniciar com o sistema (autostart) */}
          <section className="card" data-enter>
            <label className="switch-row">
              <span className="card-title">{t("geral.autostart")}</span>
              <input type="checkbox" className="switch" checked={autostart} onChange={(e) => toggleAutostart(e.target.checked)} />
            </label>
            {autostartErr && <div className="field-err" role="alert">{autostartErr}</div>}
            <p className="help">
              {autostart ? t("geral.autostart.on.help") : t("geral.autostart.off.help")}
            </p>
          </section>

          {/* Idioma da interface */}
          <section className="card" data-enter>
            <h2 className="card-title card-label">{t("geral.language")}</h2>
            <Segmented
              ariaLabel={t("geral.language")}
              value={settings.locale}
              onChange={(locale) => { setLocale(locale); update({ locale }); }}
              options={[{ value: "en", label: "English" }, { value: "pt-BR", label: "Português" }]}
            />
            <p className="help">{t("geral.language.help")}</p>
          </section>
        </div>
      </div>

      {/* Tema: segue o SO ou fixo em claro/escuro */}
      <section className="card row-card" data-enter>
        <div className="row-text">
          <h2 className="card-title">{t("geral.theme")}</h2>
          <p className="help">{t("geral.theme.help")}</p>
        </div>
        <Segmented
          ariaLabel={t("geral.theme")}
          value={settings.theme}
          onChange={(theme) => { applyTheme(theme); update({ theme }); }}
          options={(["system", "light", "dark"] as const).map((th) => ({ value: th, label: t(`geral.theme.${th}`) }))}
        />
      </section>

      {/* Apoiar o projeto — doação via Stripe (abre no navegador). */}
      <section className="support" data-enter>
        <span className="support-ico" aria-hidden="true"><HandHeartIcon size={20} /></span>
        <div className="support-text">
          <h2 className="support-title">{t("geral.support.title")}</h2>
          <p className="support-desc">{t("geral.support.desc")}</p>
        </div>
        <button className="donate" onClick={() => { invoke("open_url", { url: DONATE_URL }).catch(console.error); }}>
          <HandHeartIcon size={17} />
          {t("geral.support.button")}
        </button>
      </section>
    </div>
  );
}
