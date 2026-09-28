// popup.tsx — entrada da janela do popup (modo "Mostrar popup"). O componente
// vive em Palette.tsx (testável); aqui só montamos com as fontes, o CSS e a
// configuração de movimento (respeita o "reduzir animações" do sistema).
import ReactDOM from "react-dom/client";
import { MotionConfig } from "motion/react";
import Palette from "./Palette";
import "./fonts";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <MotionConfig reducedMotion="user">
    <Palette />
  </MotionConfig>
);
