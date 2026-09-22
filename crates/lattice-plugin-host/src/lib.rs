use lattice_plugin_api::{PluginManifest, SandboxPolicy};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HostMode { IsolatedProcess, InProcess }

pub fn select_host_mode(manifest: &PluginManifest, user_trusts_vendor: bool) -> HostMode {
    match manifest.sandbox {
        SandboxPolicy::Required | SandboxPolicy::Preferred => HostMode::IsolatedProcess,
        SandboxPolicy::InProcessTrusted if user_trusts_vendor => HostMode::InProcess,
        SandboxPolicy::InProcessTrusted => HostMode::IsolatedProcess,
    }
}

#[derive(Clone, Debug)]
pub struct ResourceLimits {
    pub memory_mb: u64,
    pub watchdog_ms: u64,
    pub allow_network: bool,
    pub allow_filesystem_write: bool,
}

impl Default for ResourceLimits {
    fn default() -> Self { Self { memory_mb: 2048, watchdog_ms: 5000, allow_network: false, allow_filesystem_write: false } }
}
