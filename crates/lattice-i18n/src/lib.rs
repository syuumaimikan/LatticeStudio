use std::collections::HashMap;

pub struct Catalog { values: HashMap<String, String> }
impl Catalog {
    pub fn japanese() -> Self {
        let raw = include_str!("../../../locales/ja-JP.json");
        Self { values: serde_json::from_str(raw).expect("embedded ja-JP catalog") }
    }
    pub fn t<'a>(&'a self, key: &'a str) -> &'a str { self.values.get(key).map(String::as_str).unwrap_or(key) }
}
