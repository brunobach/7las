mod audio;
mod discord;
mod identity;
mod notifications;
mod shortcuts;
mod storage;
mod toast;
mod tray;

use identity::Identity;
use serde::Deserialize;
use std::sync::Mutex;
use storage::{AppSettings, Friend, SharingState, Store};
use tauri::{AppHandle, Manager, State, WindowEvent};
use tauri_plugin_autostart::ManagerExt;

pub struct AppState {
    store: Mutex<Store>,
    identity: Mutex<Option<Identity>>,
}

impl AppState {
    fn load(app: &AppHandle) -> Result<Self, String> {
        Ok(Self {
            store: Mutex::new(Store::load(app)?),
            identity: Mutex::new(None),
        })
    }
}

#[tauri::command]
fn identity_get_public_key(app: AppHandle, state: State<'_, AppState>) -> Result<String, String> {
    with_identity(&app, &state, |identity| identity.public_key())
}

#[tauri::command]
fn identity_sign(
    challenge: Vec<u8>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    with_identity(&app, &state, |identity| identity.sign(&challenge))?
}

#[tauri::command]
fn friends_list(state: State<'_, AppState>) -> Result<Vec<Friend>, String> {
    Ok(state
        .store
        .lock()
        .map_err(|_| "Falha no estado local.")?
        .friends
        .clone())
}

#[tauri::command]
fn friend_add(friend: Friend, state: State<'_, AppState>) -> Result<Vec<Friend>, String> {
    if friend.friend_id.is_empty()
        || friend.display_name.trim().is_empty()
        || friend.display_name.len() > 40
        || friend.public_key.is_empty()
    {
        return Err("Os dados do amigo são inválidos.".into());
    }
    let mut store = state.store.lock().map_err(|_| "Falha no estado local.")?;
    store
        .friends
        .retain(|item| item.friend_id != friend.friend_id);
    store.friends.push(friend);
    store.save_friends()?;
    Ok(store.friends.clone())
}

#[tauri::command]
fn friend_remove(friend_id: String, state: State<'_, AppState>) -> Result<Vec<Friend>, String> {
    let mut store = state.store.lock().map_err(|_| "Falha no estado local.")?;
    store.friends.retain(|friend| friend.friend_id != friend_id);
    store.save_friends()?;
    Ok(store.friends.clone())
}

#[tauri::command]
fn settings_get(state: State<'_, AppState>) -> Result<AppSettings, String> {
    Ok(state
        .store
        .lock()
        .map_err(|_| "Falha no estado local.")?
        .settings
        .clone())
}

#[tauri::command]
fn settings_update(patch: AppSettings, state: State<'_, AppState>) -> Result<AppSettings, String> {
    validate_settings(&patch)?;
    let mut store = state.store.lock().map_err(|_| "Falha no estado local.")?;
    store.settings = patch;
    store.save_settings()?;
    Ok(store.settings.clone())
}

#[tauri::command]
fn window_show(app: AppHandle) -> Result<(), String> {
    show_main(&app)
}

#[tauri::command]
fn window_hide_to_tray(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Janela principal ausente.")?;
    window.hide().map_err(|error| error.to_string())
}

#[tauri::command]
fn sharing_get_state(state: State<'_, AppState>) -> Result<SharingState, String> {
    Ok(state
        .store
        .lock()
        .map_err(|_| "Falha no estado local.")?
        .sharing
        .clone())
}

