// main.rs — Ponto de entrada do binário.
// Toda a lógica vive em lib.rs (padrão Tauri 2). Isto aqui só chama run()
// e evita abrir um console preto no Windows em build de release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    imprompt_lib::run();
}
