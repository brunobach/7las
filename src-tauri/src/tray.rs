use tauri::{
    App, AppHandle, Emitter, Manager,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

pub fn setup(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    let menu = build_menu(app.handle(), false)?;
    TrayIconBuilder::with_id("main-tray")
        .icon(
            app.default_window_icon()
                .expect("Ícone padrão ausente")
                .clone(),
        )
        .tooltip("7las — compartilhamento de tela")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "share" => {
                show_main(app);
                let _ = app.emit("tray://share", ());
            }
            "room" => {
                show_main(app);
                let _ = app.emit("tray://room", ());
            }
            "stop" => {
                show_main(app);
                let _ = app.emit("tray://stop", ());
            }
            "settings" => {
                show_main(app);
                let _ = app.emit("tray://settings", ());
            }
            "quit" => {
                let _ = app.emit("tray://stop", ());
                crate::discord::shutdown();
                let handle = app.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(250));
                    handle.exit(0);
                });
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

pub fn set_live(app: &AppHandle, live: bool) -> Result<(), String> {
    let tray = app
        .tray_by_id("main-tray")
        .ok_or("Bandeja não inicializada.")?;
    tray.set_menu(Some(build_menu(app, live)?))
        .map_err(|error| error.to_string())
}

fn build_menu(app: &AppHandle, live: bool) -> Result<Menu<tauri::Wry>, String> {
    let share = MenuItem::with_id(app, "share", "Compartilhar tela", !live, None::<&str>)
        .map_err(|error| error.to_string())?;
    let room = MenuItem::with_id(app, "room", "Abrir sala", true, None::<&str>)
        .map_err(|error| error.to_string())?;
    let stop = MenuItem::with_id(app, "stop", "Parar transmissão", live, None::<&str>)
        .map_err(|error| error.to_string())?;
    let settings = MenuItem::with_id(app, "settings", "Abrir configurações", true, None::<&str>)
        .map_err(|error| error.to_string())?;
    let quit = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)
        .map_err(|error| error.to_string())?;
    Menu::with_items(app, &[&share, &room, &stop, &settings, &quit])
        .map_err(|error| error.to_string())
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
