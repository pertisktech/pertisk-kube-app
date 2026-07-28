use std::env;
use std::fs;
use std::path::{Path, PathBuf};

fn copy_file(src: &Path, dst: &Path) -> Result<(), String> {
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create {}: {e}", parent.display()))?;
    }
    fs::copy(src, dst).map_err(|e| format!("copy {} -> {}: {e}", src.display(), dst.display()))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(dst, fs::Permissions::from_mode(0o755));
    }

    Ok(())
}

fn main() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    // Workspace release binary lives at <repo>/target/release/...
    let repo_root = manifest_dir
        .join("../..")
        .canonicalize()
        .unwrap_or_else(|_| manifest_dir.join("../.."));

    let backend_src = repo_root.join("target/release/pertisk-kube-backend");
    let bundle_dir = manifest_dir.join("bundle-resources");
    let backend_dst = bundle_dir.join("pertisk-kube-backend");

    println!("cargo:rerun-if-env-changed=KTAIL_BINARY_PATH");
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed={}", backend_src.display());

    let profile = env::var("PROFILE").unwrap_or_else(|_| "debug".into());
    let is_release = profile == "release";

    fs::create_dir_all(&bundle_dir).ok();

    if backend_src.exists() {
        match copy_file(&backend_src, &backend_dst) {
            Ok(()) => {
                println!(
                    "cargo:warning=bundled backend sidecar from {}",
                    backend_src.display()
                );
                println!("cargo::rustc-env=BACKEND_BINARY_COPIED=true");
            }
            Err(err) => {
                if is_release {
                    panic!("Failed to prepare bundled backend for DMG/app: {err}");
                }
                println!("cargo:warning={err}");
            }
        }
    } else if is_release {
        panic!(
            "Backend binary missing at {}. Run `cargo build --release -p pertisk-kube-backend` before `tauri build` / `make build-macos-dmg`.",
            backend_src.display()
        );
    } else {
        println!(
            "cargo:warning=backend binary not found at {} (dev builds can fall back to workspace debug binary)",
            backend_src.display()
        );
    }

    let ktail_env_path = env::var("KTAIL_BINARY_PATH").ok();
    let ktail_candidates = [
        ktail_env_path.as_deref().map(Path::new),
        Some(Path::new("../../../pertisk-ktail/target/release/ktail")),
        Some(Path::new("../../../pertisk-ktail/target/release/pertisk-ktail")),
        Some(Path::new("../../../ktail/target/release/ktail")),
        Some(Path::new("../../../ktail/target/release/pertisk-ktail")),
        Some(Path::new("../../pertisk-ktail/target/release/ktail")),
        Some(Path::new("../../pertisk-ktail/target/release/pertisk-ktail")),
        Some(Path::new("../../ktail/target/release/ktail")),
        Some(Path::new("../../ktail/target/release/pertisk-ktail")),
    ];
    let ktail_src = ktail_candidates
        .into_iter()
        .flatten()
        .find(|path| path.exists());
    let ktail_dst = bundle_dir.join("ktail");

    if let Some(src) = ktail_src {
        let src = if src.is_absolute() {
            src.to_path_buf()
        } else {
            manifest_dir.join(src)
        };
        match copy_file(&src, &ktail_dst) {
            Ok(()) => println!("cargo::rustc-env=KTAIL_BINARY_COPIED=true"),
            Err(err) => println!("cargo:warning={err}"),
        }
    } else {
        println!(
            "cargo:warning=ktail binary not found. Set KTAIL_BINARY_PATH or build pertisk-ktail first."
        );
    }

    tauri_build::build()
}
