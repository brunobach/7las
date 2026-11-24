use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// Ctrl+Shift+A aceita pedidos de entrada sem abrir o app (mesmo valor de ACCEPT_SHORTCUT no front).
/// Só fica registrado enquanto há alguém esperando, para não roubar a tecla de outros programas.
static ACCEPT_ACTIVE: AtomicBool = AtomicBool::new(false);

fn accept_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyA)
}

pub fn register(app: &AppHandle, shortcut: &str) -> Result<(), String> {
    app.global_shortcut()
        .register(shortcut)
        .map_err(|error| format!("Não foi possível registrar o atalho: {error}"))
}

pub fn replace(app: &AppHandle, shortcut: &str) -> Result<(), String> {
    app.global_shortcut()
        .unregister_all()
        .map_err(|error| error.to_string())?;
    register(app, shortcut)?;
    if ACCEPT_ACTIVE.load(Ordering::SeqCst) {
        let _ = app.global_shortcut().register(accept_shortcut());
    }
    Ok(())
}

/// Liga ou desliga o atalho de aceitar. Retorna se ele ficou ativo.
pub fn set_accept(app: &AppHandle, enabled: bool) -> bool {
    let shortcuts = app.global_shortcut();
    let accept = accept_shortcut();
    if enabled {
        if !ACCEPT_ACTIVE.load(Ordering::SeqCst) {
            // Falha quando outro programa (ou o atalho principal) já usa a combinação.
            if shortcuts.is_registered(accept) || shortcuts.register(accept).is_err() {
                return false;
            }
            ACCEPT_ACTIVE.store(true, Ordering::SeqCst);
        }
        true
    } else {
        if ACCEPT_ACTIVE.swap(false, Ordering::SeqCst) {
            let _ = shortcuts.unregister(accept);
        }
        false
    }
}

pub fn handle_shortcut(app: &AppHandle, shortcut: &Shortcut, state: ShortcutState) {
    if state != ShortcutState::Pressed {
        return;
    }
    if ACCEPT_ACTIVE.load(Ordering::SeqCst) && *shortcut == accept_shortcut() {
        let _ = app.emit("shortcut://accept", ());
        return;
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    let _ = app.emit("tray://share", ());
}
