// noContextMenu.ts — desabilita o menu de contexto padrão do WebView2 (Voltar,
// Atualizar, Salvar como, Imprimir, Inspecionar…), que não faz sentido num app
// desktop. Mantém o menu nativo de edição DENTRO de campos de texto (copiar/colar),
// útil pra colar a chave de API. Para bloquear tudo, remova a exceção do input.
export function blockContextMenu(): () => void {
  const handler = (e: MouseEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && t.closest("input, textarea")) return; // preserva copiar/colar nos campos
    e.preventDefault();
  };
  document.addEventListener("contextmenu", handler);
  return () => document.removeEventListener("contextmenu", handler);
}
