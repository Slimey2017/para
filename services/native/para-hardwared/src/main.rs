//! Safe read-only Linux hardware probe for PARA.
//!
//! It demonstrates the hardware-service boundary by reading public procfs and
//! sysfs metadata. It does not load modules, claim devices, write sysfs, or need root.

use std::fs;
use std::path::Path;

fn count_entries(path: &str) -> usize {
    fs::read_dir(Path::new(path)).map(|entries| entries.count()).unwrap_or(0)
}

fn main() {
    let cpu_models = fs::read_to_string("/proc/cpuinfo")
        .map(|text| text.lines().filter(|line| line.starts_with("model name")).count())
        .unwrap_or(0);
    let drm_cards = count_entries("/sys/class/drm");
    let input_nodes = count_entries("/sys/class/input");

    println!(
        "{{\"service\":\"para-hardwared\",\"mode\":\"read-only\",\"cpu_threads_seen\":{},\"drm_entries\":{},\"input_entries\":{},\"writes_enabled\":false}}",
        cpu_models, drm_cards, input_nodes
    );
}
