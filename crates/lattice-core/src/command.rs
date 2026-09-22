use crate::{Clip, FrameTime, Project};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum CommandError {
    #[error("track not found: {0}")]
    TrackNotFound(Uuid),
    #[error("clip not found: {0}")]
    ClipNotFound(Uuid),
}

pub trait EditCommand: Send {
    fn label(&self) -> &'static str;
    fn apply(&mut self, project: &mut Project) -> Result<(), CommandError>;
    fn undo(&mut self, project: &mut Project) -> Result<(), CommandError>;
}

pub struct History {
    undo: Vec<Box<dyn EditCommand>>,
    redo: Vec<Box<dyn EditCommand>>,
    limit: usize,
}

impl History {
    pub fn new(limit: usize) -> Self { Self { undo: vec![], redo: vec![], limit } }

    pub fn execute(&mut self, mut cmd: Box<dyn EditCommand>, project: &mut Project) -> Result<(), CommandError> {
        cmd.apply(project)?;
        self.undo.push(cmd);
        self.redo.clear();
        if self.undo.len() > self.limit { self.undo.remove(0); }
        Ok(())
    }

    pub fn undo(&mut self, project: &mut Project) -> Result<(), CommandError> {
        if let Some(mut cmd) = self.undo.pop() {
            cmd.undo(project)?;
            self.redo.push(cmd);
        }
        Ok(())
    }

    pub fn redo(&mut self, project: &mut Project) -> Result<(), CommandError> {
        if let Some(mut cmd) = self.redo.pop() {
            cmd.apply(project)?;
            self.undo.push(cmd);
        }
        Ok(())
    }
}

pub struct MoveClip {
    pub track_id: Uuid,
    pub clip_id: Uuid,
    pub to: FrameTime,
    previous: Option<FrameTime>,
}

impl MoveClip {
    fn clip_mut<'a>(&self, project: &'a mut Project) -> Result<&'a mut Clip, CommandError> {
        let track = project.tracks.iter_mut().find(|t| t.id == self.track_id)
            .ok_or(CommandError::TrackNotFound(self.track_id))?;
        track.clips.iter_mut().find(|c| c.id == self.clip_id)
            .ok_or(CommandError::ClipNotFound(self.clip_id))
    }
}

impl EditCommand for MoveClip {
    fn label(&self) -> &'static str { "クリップを移動" }
    fn apply(&mut self, project: &mut Project) -> Result<(), CommandError> {
        let to = self.to;
        let clip = self.clip_mut(project)?;
        self.previous.get_or_insert(clip.start);
        clip.start = to;
        Ok(())
    }
    fn undo(&mut self, project: &mut Project) -> Result<(), CommandError> {
        if let Some(previous) = self.previous {
            self.clip_mut(project)?.start = previous;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Track, TrackKind};

    #[test]
    fn move_clip_round_trip() {
        let mut p = Project::new_4k60("test");
        let track_id = Uuid::new_v4();
        let clip_id = Uuid::new_v4();
        p.tracks.push(Track { id: track_id, name: "V1".into(), kind: TrackKind::Video, muted:false, locked:false, clips: vec![Clip { id:clip_id, asset_id:Uuid::new_v4(), name:"A".into(), start:FrameTime(0), duration:FrameTime(10), source_in:FrameTime(0), enabled:true }] });
        let mut h = History::new(32);
        h.execute(Box::new(MoveClip { track_id, clip_id, to: FrameTime(100), previous: None }), &mut p).unwrap();
        assert_eq!(p.tracks[0].clips[0].start, FrameTime(100));
        h.undo(&mut p).unwrap();
        assert_eq!(p.tracks[0].clips[0].start, FrameTime(0));
    }
}
