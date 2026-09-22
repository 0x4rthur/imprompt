import { useT } from "./i18n/useT";
import type { AppUpdater } from "./useAppUpdater";

export default function UpdateStatus({ updater }: { updater: AppUpdater }) {
  const { t } = useT();
  const total = updater.progress?.total;
  const percent = total && total > 0 ? Math.min(100, Math.floor(100 * (updater.progress?.downloaded ?? 0) / total)) : undefined;
  return <div className="update-status" aria-live="polite">
    {updater.error ? <p role="alert" className="field-err">{t("app.update.error", { error: updater.error })}</p>
      : updater.installing ? <>
        <p>{updater.progress?.phase === "installing" ? t("app.update.applying") : percent !== undefined ? t("app.update.progress", { percent }) : t("app.update.installing")}</p>
        <progress aria-label={t("app.update.downloadProgress")} max={100} value={updater.progress?.phase === "installing" ? 100 : percent} />
      </>
      : updater.checking ? <p>{t("app.update.checking")}</p>
      : updater.version ? <p>{t("app.update.title", { version: updater.version })}</p>
      : updater.checked ? <p>{t("app.update.current")}</p>
      : <p>{t("app.update.auto")}</p>}
  </div>;
}
