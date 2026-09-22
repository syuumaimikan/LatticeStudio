use serde::{Deserialize, Serialize};

pub const LATTICE_PLUGIN_ABI_VERSION: u32 = 1;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub vendor: String,
    pub version: String,
    pub abi_version: u32,
    pub kind: PluginKind,
    pub sandbox: SandboxPolicy,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub enum PluginKind { VideoEffect, AudioEffect, Transition, Importer, Exporter, Tool, UiPanel }

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub enum SandboxPolicy { Required, Preferred, InProcessTrusted }
