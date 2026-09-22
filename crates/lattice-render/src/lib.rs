use std::collections::{HashMap, VecDeque};
use uuid::Uuid;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct NodeId(pub Uuid);
impl NodeId {
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }
}

#[derive(Clone, Debug)]
pub enum RenderOp {
    Decode { asset: String },
    Color,
    Blur { radius: f32 },
    Composite,
    Scene3d,
    Output,
}

#[derive(Clone, Debug)]
pub struct RenderNode {
    pub id: NodeId,
    pub op: RenderOp,
    pub dependencies: Vec<NodeId>,
}

#[derive(Default)]
pub struct RenderGraph {
    pub nodes: Vec<RenderNode>,
}

impl RenderGraph {
    pub fn schedule(&self) -> Result<Vec<NodeId>, GraphError> {
        let mut indegree = HashMap::<NodeId, usize>::new();
        let mut outgoing = HashMap::<NodeId, Vec<NodeId>>::new();
        for n in &self.nodes {
            indegree.entry(n.id).or_default();
            for d in &n.dependencies {
                *indegree.entry(n.id).or_default() += 1;
                outgoing.entry(*d).or_default().push(n.id);
            }
        }
        let mut q: VecDeque<_> = indegree
            .iter()
            .filter_map(|(&id, &d)| (d == 0).then_some(id))
            .collect();
        let mut order = Vec::with_capacity(self.nodes.len());
        while let Some(id) = q.pop_front() {
            order.push(id);
            for next in outgoing.get(&id).into_iter().flatten() {
                let d = indegree.get_mut(next).expect("known node");
                *d -= 1;
                if *d == 0 {
                    q.push_back(*next);
                }
            }
        }
        if order.len() != self.nodes.len() {
            return Err(GraphError::Cycle);
        }
        Ok(order)
    }
}

#[derive(Debug, thiserror::Error)]
pub enum GraphError {
    #[error("render graph contains a cycle")]
    Cycle,
}

pub trait GpuBackend: Send + Sync {
    fn name(&self) -> &'static str;
    fn supports_zero_copy_decode(&self) -> bool;
    fn submit(&self, graph: &RenderGraph) -> Result<(), String>;
}
