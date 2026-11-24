use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub display_name: String,
    pub room_name: String,
    pub start_with_windows: bool,
    pub close_to_tray: bool,
    pub global_shortcut: String,
    pub mode: String,
    pub audio_mode: String,
    pub audio_target_executable: Option<String>,
    pub audio_target_window_title: Option<String>,
    pub relay_enabled: bool,
    pub relay_slots: u8,
    pub max_direct_slots: u8,
    pub turn_url: String,
    pub turn_username: String,
    /// Mostrar no perfil do Discord que está no 7las. Desligado por padrão.
    #[serde(default)]
    pub discord_presence: bool,
    /// Botão "Entrar na sala" no status do Discord (mostra o código da sala). Desligado por padrão.
    #[serde(default)]
    pub discord_join_button: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            display_name: "Você".into(),
            room_name: "Sala dos amigos".into(),
            start_with_windows: false,
            close_to_tray: true,
            global_shortcut: "Ctrl+Shift+S".into(),
            mode: "smooth".into(),
            audio_mode: "none".into(),
            audio_target_executable: None,
            audio_target_window_title: None,
            relay_enabled: false,
            relay_slots: 1,
            max_direct_slots: 2,
            turn_url: String::new(),
            turn_username: String::new(),
            discord_presence: false,
            discord_join_button: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Friend {
    pub friend_id: String,
    pub display_name: String,
    pub avatar_seed: u32,
    pub public_key: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SharingState {
    pub live: bool,
    pub session_id: Option<String>,
    pub viewer_count: usize,
    pub direct_outputs: usize,
}

pub struct Store {
    pub settings: AppSettings,
    pub friends: Vec<Friend>,
    pub sharing: SharingState,
    directory: PathBuf,
}

impl Store {
    pub fn load(app: &AppHandle) -> Result<Self, String> {
        let directory = app
            .path()
            .app_config_dir()
            .map_err(|error| error.to_string())?;
        fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
        let settings = read_json(&directory.join("settings.json"))?.unwrap_or_default();
        let friends = read_json(&directory.join("friends.json"))?.unwrap_or_default();
        Ok(Self {
            settings,
            friends,
            sharing: SharingState::default(),
            directory,
        })
    }

    pub fn save_settings(&self) -> Result<(), String> {
        write_json(&self.directory.join("settings.json"), &self.settings)
    }

    pub fn save_friends(&self) -> Result<(), String> {
        write_json(&self.directory.join("friends.json"), &self.friends)
    }

    pub fn directory(&self) -> &PathBuf {
        &self.directory
    }
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &PathBuf) -> Result<Option<T>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let data = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&data)
        .map(Some)
        .map_err(|error| format!("Falha ao ler dados locais: {error}"))
}

fn write_json<T: Serialize>(path: &PathBuf, value: &T) -> Result<(), String> {
    let data = serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?;
    fs::write(path, data).map_err(|error| error.to_string())
}
