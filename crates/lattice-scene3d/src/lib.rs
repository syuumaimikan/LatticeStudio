use glam::{Quat, Vec3};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct Transform {
    pub position: Vec3,
    pub rotation: Quat,
    pub scale: Vec3,
}
impl Default for Transform { fn default() -> Self { Self { position:Vec3::ZERO, rotation:Quat::IDENTITY, scale:Vec3::ONE } } }

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum SceneNodeKind {
    Group,
    Camera { fov_y_deg: f32 },
    VideoPlane { asset_id: Uuid },
    Text { text: String, vertical: bool },
    Model { uri: String },
    Light { intensity: f32 },
    AudioEmitter { gain_db: f32 },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SceneNode {
    pub id: Uuid,
    pub name: String,
    pub transform: Transform,
    pub visible: bool,
    pub kind: SceneNodeKind,
    pub children: Vec<SceneNode>,
}

impl SceneNode {
    pub fn group(name: impl Into<String>) -> Self { Self { id:Uuid::new_v4(), name:name.into(), transform:Transform::default(), visible:true, kind:SceneNodeKind::Group, children:vec![] } }
}
