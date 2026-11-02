use std::borrow::Cow;

use percent_encoding::percent_decode_str;
use tauri::ipc::{InvokeBody, Request};
use tauri_plugin_dialog::DialogExt;

fn body(request: &Request<'_>) -> Result<Vec<u8>, String> {
    match request.body() {
        InvokeBody::Raw(bytes) => Ok(bytes.clone()),
        InvokeBody::Json(_) => Err("expected binary data".into()),
    }
}

fn header(request: &Request<'_>, name: &str) -> Result<String, String> {
    request
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned)
        .ok_or_else(|| format!("missing header {name}"))
}

/// The save location comes from the system dialog, never from the page.
#[tauri::command]
async fn save_file(app: tauri::AppHandle, request: Request<'_>) -> Result<bool, String> {
    let encoded = header(&request, "x-name")?;
    let name = percent_decode_str(&encoded)
        .decode_utf8()
        .map_err(|e| e.to_string())?
        .into_owned();
    let extension = name.rsplit('.').next().unwrap_or("").to_owned();
    let bytes = body(&request)?;

    let chosen = app
        .dialog()
        .file()
        .set_file_name(&name)
        .add_filter(extension.to_uppercase(), &[extension.as_str()])
        .blocking_save_file();
    let Some(path) = chosen else {
        return Ok(false);
    };
    let path = path.into_path().map_err(|e| e.to_string())?;
    std::fs::write(path, bytes).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
async fn copy_image(request: Request<'_>) -> Result<(), String> {
    let width: usize = header(&request, "x-width")?.parse().map_err(|_| "bad width")?;
    let height: usize = header(&request, "x-height")?.parse().map_err(|_| "bad height")?;
    let bytes = body(&request)?;
    if bytes.len() != width * height * 4 {
        return Err("image size does not match its data".into());
    }
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard
        .set_image(arboard::ImageData {
            width,
            height,
            bytes: Cow::Owned(bytes),
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn copy_text(text: String) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(text).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![save_file, copy_image, copy_text])
        .run(tauri::generate_context!())
        .expect("failed to start the application");
}
