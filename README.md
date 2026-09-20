<img width="1915" height="718" alt="Group 13" src="https://github.com/user-attachments/assets/f1560464-bd32-455b-b5a5-a8bfdb76e1f4" />

# What's Rein

Rein is a **cross-platform remote desktop tool** with a browser-based client for both **Touch Screen** as well as non-touch devices. The desktop server runs on supported host platforms, while clients connect through a web browser without requiring a separate native application.

Rein provides remote desktop interaction, real-time screen streaming, file transfer, and input support through a single interface.

## Features

* **Cross-platform server** - Run the Rein server on a variety of supported desktop platforms.
* **Browser-based client** - Connect from any modern browser with no native client required.
* **Multi-client support** - Connect multiple clients to a single host.
* **Flexible input** - Supports keyboard, mouse, and touchscreen input.
* **Real-time streaming** - Stream the host's screen using WebRTC.
* **File transfer** - Transfer files between the host and connected clients.
* **Cloud-ready interface** - Provides a standardized interface for cloud PC and cloud gaming providers.
* **Cross-platform input injection** - Uses Rein's input injection library for platform-specific system input, including support for environments such as Wayland.

## Technical Overview

Rein is designed to provide a common interface between a desktop environment and browser-based clients. This makes it suitable not only for direct remote desktop use, but also as an interface layer for **cloud PC and cloud gaming providers**.

The client is entirely browser-based, so providers can expose Rein without requiring users to install or maintain a separate native client application.

Multiple clients can connect to the same server, with the server coordinating communication and input between connected clients.

## Input

Rein supports multiple forms of remote input, including:

<div align="center">

<table>
<tr>
<td align="center" ><img width="180" height="139" alt="Trackpad" src="https://github.com/user-attachments/assets/1f74a40d-69de-45d7-a878-335c18fa2774" /></td>
<td align="center"><img width="180" height="139" alt="Keyboard and Mouse" src="https://github.com/user-attachments/assets/6c9e0c38-3544-42c1-885e-b77354a6246e" /></td>
<td align="center"><img width="180" height="139" alt="Touch" src="https://github.com/user-attachments/assets/477eeaa6-22ce-4fa8-90d1-8d5e58ddeabb" /></td>
<td align="center"><img width="180" height="139" alt="Virtual Gamepad" src="https://github.com/user-attachments/assets/a332ac8e-89bd-4fed-977b-c13ef2c96b05" /></td>
</tr>
<tr>
<td>Pointer movement, scrolling and gestures.</td>
<td>Physical keyboard and mouse as input.</td>
<td>Physical Touchscreen as input.</td>
<td>Virtual Gamepad for supported applications.</td>
</tr>
</table>

</div>

Rein includes a **cross-platform input injection library** for system-level keyboard and mouse input across supported operating systems. This addresses limitations in the Node.js ecosystem, particularly the lack of reliable input injection support on **Wayland**.

### WebRTC

Rein uses **WebRTC** for real-time communication instead of implementing a custom UDP-based communication protocol. Using WebRTC provides an established, battle-tested real-time communication stack for transporting media and real-time data while avoiding the need to maintain a custom networking protocol.

## Tech Stack

<div align="center">
<img src="https://github.com/user-attachments/assets/34d99ea7-b9ac-40b3-b32a-c758a376cc1f" height="55" alt="TanStack" />
&nbsp;&nbsp;&nbsp;&nbsp;
<img src="https://github.com/user-attachments/assets/6b3cdab3-8ebe-41ae-92ed-5c987111640c" height="55" alt="TypeScript" />
&nbsp;&nbsp;&nbsp;&nbsp;
<img src="https://github.com/user-attachments/assets/8e0dcc83-c6eb-4235-a9ea-d41580d3020a" height="55" alt="WebRTC" />
&nbsp;&nbsp;&nbsp;&nbsp;
<img src="https://github.com/user-attachments/assets/88de3842-b480-4cbe-b985-8521ba134e27" height="55" alt="GStreamer" />
</div>

