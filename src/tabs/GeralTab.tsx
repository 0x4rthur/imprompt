// GeralTab.tsx — aba "Geral": iniciar com o sistema (autostart).
// O estado real do autostart é a fonte da verdade do plugin; vive no App.
import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";

type Props = {
  autostart: boolean;
  toggleAutostart: (on: boolean) => void;
  autostartErr: string;
};

export default function GeralTab({ autostart, toggleAutostart, autostartErr }: Props) {
  const [version, setVersion] = useState("");

  // Versão do app pro rodapé; falha silenciosa não quebra a aba.
  useEffect(() => {
    getVersion().then(setVersion).catch(console.error);
  }, []);

  return (
    <section className="card">
      {/* Iniciar com o sistema (autostart) */}
      <div className="field">
        <label>Iniciar com o sistema</label>
        <div className="seg" role="group" aria-label="Iniciar com o sistema">
          <button aria-pressed={!autostart} className={!autostart ? "active" : ""} onClick={() => toggleAutostart(false)}>Não</button>
          <button aria-pressed={autostart} className={autostart ? "active" : ""} onClick={() => toggleAutostart(true)}>Sim</button>
        </div>
        {autostartErr && <div className="field-err">✗ {autostartErr}</div>}
        <p className="help">
          {autostart
            ? "O Imprompt abre junto com o sistema, já escondido na bandeja, pronto pro Ctrl+C×2."
            : "Abra o Imprompt manualmente quando quiser usá-lo."}
        </p>
      </div>
      {version && <p className="foot">Imprompt v{version}</p>}
    </section>
  );
}
