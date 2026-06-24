/// Benchmarks for the indexer pipeline.
///
/// Run with:  cargo test --release bench_ -- --ignored --nocapture
/// CI (`.github/workflows/ci.yml`) runs the same command on Windows builds.
///
/// bench_classify_30k     — raw path classification only  (< 3 s)
/// bench_run_index_cold   — full run_index without sled cache (cold)  (< 8 s)
/// bench_run_index_warm   — full run_index with a primed sled cache (< 1 s)
#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::sync::atomic::AtomicBool;
    use std::sync::Arc;
    use std::time::Instant;

    use tauri::ipc::Channel;
    use tempfile::TempDir;

    use crate::dto::IndexEvent;
    use crate::index::classify::classify_path;
    use crate::index::run_index;
    use crate::source::FolderSource;

    const TARGET: usize = 30_000;
    const NAMESPACES: &[&str] = &["minecraft", "betterend", "quark", "supplementaries", "create"];

    pub(crate) fn make_fake_paths() -> Vec<PathBuf> {
        let kinds = [
            ("assets/{ns}/textures", "png"),
            ("assets/{ns}/models/block", "json"),
            ("assets/{ns}/models/item", "json"),
            ("assets/{ns}/blockstates", "json"),
            ("assets/{ns}/sounds", "ogg"),
            ("assets/{ns}/lang", "json"),
        ];

        let mut paths: Vec<PathBuf> = Vec::with_capacity(TARGET);
        let per_bucket = TARGET / (NAMESPACES.len() * kinds.len()) + 1;

        'outer: for ns in NAMESPACES {
            for (dir, ext) in &kinds {
                let base = dir.replace("{ns}", ns);
                for i in 0..per_bucket {
                    paths.push(PathBuf::from(format!("{base}/asset_{i:05}.{ext}")));
                    if paths.len() >= TARGET {
                        break 'outer;
                    }
                }
            }
        }
        paths
    }

    /// Populate a temp directory with the fake paths so FolderSource can list them.
    fn make_folder(tmp: &TempDir) {
        for p in make_fake_paths() {
            let dest = tmp.path().join(&p);
            if let Some(parent) = dest.parent() {
                std::fs::create_dir_all(parent).unwrap();
            }
            std::fs::write(&dest, b"").unwrap();
        }
    }

    fn make_channel() -> Channel<IndexEvent> {
        Channel::new(|_| Ok(()))
    }

    #[test]
    #[ignore = "performance benchmark, excluded from default cargo test"]
    fn bench_classify_30k() {
        let paths = make_fake_paths();
        assert_eq!(paths.len(), TARGET);

        let t = Instant::now();
        let classified: Vec<_> = paths
            .iter()
            .filter_map(|p| classify_path(&p.to_string_lossy()))
            .collect();
        let elapsed_ms = t.elapsed().as_millis();

        println!(
            "bench_classify_30k: classified {}/{} in {} ms  ({:.1} entries/ms)",
            classified.len(),
            TARGET,
            elapsed_ms,
            classified.len() as f64 / (elapsed_ms.max(1) as f64),
        );

        assert!(
            classified.len() >= TARGET * 3 / 4,
            "expected to classify at least {}; got {}",
            TARGET * 3 / 4,
            classified.len()
        );
        assert!(
            elapsed_ms < 3_000,
            "classify took {elapsed_ms} ms — exceeds 3 s for {TARGET} entries"
        );
    }

    #[test]
    #[ignore = "performance benchmark, excluded from default cargo test"]
    fn bench_run_index_cold() {
        let tmp = TempDir::new().unwrap();
        make_folder(&tmp);

        let db = sled::open(tmp.path().join(".ind3x-db")).unwrap();
        let cancel = Arc::new(AtomicBool::new(false));
        let ch = make_channel();

        let fingerprint = format!("bench-cold-{}", std::process::id());

        let t = Instant::now();
        let (entries, from_cache) =
            run_index(&FolderSource::new(tmp.path()).unwrap(), &db, &fingerprint, &cancel, &ch, None, false)
                .expect("run_index cold");
        let elapsed_ms = t.elapsed().as_millis();

        println!(
            "bench_run_index_cold: {} entries from_cache={} in {} ms",
            entries.len(),
            from_cache,
            elapsed_ms
        );
        assert!(!from_cache, "expected cold index");
        assert!(
            entries.len() >= TARGET * 3 / 4,
            "expected ≥{} entries; got {}",
            TARGET * 3 / 4,
            entries.len()
        );
        assert!(
            elapsed_ms < 8_000,
            "cold run_index took {elapsed_ms} ms — exceeds 8 s budget"
        );
    }

    #[test]
    #[ignore = "performance benchmark, excluded from default cargo test"]
    fn bench_run_index_warm() {
        let tmp = TempDir::new().unwrap();
        make_folder(&tmp);

        let db = sled::open(tmp.path().join(".ind3x-db-warm")).unwrap();
        let cancel = Arc::new(AtomicBool::new(false));
        let fingerprint = format!("bench-warm-{}", std::process::id());

        // Warm the cache with a first run
        let _ = run_index(
            &FolderSource::new(tmp.path()).unwrap(),
            &db,
            &fingerprint,
            &cancel,
            &make_channel(),
            None,
            false,
        )
        .expect("cold warm-up");

        // Now measure the cache-hit path
        let t = Instant::now();
        let (entries, from_cache) = run_index(
            &FolderSource::new(tmp.path()).unwrap(),
            &db,
            &fingerprint,
            &cancel,
            &make_channel(),
            None,
            false,
        )
        .expect("warm run_index");
        let elapsed_ms = t.elapsed().as_millis();

        println!(
            "bench_run_index_warm: {} entries from_cache={} in {} ms",
            entries.len(),
            from_cache,
            elapsed_ms
        );
        assert!(from_cache, "expected cache hit");
        assert!(
            elapsed_ms < 1_000,
            "warm run_index took {elapsed_ms} ms — exceeds 1 s budget"
        );
    }
}
