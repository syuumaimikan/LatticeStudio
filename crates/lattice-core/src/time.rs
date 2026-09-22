use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct FrameTime(pub i64);

impl FrameTime {
    pub const ZERO: Self = Self(0);
    pub fn saturating_add(self, frames: i64) -> Self { Self(self.0.saturating_add(frames)) }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct FrameRate {
    pub numerator: u32,
    pub denominator: u32,
}

impl FrameRate {
    pub const FPS_24: Self = Self { numerator: 24, denominator: 1 };
    pub const FPS_30: Self = Self { numerator: 30, denominator: 1 };
    pub const FPS_60: Self = Self { numerator: 60, denominator: 1 };

    pub fn as_f64(self) -> f64 { self.numerator as f64 / self.denominator.max(1) as f64 }
}
