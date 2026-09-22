use lattice_core::Project;
use lattice_i18n::Catalog;

fn main() {
    let ja = Catalog::japanese();
    let project = Project::new_4k60("新規4Kプロジェクト");
    println!("{} 1.0.0", ja.t("app.name"));
    println!("{} — {}x{} @ {:.2}fps", project.name, project.width, project.height, project.frame_rate.as_f64());
    println!("GUI reference: preview/index.html");
}
