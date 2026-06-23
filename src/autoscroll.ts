// autoscroll.ts — barra de rolagem custom em overlay.
//
// A scrollbar nativa do WebView2/Chromium é intrusiva (sempre visível) e seus
// pseudo-elementos `::-webkit-scrollbar` NÃO animam opacity. Então desenhamos um
// "thumb" próprio (um <div> position:fixed) que espelha cada scroller:
//   • retângulo fino (6px), preto, cantos levemente arredondados (4px);
//   • aparece com fade (.3s) ao rolar ou passar o mouse na área;
//   • some com fade depois de ~1.1s ocioso;
//   • arrastável; reposiciona em scroll/resize/mudança de conteúdo.
// Sem dependências. Funciona por janela (cada documento chama initAutoScrollbars).

const ATTACHED = new WeakSet<HTMLElement>();
const MIN_THUMB = 28; // altura mínima do thumb (px)
const IDLE_MS = 1100; // tempo ocioso até sumir

function attach(scroller: HTMLElement): void {
  if (ATTACHED.has(scroller)) return;
  ATTACHED.add(scroller);
  scroller.classList.add("has-cscroll"); // o CSS esconde a nativa

  const thumb = document.createElement("div");
  thumb.className = "cscroll-thumb";
  document.body.appendChild(thumb);

  let hideTimer = 0;
  let dragging = false;
  let hoveringThumb = false;

  const overflowOf = () => scroller.scrollHeight - scroller.clientHeight;

  function place(): void {
    if (!scroller.isConnected) { cleanup(); return; }
    const overflow = overflowOf();
    if (overflow <= 1) { thumb.style.display = "none"; return; }
    const ch = scroller.clientHeight;
    const rect = scroller.getBoundingClientRect();
    const th = Math.max(MIN_THUMB, (ch / scroller.scrollHeight) * ch);
    const maxTop = ch - th;
    const top = (scroller.scrollTop / overflow) * maxTop;
    thumb.style.display = "block";
    thumb.style.height = th + "px";
    thumb.style.top = rect.top + top + "px";
    thumb.style.left = rect.right - 8 + "px"; // 6px de largura + 2px da borda
  }

  function flash(): void {
    place();
    if (thumb.style.display === "none") return;
    thumb.classList.add("on");
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      if (!dragging && !hoveringThumb) thumb.classList.remove("on");
    }, IDLE_MS);
  }

  const onScroll = () => flash();
  const onPoint = () => flash();
  scroller.addEventListener("scroll", onScroll, { passive: true });
  scroller.addEventListener("pointerenter", onPoint);
  scroller.addEventListener("pointermove", onPoint);

  thumb.addEventListener("pointerenter", () => { hoveringThumb = true; thumb.classList.add("on"); });
  thumb.addEventListener("pointerleave", () => { hoveringThumb = false; flash(); });

  thumb.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    dragging = true;
    thumb.classList.add("on", "drag");
    try { thumb.setPointerCapture(e.pointerId); } catch { /* noop */ }
    const startY = e.clientY;
    const startScroll = scroller.scrollTop;
    const ch = scroller.clientHeight;
    const th = Math.max(MIN_THUMB, (ch / scroller.scrollHeight) * ch);
    const maxTop = Math.max(1, ch - th);
    const onMove = (ev: PointerEvent) => {
      const dy = ev.clientY - startY;
      scroller.scrollTop = startScroll + (dy / maxTop) * overflowOf();
    };
    const onUp = (ev: PointerEvent) => {
      dragging = false;
      thumb.classList.remove("drag");
      try { thumb.releasePointerCapture(ev.pointerId); } catch { /* noop */ }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      flash();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });

  const ro = new ResizeObserver(() => place());
  ro.observe(scroller);
  const mo = new MutationObserver(() => place());
  mo.observe(scroller, { childList: true, subtree: true, characterData: true });
  const onWinResize = () => place();
  window.addEventListener("resize", onWinResize);

  function cleanup(): void {
    ro.disconnect();
    mo.disconnect();
    window.removeEventListener("resize", onWinResize);
    scroller.removeEventListener("scroll", onScroll);
    scroller.removeEventListener("pointerenter", onPoint);
    scroller.removeEventListener("pointermove", onPoint);
    thumb.remove();
    ATTACHED.delete(scroller);
  }

  place();
}

// Scrollers conhecidos do app (janela principal + popup). Cobre todas as abas
// porque elas vivem dentro de `.main`.
const SELECTORS = ".main, .rail, .overlay, .result-body, .capture, .dd-list, .app-scroll";

export function initAutoScrollbars(): () => void {
  const scan = () => document.querySelectorAll<HTMLElement>(SELECTORS).forEach(attach);
  scan();
  // Scrollers que aparecem depois (dropdown aberto, resultado do popup).
  const mo = new MutationObserver(scan);
  mo.observe(document.body, { childList: true, subtree: true });
  return () => mo.disconnect();
}
