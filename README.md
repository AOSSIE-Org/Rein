<img width="1915" height="718" alt="Rein remote desktop banner showing desktop host and mobile browser client" src="https://github.com/user-attachments/assets/f1560464-bd32-455b-b5a5-a8bfdb76e1f4" />

# What's Rein

Rein is a **cross-platform remote desktop tool** with a browser-based client for both **touchscreen** and non-touch devices. The desktop server runs on supported host platforms, while clients connect through a web browser over your local network without installing separate client applications.

Rein provides screen mirroring, mouse and keyboard control, touch gestures, a virtual gamepad, clipboard copy and paste, and file sharing through a browser-based interface.

## Platform Support

* **Windows & Linux** — First-party supported and prioritised platforms, reflecting the maintainers' primary usage and testing access.
* **macOS** — Experimental and best-effort support. macOS is not currently a first-party priority, and compatibility or maintenance may be limited. Input injection requires Accessibility permissions (see [Testing Rein on Virtual Machines → macOS](#macos)).
* **Sponsorship** — Community funding or hardware sponsorship for macOS is welcome to help provide dedicated testing devices, ongoing maintenance, and sustained platform support.

## Features

Rein runs on a host computer and lets other devices on the same local
network view and control its desktop through a browser. You can use a
phone as a wireless trackpad or keyboard, view the desktop from another
computer, or use the on-screen gamepad for supported games. Connected
clients share the host's existing desktop session.

### Screen mirroring and audio

- **Desktop streaming:** View and control the host's existing desktop
  through a browser. Rein uses GStreamer for screen capture and H.264
  encoding, and WebRTC to deliver video to connected clients. Capture
  support includes Windows (DXGI), Linux (X11 or PipeWire/XDG Desktop
  Portal on Wayland), and experimental macOS support (AVFoundation).
- **Stream settings:** Choose Performance, Balanced, or Quality and set
  a target of 24, 30, 60, or 120 FPS, or leave the frame rate unlimited.
  These options are available in the host settings.
- **Viewing controls:** Show or hide the mirrored view, enter full-screen
  mode, and mute or unmute playback without disabling remote input.
- **Host audio:** On Windows and Linux, Rein can stream desktop audio
  alongside video using Opus. Browser playback initially starts muted
  because of autoplay restrictions. On experimental macOS builds, the
  default audio source is not a desktop loopback source, so capturing
  system sound requires additional audio routing and configuration.

> [!NOTE]
> Rein currently mirrors the host's existing desktop. An independent
> workspace or extended-desktop mode is
> [proposed in #462](https://github.com/AOSSIE-Org/Rein/issues/462),
> but is not available as a current feature.

### Mouse, touch, and keyboard

- **Trackpad and direct touch:** Move the pointer with relative trackpad
  gestures or tap the mirrored screen to click at a specific position.
  A desktop mouse can also be used with pointer lock.
- **Touch gestures:** Tap with one, two, or three fingers for left,
  right, or middle click; use two fingers to scroll, pinch to zoom,
  or double-tap and drag. A separate scroll mode supports one-finger
  scrolling. Pointer sensitivity and scroll direction can be adjusted.
- **Keyboard input:** Type using a mobile on-screen keyboard, including
  IME composition, or use a physical keyboard from a desktop browser.
  The on-screen key dock includes sticky modifiers for shortcuts,
  navigation keys, F1–F12, and media controls.

### Virtual gamepad

- **On-screen controls:** Use two analog sticks with stick clicks, a
  D-pad, face buttons, shoulder buttons, triggers, and Start/Select.
- **Adjustable layout:** Move and resize control groups to suit your
  device. Layout preferences are saved in the browser.
- **Host support:** Windows virtual Xbox 360 controller input requires
  ViGEmBus. Linux virtual joystick input requires access to
  `/dev/uinput`.

### Clipboard and file sharing

- **Clipboard text:** Copy text from the host clipboard to the browser's
  clipboard, or paste text from the client clipboard into the host.
  Client-to-host clipboard reading depends on browser permissions and
  a secure context. If reading is unavailable, the Paste button uses
  the host's existing clipboard rather than transferring client text.
- **Shared files:** Browse the host's configured shared directory,
  upload files with a picker or drag-and-drop (up to 512 MB per file),
  and download files to the client. The file list updates when files
  are added or removed. Uploaded files remain until removed manually.

### Connecting and personalizing Rein

- **Browser pairing:** Install Rein on the host, then connect a phone,
  tablet, or computer on the same local network without installing a
  separate client. The host settings show a QR code and connection link
  containing an access token; multiple clients can connect to the same
  host desktop.
- **Client settings:** Choose from eight light and dark themes, adjust
  pointer sensitivity and scroll direction, customize the gamepad,
  and control audio, mirror visibility, and Keep Awake. Screen wake lock
  depends on browser support.
- **Host settings:** Change the server port, shared directory, stream
  quality, and frame-rate limit. Some changes require a host restart.
  Windows and Linux are Rein's first-party priorities; macOS support
  remains experimental and best-effort.

For installation requirements and connection steps, see
[Development Setup](#development-setup),
[Prerequisites: GStreamer](#prerequisites-gstreamer), and
[Connecting a Client](#connecting-a-client).

### Diagnostics and troubleshooting

Rein's `/debug` page shows session and connection status,
network throughput and latency charts, and server/client logs with
filtering and copying tools. You can also consult the
[architecture documentation](https://github.com/AOSSIE-Org/Rein/wiki)
for more detail about the host, browser client, and streaming system.

## Technical Overview

Rein separates the browser-based client from the host-side services. The host manages screen capture, remote input, and connections, while connected browsers provide the interface for viewing and controlling the desktop.

Multiple clients can connect to the same host and interact with its existing desktop session.

## Input

Rein supports multiple forms of remote input, including:

<div align="center">

<table>
<tr>
<td align="center" ><img width="180" height="139" alt="Trackpad interface showing touch gesture area and quick action controls" src="https://github.com/user-attachments/assets/1f74a40d-69de-45d7-a878-335c18fa2774" /></td>
<td align="center"><img width="180" height="139" alt="Keyboard and mouse input options with physical and on-screen controls" src="https://github.com/user-attachments/assets/6c9e0c38-3544-42c1-885e-b77354a6246e" /></td>
<td align="center"><img width="180" height="139" alt="Direct touch screen interaction mapping taps to desktop coordinates" src="https://github.com/user-attachments/assets/477eeaa6-22ce-4fa8-90d1-8d5e58ddeabb" /></td>
<td align="center"><img width="180" height="139" alt="Customizable virtual gamepad with dual analog sticks and buttons" src="https://github.com/user-attachments/assets/a332ac8e-89bd-4fed-977b-c13ef2c96b05" /></td>
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
>
> **For macOS**
>
> macOS support is experimental and best-effort, as it is not currently a first-party priority; sustained support and testing depend on community sponsorship. Input injection requires Accessibility permissions granted to your terminal or IDE under **System Settings → Privacy & Security → Accessibility**.

### Prerequisites: GStreamer

Rein relies on a **system-installed GStreamer** for screen capture and streaming. Install the required packages before running the project.

> GStreamer **1.0** with the `good`, `bad`, and `ugly` plugin sets is required. The `gst-launch-1.0` binary must be available on your `PATH`.

**Linux (Debian / Ubuntu)**

```bash
sudo apt-get install -y \
  gstreamer1.0-tools \
  gstreamer1.0-plugins-base \
  gstreamer1.0-plugins-good \
  gstreamer1.0-plugins-bad \
  gstreamer1.0-plugins-ugly \
  gstreamer1.0-libav
```

**Linux (Arch / Manjaro)**

```bash
sudo pacman -S --needed \
  gstreamer \
  gst-plugins-base \
  gst-plugins-good \
  gst-plugins-bad \
  gst-plugins-ugly \
  gst-libav
```

**Linux (Fedora / RHEL)**

```bash
sudo dnf install -y \
  gstreamer1 \
  gstreamer1-plugins-base \
  gstreamer1-plugins-good \
  gstreamer1-plugins-bad-free \
  gstreamer1-plugins-ugly \
  gstreamer1-libav
```

**Linux (NixOS)**

Add the following to your `shell.nix` or `devShell`:

```nix
gst_all_1.gstreamer
gst_all_1.gst-plugins-base
gst_all_1.gst-plugins-good
gst_all_1.gst-plugins-bad
gst_all_1.gst-plugins-ugly
gst_all_1.gst-libav
```

Or use the provided `shell.nix` directly:

```bash
nix-shell
```

**macOS**

```bash
brew install gstreamer gst-plugins-base gst-plugins-good \
             gst-plugins-bad gst-plugins-ugly gst-libav
```

**Windows**

Download and run the official GStreamer MSVC runtime installer from the [GStreamer download page](https://gstreamer.freedesktop.org/download/). Install both the **runtime** and **development** packages. During installation, select the **Complete** install type to include all plugins.

After installation, ensure `C:\gstreamer\1.0\msvc_x86_64\bin` (or your install path) is added to your system `PATH`.

Verify the installation on any platform with:

```bash
gst-launch-1.0 --version
```

### Quick Start

1. Install GStreamer for your platform (see [Prerequisites: GStreamer](#prerequisites-gstreamer) above).

2. Install Node.js dependencies:

   ```bash
   npm install
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

4. Open the local application:

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

Connecting is as simple as scanning a QR code. On the PC running Rein, open the Settings page:

```text
http://localhost:3000/settings
```

You'll see a QR code there. Scan it with your phone (or copy the connection link shown there to any device on the same network), and the trackpad opens right in the browser.

The QR code carries a small access token that tells Rein this device is yours, so nobody else on your network can control your PC. That's also why opening the Rein address directly on a new device shows "Disconnected from host": scan the QR code first.

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

<img width="1280" height="946" alt="Rein application architecture and data flow diagram showing client browser, signalling server, WebRTC engine, and native drivers" src="https://github.com/user-attachments/assets/335632e6-de89-41fa-b9a7-fe222548e578" />

### At a Glance

* **Host / Application** - Runs Rein and coordinates the required services.
* **Server** - Handles client connections and communication with the host.
* **Client / Viewer** - Browser-based interface used to interact with the host.
* **GStreamer** - Handles screen capture and streaming.
* **Input Manager / Drivers** - Converts remote input into platform-specific system input.
* **WebRTC** - Provides real-time communication for input and media.
* **HTTP** - Used during connection setup and handshake.
* **File Transfer** - Handles file transfers and directory browsing between the client and host.

The architecture separates the browser-based client from the host-side services, allowing multiple clients to connect while keeping platform-specific functionality on the desktop server.

For a deeper look at the architecture, communication flow, WebRTC,
screen capture, input handling, and platform-specific implementation,
see the **[Rein Wiki](../../wiki)**.