#[tauri::command]
fn sharing_set_state(
    state_value: SharingState,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let live = state_value.live;
    state
        .store
        .lock()
        .map_err(|_| "Falha no estado local.")?
        .sharing = state_value;
    tray::set_live(&app, live)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LiveNotification {
    host_name: String,
    room_name: String,
}

#[tauri::command]
fn notification_show_live(payload: LiveNotification, app: AppHandle) -> Result<(), String> {
    notifications::show_live(&app, &payload.host_name, &payload.room_name)
}

#[tauri::command]
fn audio_list_applications() -> Result<Vec<audio::AudioApplication>, String> {
    Err(audio::pending())
}

#[tauri::command]
fn audio_start() -> Result<String, String> {
    Err(audio::pending())
}

#[tauri::command]
fn audio_stop(_capture_id: String) -> Result<(), String> {
    Err(audio::pending())
}

#[tauri::command]
fn audio_restart_if_target_changed(_capture_id: String) -> Result<(), String> {
    Err(audio::pending())
}

#[tauri::command]
fn autostart_set(enabled: bool, app: AppHandle) -> Result<(), String> {
    let manager = app.autolaunch();
    if enabled {
        manager.enable().map_err(|error| error.to_string())
    } else {
        manager.disable().map_err(|error| error.to_string())
    }
}

#[tauri::command]
fn discord_available() -> bool {
    discord::available()
}

/// Roda fora da thread principal: conectar ao Discord pode demorar um pouco.
#[tauri::command]
async fn discord_presence_update(presence: Option<discord::Presence>) -> bool {
    tauri::async_runtime::spawn_blocking(move || discord::update(presence))
        .await
        .unwrap_or(false)
}

// Assíncronos de propósito: criar janela ou registrar atalho num comando síncrono
// roda na thread principal e trava o app no Windows (seletor de tela, bandeja, fechar).
#[tauri::command]
async fn toast_show(height: f64, app: AppHandle) -> Result<(), String> {
    toast::show(&app, height)
}

#[tauri::command]
async fn toast_hide(app: AppHandle) {
    toast::hide(&app)
}

#[tauri::command]
async fn accept_shortcut_set(enabled: bool, app: AppHandle) -> bool {
    shortcuts::set_accept(&app, enabled)
}

#[tauri::command]
async fn shortcut_update(shortcut: String, app: AppHandle) -> Result<(), String> {
    shortcuts::replace(&app, &shortcut)
}

fn with_identity<T>(
    app: &AppHandle,
    state: &State<'_, AppState>,
    action: impl FnOnce(&Identity) -> T,
) -> Result<T, String> {
    let directory = state
        .store
        .lock()
        .map_err(|_| "Falha no estado local.")?
        .directory()
        .clone();
    let mut slot = state
        .identity
        .lock()
        .map_err(|_| "Falha na identidade local.")?;
    if slot.is_none() {
        *slot = Some(Identity::load_or_create(&directory)?);
    }
    let _ = app;
    Ok(action(slot.as_ref().expect("Identidade inicializada")))
}

fn validate_settings(settings: &AppSettings) -> Result<(), String> {
    if settings.display_name.trim().is_empty() || settings.room_name.trim().is_empty() {
        return Err("O nome e a sala não podem ficar vazios.".into());
    }
    if settings.relay_slots != 1 || settings.max_direct_slots != 2 {
        return Err("Os limites do MVP exigem um slot de relay e duas saídas diretas.".into());
    }
    if !["sharp", "smooth"].contains(&settings.mode.as_str()) {
        return Err("Modo de qualidade inválido.".into());
    }
    Ok(())
}

fn show_main(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Janela principal ausente.")?;
    window.show().map_err(|error| error.to_string())?;
    window.unminimize().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Precisa ser o primeiro plugin: um link sevenlas:// com o app aberto chega na janela que já existe.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            let _ = show_main(app);
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    shortcuts::handle_shortcut(app, shortcut, event.state());
                })
                .build(),
        )
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .setup(|app| {
            let state = AppState::load(app.handle())
                .map_err(|error| -> Box<dyn std::error::Error> { error.into() })?;
            let shortcut = state
                .store
                .lock()
                .map_err(|_| "Falha no estado local.")?
                .settings
                .global_shortcut
                .clone();
            app.manage(state);
            tray::setup(app)?;
            // O instalador registra o sevenlas://; aqui garantimos também ao rodar sem instalar.
            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = app.deep_link().register_all();
            }
            shortcuts::register(app.handle(), &shortcut)
                .map_err(|error| -> Box<dyn std::error::Error> { error.into() })?;
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let close_to_tray = window
                    .state::<AppState>()
                    .store
                    .lock()
                    .map(|store| store.settings.close_to_tray)
                    .unwrap_or(true);
                if close_to_tray {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            identity_get_public_key,
            identity_sign,
            friends_list,
            friend_add,
            friend_remove,
            settings_get,
            settings_update,
            window_show,
            window_hide_to_tray,
            sharing_get_state,
            sharing_set_state,
            notification_show_live,
            audio_list_applications,
            audio_start,
            audio_stop,
            audio_restart_if_target_changed,
            autostart_set,
            shortcut_update,
            accept_shortcut_set,
            toast_show,
            discord_available,
            discord_presence_update,
            toast_hide,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
