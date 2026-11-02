#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use cortex_adapters::scan_all_sources;
use cortex_graph::{process_graph, EnrichedGraphSnapshot};
use cortex_model::AdapterHealth;
use cortex_store::CortexStore;
use std::sync::Mutex;
use tauri::State;

struct AppState {
    store: Mutex<CortexStore>,
}

#[tauri::command]
fn get_graph_snapshot(state: State<'_, AppState>) -> Result<EnrichedGraphSnapshot, String> {
    let store = state.store.lock().map_err(|e| e.to_string())?;

    // Try loading existing snapshot from store first
    if let Ok(snapshot) = store.get_snapshot() {
        if !snapshot.nodes.is_empty() {
            return Ok(process_graph(snapshot));
        }
    }

    // Otherwise perform scan
    let raw = scan_all_sources(None, None, vec![]);
    let _ = store.save_snapshot(&raw);
    Ok(process_graph(raw))
}

#[tauri::command]
fn list_sources(state: State<'_, AppState>) -> Result<Vec<AdapterHealth>, String> {
    let store = state.store.lock().map_err(|e| e.to_string())?;
    match store.get_snapshot() {
        Ok(s) => Ok(s.sources),
        Err(_) => {
            let raw = scan_all_sources(None, None, vec![]);
            Ok(raw.sources)
        }
    }
}

#[tauri::command]
fn rescan(state: State<'_, AppState>) -> Result<EnrichedGraphSnapshot, String> {
    let store = state.store.lock().map_err(|e| e.to_string())?;
    let raw = scan_all_sources(None, None, vec![]);
    let _ = store.save_snapshot(&raw);
    Ok(process_graph(raw))
}

fn main() {
    #[cfg(windows)]
    {
        if std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").is_err() {
            std::env::set_var(
                "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
                "--remote-debugging-port=9222",
            );
        }
    }

    let store_path = CortexStore::default_path();
    let store = CortexStore::new(store_path).expect("Failed to initialize CortexStore");

    tauri::Builder::default()
        .manage(AppState {
            store: Mutex::new(store),
        })
        .invoke_handler(tauri::generate_handler![
            get_graph_snapshot,
            list_sources,
            rescan
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
