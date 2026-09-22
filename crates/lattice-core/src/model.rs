use crate::{FrameRate, FrameTime};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Project {
    pub format_version: u32,
    pub id: Uuid,
    pub name: String,
    pub language: String,
    pub frame_rate: FrameRate,
    pub width: u32,
    pub height: u32,
    pub tracks: Vec<Track>,
    pub assets: Vec<Asset>,
}

impl Project {
    pub fn new_4k60(name: impl Into<String>) -> Self {
        Self {
            format_version: 1,
            id: Uuid::new_v4(),
            name: name.into(),
            language: "ja-JP".into(),
            frame_rate: FrameRate::FPS_60,
            width: 3840,
            height: 2160,
            tracks: vec![],
            assets: vec![],
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Track {
    pub id: Uuid,
    pub name: String,
    pub kind: TrackKind,
    pub muted: bool,
    pub locked: bool,
    pub clips: Vec<Clip>,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum TrackKind { Video, Audio, Subtitle, Scene3d }

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Clip {
    pub id: Uuid,
    pub asset_id: Uuid,
    pub name: String,
    pub start: FrameTime,
    pub duration: FrameTime,
    pub source_in: FrameTime,
    pub enabled: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Asset {
    pub id: Uuid,
    pub uri: String,
    pub media_type: MediaType,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub codec: Option<String>,
    pub fps: Option<f64>,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum MediaType { Video, Audio, Image, Model3d, Subtitle }
