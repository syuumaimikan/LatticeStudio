use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MediaProbe {
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub bit_depth: u8,
    pub codec: String,
    pub bitrate_mbps: f32,
    pub chroma: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProxyMode { None, Half, Quarter }

pub fn choose_proxy(media: &MediaProbe, decoder_hw_accelerated: bool, available_vram_mb: u64) -> ProxyMode {
    let pixels = media.width as u64 * media.height as u64;
    let heavy_codec = matches!(media.codec.to_ascii_lowercase().as_str(), "hevc" | "h265" | "av1");
    let difficult_chroma = media.chroma.contains("4:2:2") || media.bit_depth > 10;
    if pixels >= 7680 * 4320 || available_vram_mb < 4096 { return ProxyMode::Quarter; }
    if pixels >= 3840 * 2160 && (!decoder_hw_accelerated || heavy_codec || difficult_chroma || media.bitrate_mbps > 180.0) {
        return ProxyMode::Half;
    }
    ProxyMode::None
}

pub trait Decoder: Send {
    type Frame;
    fn seek(&mut self, frame: i64) -> Result<(), DecodeError>;
    fn decode_next(&mut self) -> Result<Option<Self::Frame>, DecodeError>;
}

#[derive(Debug, thiserror::Error)]
pub enum DecodeError {
    #[error("decoder backend unavailable")]
    BackendUnavailable,
    #[error("decode failed: {0}")]
    Failed(String),
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn requests_proxy_for_heavy_4k() {
        let m = MediaProbe { width:3840, height:2160, fps:60.0, bit_depth:10, codec:"hevc".into(), bitrate_mbps:120.0, chroma:"4:2:0".into() };
        assert_eq!(choose_proxy(&m, false, 8192), ProxyMode::Half);
    }
}
