use tauri::{AppHandle, LogicalSize, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder};

/// Aviso próprio do 7las no canto da tela (pedido para entrar, convite de amigo).
/// É uma janela pequena, sempre por cima, que não rouba o foco do jogo.
const LABEL: &str = "toast";
const WIDTH: f64 = 360.0;
const MARGIN: i32 = 16;

pub fn show(app: &AppHandle, height: f64) -> Result<(), String> {
    let height = height.clamp(96.0, 520.0);
    let window = match app.get_webview_window(LABEL) {
        Some(window) => window,
        None => WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html#toast".into()))
            .title("7las")
            .inner_size(WIDTH, height)
            .decorations(false)
            .resizable(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .focused(false)
            // Aparece sem tirar o foco do jogo, mas continua clicável.
            .focusable(false)
            .visible(false)
            .shadow(true)
            .build()
            .map_err(|error| error.to_string())?,
    };
    window
        .set_size(LogicalSize::new(WIDTH, height))
        .map_err(|error| error.to_string())?;
    place_bottom_right(app, &window, height);
    window.show().map_err(|error| error.to_string())?;
    let _ = window.set_always_on_top(true);
    Ok(())
}

pub fn hide(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.hide();
    }
}

/// Canto inferior direito da área útil do monitor principal (acima da barra de tarefas).
fn place_bottom_right(app: &AppHandle, window: &tauri::WebviewWindow, height: f64) {
    let monitor = app
        .get_webview_window("main")
        .and_then(|main| main.current_monitor().ok().flatten())
        .or_else(|| window.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else { return };
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let width = (WIDTH * scale) as i32;
    let height = (height * scale) as i32;
    let margin = (MARGIN as f64 * scale) as i32;
    let x = area.position.x + area.size.width as i32 - width - margin;
    let y = area.position.y + area.size.height as i32 - height - margin;
    let _ = window.set_position(PhysicalPosition::new(x, y));
}
