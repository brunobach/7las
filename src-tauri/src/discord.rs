use discord_rich_presence::{
    activity::{Activity, ActivityType, Assets, Button, Party, Timestamps},
    DiscordIpc, DiscordIpcClient,
};
use serde::Deserialize;
use std::sync::Mutex;

/// ID do aplicativo criado em https://discord.com/developers/applications.
/// Ele não é segredo. Enquanto estiver vazio, a opção "Mostrar no Discord" fica indisponível.
pub const APPLICATION_ID: &str = "1574805574150000752";

/// Imagem enviada em "Rich Presence → Art Assets" no portal do Discord, com este nome.
const LARGE_IMAGE: &str = "logo";

/// Página pública (GitHub Pages) que abre o 7las com o código: o Discord só aceita botões com link https.
const JOIN_PAGE: &str = "https://brunobach.github.io/7las/entrar/";

static CLIENT: Mutex<Option<DiscordIpcClient>> = Mutex::new(None);

/// O que aparece no perfil. Nunca inclui o código da sala.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Presence {
    details: String,
    state: String,
    started_at: i64,
    party_size: i32,
    party_max: i32,
    /// Código curto da sala (só do host, com a opção de botão ligada).
    #[serde(default)]
    join_code: Option<String>,
}

pub fn available() -> bool {
    !APPLICATION_ID.trim().is_empty()
}

/// Atualiza o status. `None` limpa. Retorna se o Discord aceitou (falso se ele estiver fechado).
pub fn update(presence: Option<Presence>) -> bool {
    if !available() {
        return false;
    }
    let Ok(mut guard) = CLIENT.lock() else { return false };
    let Some(presence) = presence else {
        if let Some(client) = guard.as_mut() {
            let _ = client.clear_activity();
        }
        return true;
    };
    if guard.is_none() {
        let mut client = DiscordIpcClient::new(APPLICATION_ID);
        // Discord fechado: tentamos de novo na próxima atualização.
        if client.connect().is_err() {
            return false;
        }
        *guard = Some(client);
    }
    let activity = Activity::new()
        .activity_type(ActivityType::Playing)
        .details(presence.details.as_str())
        .state(presence.state.as_str())
        .timestamps(Timestamps::new().start(presence.started_at))
        .party(Party::new().size([presence.party_size, presence.party_max]))
        .assets(Assets::new().large_image(LARGE_IMAGE).large_text("7las"));
    let join_url = presence
        .join_code
        .as_deref()
        .filter(|code| code.len() == 8 && code.chars().all(|char| char.is_ascii_alphanumeric()))
        .map(|code| format!("{JOIN_PAGE}?codigo={code}"));
    let activity = match &join_url {
        Some(url) => activity.buttons(vec![Button::new("Entrar na sala", url.as_str())]),
        None => activity,
    };
    let ok = guard.as_mut().is_some_and(|client| client.set_activity(activity).is_ok());
    if !ok {
        // A conexão caiu (Discord reiniciou): descarta para reconectar na próxima.
        if let Some(mut client) = guard.take() {
            let _ = client.close();
        }
    }
    ok
}

pub fn shutdown() {
    if let Ok(mut guard) = CLIENT.lock() {
        if let Some(mut client) = guard.take() {
            let _ = client.clear_activity();
            let _ = client.close();
        }
    }
}

