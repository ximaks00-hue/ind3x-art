/// Run with: cargo run --bin export_bindings
/// Generates src/ipc/bindings.ts (typed invoke wrappers via tauri-specta).
fn main() {
    ind3x_art_lib::ipc::export_typescript("../src/ipc/bindings.ts");
    println!("Bindings exported to src/ipc/bindings.ts");
}
