# Rein

A cross-platform, LAN-based remote control. It allows touchscreen devices to act as a trackpad and keyboard for a desktop system through a locally served web interface.

## Features
- Use any phone or tablet as a remote trackpad and keyboard
- LAN-based communication (no external server required)
- Real-time cursor and input streaming using WebSockets
- QR-based quick connection from mobile devices
- Cross-platform support (Windows, macOS, Linux)

## Tech Stack

*   **Framework**: [TanStack Start](https://tanstack.com/start)
*   **Language**: TypeScript
*   **Real-time**: Native WebSockets (`ws`)
*   **Input Simulation**: [@nut-tree/nut-js](https://github.com/nut-tree/nut.js)


## Architecture

Rein uses a local client–server architecture over LAN.

- Desktop runs a local web server and input controller
- Mobile device connects through a browser
- Inputs are sent in real time using WebSockets
- Desktop simulates mouse and keyboard actions using Nut.js

## Development Setup

This project behaves like a standard Node.js application and can run on Windows, macOS, or Linux. 

## Project Structure

- /src – Application source code
- /public – Static assets and icons
- Server logic – WebSocket and input handling
- Web UI – Mobile remote control interface

### Quick Start

1.  Install dependencies:
    ```bash
    npm install
    ```
2.  Start the development server:
    ```bash
    npm run dev
    ```
3.  Open the local app: `http://localhost:3000`

## 📱 How to Use (Remote Control)

To control this computer from your phone/tablet:

### 1. Configure Firewall
Ensure your computer allows incoming connections on:
- **3000** (Frontend + Input Server)

**Linux (UFW):**
```bash
sudo ufw allow 3000/tcp
```

### 2. Connect Mobile Device
1.  Ensure your phone and computer are on the **same Wi-Fi network**.
2.  On your computer, open the app (`http://localhost:3000/settings`).
3.  Scan the QR code with your phone OR manually enter:
    `http://<YOUR_PC_IP>:3000`

### 3. Usage Tips
- **Trackpad**: Swipe to move, tap to click.
- **Scroll**: Toggle "Scroll Mode" or use two fingers.
- **Keyboard**: Tap the "Keyboard" button to use your phone's native keyboard.

## Troubleshooting

- If the mobile device cannot connect, ensure both devices are on the same network.
- Make sure port 3000 is allowed through your firewall.
- On some systems (especially Wayland), cursor synchronization may behave differently.


## License

This project is licensed under the terms specified in the LICENSE file.


Visit the [Discord Channel](https://discord.com/invite/C8wHmwtczs) for interacting with the community!
(Go to Project-> Rein)

---

> Contributions are welcome! Please leave a star ⭐ to show your support.