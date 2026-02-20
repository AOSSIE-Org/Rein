use std::{thread, time::Duration, io};
use vigem_client::{Client, TargetId, Xbox360Wired, XButtons, XGamepad};

fn press_button(target: &mut Xbox360Wired<Client>, buttons: XButtons, label: &str) {
    println!("🎮 Pressing: {}", label);
    let gamepad = XGamepad { buttons, ..Default::default() };
    target.update(&gamepad).unwrap();
    thread::sleep(Duration::from_millis(200));
    target.update(&XGamepad::default()).unwrap();
    thread::sleep(Duration::from_millis(300));
}

fn move_stick(target: &mut Xbox360Wired<Client>, lx: i16, ly: i16, label: &str) {
    println!("🕹️  Stick move: {}", label);
    let gamepad = XGamepad { thumb_lx: lx, thumb_ly: ly, ..Default::default() };
    target.update(&gamepad).unwrap();
    thread::sleep(Duration::from_millis(300));
    target.update(&XGamepad::default()).unwrap();
    thread::sleep(Duration::from_millis(200));
}

fn main() {
    println!("🎮 Rein Virtual Controller Prototype");
    println!("=====================================");

    let client = Client::connect().expect("❌ Failed to connect to ViGEmBus.");
    let mut target = Xbox360Wired::new(client, TargetId::XBOX360_WIRED);
    target.plugin().unwrap();
    target.wait_ready().unwrap();

    println!("✅ Virtual Xbox 360 controller connected! (You should hear Windows connect sound)");
    println!("\n👉 Now do this BEFORE pressing Enter:");
    println!("   1. Open joy.cpl (Win+R → type joy.cpl → Enter)");
    println!("   2. Select 'Controller (XBOX 360...)' → click Properties → Test tab");
    println!("   3. Start your screen recording (ScreenToGif or Win+G)");
    println!("\n⏳ Press Enter when you are ready and recording...");

    let mut input = String::new();
    io::stdin().read_line(&mut input).unwrap();

    println!("\n--- Buttons ---");
    press_button(&mut target, XButtons!(A), "A Button");
    press_button(&mut target, XButtons!(B), "B Button");
    press_button(&mut target, XButtons!(X), "X Button");
    press_button(&mut target, XButtons!(Y), "Y Button");
    press_button(&mut target, XButtons!(LB), "Left Bumper (LB)");
    press_button(&mut target, XButtons!(RB), "Right Bumper (RB)");
    press_button(&mut target, XButtons!(START), "Start");
    press_button(&mut target, XButtons!(BACK), "Back/Select");

    println!("\n--- D-Pad ---");
    press_button(&mut target, XButtons!(UP), "D-Pad Up");
    press_button(&mut target, XButtons!(DOWN), "D-Pad Down");
    press_button(&mut target, XButtons!(LEFT), "D-Pad Left");
    press_button(&mut target, XButtons!(RIGHT), "D-Pad Right");

    println!("\n--- Left Analog Stick ---");
    move_stick(&mut target, 32767, 0, "Right");
    move_stick(&mut target, -32768, 0, "Left");
    move_stick(&mut target, 0, 32767, "Up");
    move_stick(&mut target, 0, -32768, "Down");

    println!("\n✅ Done! Stop your recording now.");
    thread::sleep(Duration::from_secs(2));
    println!("🔌 Unplugging virtual controller...");
}
