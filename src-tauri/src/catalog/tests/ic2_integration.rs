use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::time::Instant;

use tauri::ipc::Channel;

use crate::catalog::{build_from_entries_with_options, CatalogBuildOptions};
use crate::dto::IndexEvent;
use crate::index::{run_index, source_fingerprint};
use crate::source::{AssetSource, JarSource};

const IC2_JAR: &str = r"D:\ic2assets\IC2Classic-1.19.2-2.1.3.jar";

fn ic2_jar_path() -> std::path::PathBuf {
    if let Ok(path) = std::env::var("IC2_JAR_PATH") {
        return std::path::PathBuf::from(path);
    }
    std::path::PathBuf::from(IC2_JAR)
}

fn noop_channel() -> Channel<IndexEvent> {
    Channel::new(|_| Ok(()))
}

#[test]
#[ignore = "local IC2 jar benchmark"]
fn ic2_classic_jar_index_and_catalog() {
    let path = ic2_jar_path();
    if !path.exists() {
        eprintln!("skip: IC2 jar not found (set IC2_JAR_PATH or place jar at {IC2_JAR})");
        return;
    }

    let db = sled::Config::new().temporary(true).open().expect("db");
    let cancel = Arc::new(AtomicBool::new(false));
    let source = JarSource::new(&path).expect("jar");
    let fp = source_fingerprint(&path).expect("fp");

    let t0 = Instant::now();
    let (entries, from_cache) = run_index(
        &source as &dyn AssetSource,
        &db,
        &fp,
        &cancel,
        &noop_channel(),
        None,
        true,
    )
    .expect("index");
    let index_ms = t0.elapsed().as_millis();
    eprintln!(
        "index: {} entries, from_cache={}, {}ms",
        entries.len(),
        from_cache,
        index_ms
    );

    let t1 = Instant::now();
    let catalog = build_from_entries_with_options(
        &entries,
        Some(&source as &dyn AssetSource),
        CatalogBuildOptions {
            language: "en_us",
            ..Default::default()
        },
    );
    let catalog_ms = t1.elapsed().as_millis();
    eprintln!(
        "catalog: {} entries, {catalog_ms}ms (total {}ms)",
        catalog.len(),
        index_ms + catalog_ms
    );

    assert!(!entries.is_empty(), "index should not be empty");
    assert!(
        catalog.len() > 100,
        "IC2 texture catalog should have hundreds of entries, got {}",
        catalog.len()
    );
    assert!(
        catalog.iter().any(|e| e.id == "ic2:batbox"),
        "expected ic2:batbox in catalog"
    );
}
