import { useT } from "./i18n/useT";
import type { AppUpdater } from "./useAppUpdater";

export default function UpdateStatus({ updater }: { updater: AppUpdater }) {
  const { t } = useT();
  const total = updater.progress?.total;
  const percent = total && total > 0 ? Math.min(100, Math.floor(100 * (updater.progress?.downloaded ?? 0) / total)) : undefined;
  // Tentando de novo (a conexão caiu): dito ao lado do progresso, pra não parecer travado.
  const attempt = updater.progress?.attempt ?? 1;
  const downloading = (percent !== undefined ? t("app.update.progress", { percent }) : t("app.update.installing"))
    + (attempt > 1 ? " · " + t("app.update.attempt", { attempt }) : "");
  return <div className="update-status" aria-live="polite">
    {updater.error ? <p role="alert" className="field-err">{t("app.update.error", { error: updater.error })}</p>
      : updater.installing ? <>
        <p>{updater.progress?.phase === "installing" ? t("app.update.applying") : downloading}</p>
        <progress aria-label={t("app.update.downloadProgress")} max={100} value={updater.progress?.phase === "installing" ? 100 : percent} />
      </>
      : updater.checking ? <p>{t("app.update.checking")}</p>
      : updater.version ? <p>{t("app.update.title", { version: updater.version })}</p>
      : updater.checked ? <p>{t("app.update.current")}</p>
      : <p>{t("app.update.auto")}</p>}
  </div>;
}
