// Fixed maximum 4K buffers; no allocation in the per-frame path.
static mut INPUT: [u8; 3840 * 2160 * 4] = [0; 3840 * 2160 * 4];
static mut OUTPUT: [u8; 3840 * 2160 * 3] = [0; 3840 * 2160 * 3];
#[unsafe(no_mangle)]
pub extern "C" fn input_ptr() -> *mut u8 { &raw mut INPUT as *mut u8 }
#[unsafe(no_mangle)]
pub extern "C" fn output_ptr() -> *mut u8 { &raw mut OUTPUT as *mut u8 }
#[unsafe(no_mangle)]
pub extern "C" fn rgba_to_rgb(pixels: usize) -> usize {
    if pixels > 3840 * 2160 { return 0; }
    unsafe {
        let src = input_ptr(); let dst = output_ptr();
        for i in 0..pixels {
            for c in 0..3 { *dst.add(i*3+c) = *src.add(i*4+c); }
        }
    }
    pixels * 3
}
