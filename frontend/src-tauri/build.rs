use std::fs;
use std::path::Path;

fn copy_if_exists(src: &Path, dst: &Path) {
    if !src.exists() {
        return;
    }

    if let Err(e) = fs::copy(src, dst) {
        eprintln!(
            "Warning: couldn't copy {} to {}: {}",
            src.display(),
            dst.display(),
            e
        );
        return;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(dst, fs::Permissions::from_mode(0o755));
    }
}

fn main() {
    // Copy compiled binaries to a bundlable location.
    let backend_src = Path::new("../../target/release/pertisk-kube-backend");
    let bundle_dir = Path::new("./bundle-resources");
    let backend_dst = bundle_dir.join("pertisk-kube-backend");

    let ktail_env_path = std::env::var("KTAIL_BINARY_PATH").ok();
    let ktail_candidates = [
        ktail_env_path.as_deref().map(Path::new),
        Some(Path::new("../../../pertisk-ktail/target/release/ktail")),
        Some(Path::new("../../../pertisk-ktail/target/release/pertisk-ktail")),
        Some(Path::new("../../pertisk-ktail/target/release/ktail")),
        Some(Path::new("../../pertisk-ktail/target/release/pertisk-ktail")),
    ];
    let ktail_src = ktail_candidates
        .into_iter()
        .flatten()
        .find(|path| path.exists());
    let ktail_dst = bundle_dir.join("ktail");

    fs::create_dir_all(bundle_dir).ok();

    if backend_src.exists() {
        copy_if_exists(backend_src, &backend_dst);
        println!("cargo::rustc-env=BACKEND_BINARY_COPIED=true");
    } else {
        eprintln!(
            "Warning: backend binary not found at {} (desktop build will rely on fallback paths)",
            backend_src.display()
        );
    }

    if let Some(src) = ktail_src {
        copy_if_exists(src, &ktail_dst);
        println!("cargo::rustc-env=KTAIL_BINARY_COPIED=true");
    } else {
        eprintln!(
            "Warning: ktail binary not found. Set KTAIL_BINARY_PATH or build pertisk-ktail first."
        );
    }

    tauri_build::build()
}
