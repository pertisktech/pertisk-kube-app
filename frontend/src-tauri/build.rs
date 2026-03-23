use std::fs;
use std::path::Path;

fn main() {
    // In `tauri dev` (debug profile), rewriting files under src-tauri/ triggers
    // another rebuild. Skip sidecar resource copying there to avoid infinite loops.
    let profile = std::env::var("PROFILE").unwrap_or_default();
    let should_copy_sidecar = profile == "release";

    // Copy the compiled backend binary to a bundlable location.
    // In this workspace the backend release artifact is produced in the shared top-level target dir.
    let backend_candidates = [
        Path::new("../../target/release/pertisk-kube-backend"),
        Path::new("../../backend/target/release/pertisk-kube-backend"),
    ];
    let backend_src = backend_candidates.into_iter().find(|p| p.exists());
    let bundle_dir = Path::new("./bundle-resources");
    let backend_dst = bundle_dir.join("pertisk-kube-backend");

    if should_copy_sidecar {
        if let Some(backend_src) = backend_src {
            fs::create_dir_all(bundle_dir).ok();
            if let Err(e) = fs::copy(backend_src, &backend_dst) {
                eprintln!("Warning: couldn't copy backend binary (will try relative paths): {}", e);
            } else {
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    if let Ok(metadata) = fs::metadata(&backend_dst) {
                        let mut perms = metadata.permissions();
                        perms.set_mode(0o755);
                        let _ = fs::set_permissions(&backend_dst, perms);
                    }
                }
                println!("cargo::rustc-env=BACKEND_BINARY_COPIED=true");
            }
        } else {
            eprintln!(
                "Warning: backend release binary not found at ../../target/release/pertisk-kube-backend or ../../backend/target/release/pertisk-kube-backend"
            );
        }
    }

    tauri_build::build()
}
