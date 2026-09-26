// theme.js — aplica o tema ANTES do primeiro paint (script clássico, síncrono,
// carregado no <head> das três janelas: Preferências, popup e loader).
//
// A escolha do usuário ("system" | "light" | "dark") vive nas settings do backend;
// aqui usamos um espelho no localStorage (mesma origem nas três janelas) só pra
// não piscar o tema errado enquanto o bundle carrega. O <html> recebe SEMPRE o
// tema resolvido em data-theme="light|dark" — o CSS só olha pra ele.
(function () {
  var KEY = "imprompt.theme";
  var mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function read() {
    try { return localStorage.getItem(KEY) || "system"; } catch (e) { return "system"; }
  }

  function apply(pref) {
    var dark = pref === "dark" || (pref !== "light" && !!(mq && mq.matches));
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  }

  // API pro bundle (src/theme.ts): grava o espelho e aplica na hora.
  window.__impromptTheme = {
    set: function (pref) {
      try { localStorage.setItem(KEY, pref); } catch (e) {}
      apply(pref);
    },
  };

  apply(read());
  // "Sistema": acompanha a troca de tema do SO ao vivo.
  if (mq) {
    var onChange = function () { apply(read()); };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
  // Outra janela trocou o tema (ex.: Preferências) → popup/loader seguem ao vivo.
  window.addEventListener("storage", function (e) { if (e.key === KEY) apply(read()); });
})();