## Development Setup

> [!NOTE]
> **For Linux**
>
> Rein uses a virtual input device (`/dev/uinput`) for keyboard and mouse injection.
>
> On Wayland, screen capture requires a working PipeWire + XDG Desktop Portal setup (typically provided by your desktop environment).
>
> Your user must also have permission to access `/dev/uinput`. A recommended setup is:
>
> ```bash
> sudo groupadd -f uinput
>
> sudo tee /etc/udev/rules.d/99-rein.rules <<EOF
> KERNEL=="uinput", MODE="0660", GROUP="uinput"
> EOF
>
> sudo usermod -aG uinput $USER
>
> sudo udevadm control --reload-rules
> sudo udevadm trigger
> ```
>
> Log out and back in after running the commands above.
>
> You can verify access with:
>
> ```bash
> ls -l /dev/uinput
> ```
>
> which should show:
>
> ```text
> crw-rw---- 1 root uinput ... /dev/uinput
> ```
>
> Additionally, some native dependencies are required. Install them via your package manager (see [`shell.nix`](shell.nix) for the list), or use `nix-shell` directly.
>
> **For Windows (Virtual Gamepad)**
>
> Virtual gamepad emulation requires the [ViGEmBus](https://github.com/nefarius/ViGEmBus/releases) kernel driver installed on the host machine. If ViGEmBus is not installed, virtual controller input injection will be disabled.

### Quick Start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the development server:

   ```bash
   npm run dev
   ```

3. Open the local application:

   ```text
   http://localhost:3000
   ```

## Connecting a Client

### 1. Configure the Firewall

Ensure the host allows incoming connections on:

* **3000/TCP** — Frontend and WebSocket signaling
* **4000–4050/UDP** — WebRTC media and input channels

**Linux (UFW):**

```bash
sudo ufw allow 3000/tcp
sudo ufw allow 4000:4050/udp
```

**NixOS:**

```nix
networking.firewall = {
  allowedTCPPorts = [ 3000 ];
  allowedUDPPortRanges = [
    { from = 4000; to = 4050; }
  ];
};
```

Port `5004/UDP` is an internal loopback relay between GStreamer and Rein and must not be exposed.

### 2. Connect Through a Browser

Open the Rein server from a browser using:

```text
http://<YOUR_PC_IP>:3000
```

The client does not require a separate installation.

## Testing Rein on Virtual Machines

When testing Rein inside a Virtual Machine (VirtualBox), the VM must allow other devices on the network to access the server.

### Network Configuration

1. Open **VM Settings**.
2. Go to **Network**.
3. Change the adapter from **NAT → Bridged Adapter**.
4. Select your active **Wi-Fi or Ethernet interface**.

This allows devices on the same network to connect to the Rein server running inside the VM.

### macOS

Grant Accessibility permission to your terminal or IDE in:

**System Settings → Privacy & Security → Accessibility**

---

## Architecture

<img width="1280" height="946" alt="Rein application architecture and data flow" src="https://github.com/user-attachments/assets/335632e6-de89-41fa-b9a7-fe222548e578" />

### At a Glance

* **Host / Application** - Runs Rein and coordinates the required services.
* **Server** - Handles client connections and communication with the host.
* **Client / Viewer** - Browser-based interface used to interact with the host.
* **GStreamer** - Handles screen capture and streaming.
* **Input Manager / Drivers** - Converts remote input into platform-specific system input.
* **WebRTC** - Provides real-time communication for input and media.
* **HTTP** - Used during connection setup and handshake.
* **FTP / File Transfer** - Handles file transfers between the client and host.

The architecture separates the browser-based client from the host-side services, allowing multiple clients to connect while keeping platform-specific functionality on the desktop server.

For a deeper look at the architecture, communication flow, WebRTC,
screen capture, input handling, and platform-specific implementation,
see the **[Rein Wiki](../../wiki)**.
