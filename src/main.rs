use gilrs::Gilrs;
use std::thread;
use std::time::Duration;

fn main() {
    println!("🎮 Rein Controller Prototype Started");
    
    let mut gilrs = Gilrs::new().unwrap();
    
    loop {
        while let Some(event) = gilrs.next_event() {
            println!("Gamepad: {} - Event: {:?}", event.id, event.event);
        }
        
        thread::sleep(Duration::from_millis(10));
    }
}
