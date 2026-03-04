fn main() -> Result<(), Box<dyn std::error::Error>> {
    tonic_build::configure()
        .build_server(true)
        .build_client(false)
        .compile(&["../proto/kubernetes.proto"], &["../proto"])?;
    
    println!("cargo:rerun-if-changed=../proto/kubernetes.proto");
    Ok(())
}
