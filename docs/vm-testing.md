# VM Testing Guide for Rein

This guide explains how to set up a virtual machine environment to test Rein across operating systems — particularly useful for contributors who want to test the Windows or macOS target while developing on Linux, or vice versa.

---

## Table of Contents

1. [Why test in a VM?](#why-test-in-a-vm)
2. [Prerequisites](#prerequisites)
3. [VirtualBox Setup](#virtualbox-setup)
   - [Windows Guest](#windows-guest-virtualbox)
   - [Linux Guest (Ubuntu)](#linux-guest-ubuntu-virtualbox)
   - [macOS Guest](#macos-guest-virtualbox)
4. [VMware Setup](#vmware-setup)
   - [Windows Guest](#windows-guest-vmware)
   - [Linux Guest](#linux-guest-vmware)
5. [Network Configuration](#network-configuration)
6. [Testing Rein Between Host and Guest](#testing-rein-between-host-and-guest)
7. [Virtual Input Testing](#virtual-input-testing)
8. [Screen Capture Testing](#screen-capture-testing)
9. [Known Issues and Workarounds](#known-issues-and-workarounds)
10. [CI / Automated VM Testing](#ci--automated-vm-testing)

---

## Why test in a VM?

Rein's core features — virtual input injection, screen capture, and WebRTC signalling — behave differently across platforms. VMs allow you to:

- Test the **Windows `SendInput` driver** from a Linux dev machine
- Test the **Linux `uinput` driver** without risking your host's input devices
- Reproduce platform-specific Electron permission dialogs
- Simulate a **two-machine LAN** scenario (host ↔ guest) on a single developer laptop

---

## Prerequisites

| Tool | Version | Download |
|------|---------|----------|
| VirtualBox | ≥ 7.0 | https://www.virtualbox.org/wiki/Downloads |
| VMware Workstation / Fusion | ≥ 17 / 13 | https://www.vmware.com/products/desktop-hypervisor |
| Node.js | 20 LTS | https://nodejs.org |
| Git | any | https://git-scm.com |

---

## VirtualBox Setup

### Windows Guest (VirtualBox)

1. **Download** a Windows 10/11 ISO from Microsoft's media creation tool.
2. **New VM** → Name: `Rein-Windows`, Type: Microsoft Windows, Version: Windows 11 (64-bit).
3. **RAM**: 4 GB minimum; **CPU**: 2 cores; **Disk**: 60 GB (dynamically allocated).
4. **Settings → Display**: Enable 3D acceleration; set Video Memory to 128 MB.
5. **Settings → Network**: Adapter 1 → `Host-only Adapter` (creates a private `192.168.56.x` LAN between host and guest — ideal for Rein testing).
6. Boot the ISO, complete Windows installation.
7. **Install Guest Additions** (Devices → Insert Guest Additions CD) for clipboard and better display.
8. Inside the guest, clone Rein and run:
   ```powershell
   npm install
   npm run electron
   ```

### Linux Guest (Ubuntu) (VirtualBox)

1. Download Ubuntu 22.04 LTS ISO.
2. **New VM** → Type: Linux, Version: Ubuntu (64-bit).
3. **RAM**: 2 GB; **CPU**: 2 cores; **Disk**: 40 GB.
4. **Network**: Host-only Adapter (same as above).
5. After install, enable `uinput` for virtual input testing:
   ```bash
   sudo modprobe uinput
   echo 'uinput' | sudo tee /etc/modules-load.d/uinput.conf
   sudo usermod -aG input $USER   # re-login after this
   ```
6. Install ydotool:
   ```bash
   sudo apt install ydotool
   sudo systemctl enable --now ydotoold
   ```
7. Clone Rein and run:
   ```bash
   npm install
   npm run electron
   ```

### macOS Guest (VirtualBox)

> VirtualBox macOS guests are only supported on Apple hardware (Apple Silicon or Intel Mac host). It violates Apple's EULA to run macOS in a VM on non-Apple hardware.

On an Intel Mac host:
1. Use [macOS Monterey / Ventura installer from App Store](https://support.apple.com/en-us/101662).
2. Follow the [VirtualBox macOS guide](https://www.virtualbox.org/manual/UserManual.html).
3. Network: Host-only Adapter.
4. Screen capture on macOS requires granting **Screen Recording** permission to Electron in System Preferences → Privacy & Security → Screen Recording.

---

## VMware Setup

### Windows Guest (VMware)

1. Open VMware Workstation → New Virtual Machine → Typical.
2. Select Windows ISO; VMware auto-detects OS.
3. **RAM**: 4 GB; **CPU**: 2 cores.
4. **Network**: VMnet1 (Host-only) — gives a `192.168.x.x` network to host and guest.
5. Install VMware Tools after Windows setup.
6. Clone Rein and `npm run electron` as above.

### Linux Guest (VMware)

1. New VM → Linux → Ubuntu 64-bit.
2. **Network**: Host-only.
3. VMware Tools: `sudo apt install open-vm-tools open-vm-tools-desktop`
4. `uinput` and ydotool setup same as VirtualBox Linux guest above.

---

## Network Configuration

For Rein to work between host and guest, both need to be on the same virtual network.

### VirtualBox Host-only
```
Host IP:  192.168.56.1   (vboxnet0)
Guest IP: 192.168.56.101 (DHCP assigned)
```

Verify connectivity:
```bash
# From host, ping guest
ping 192.168.56.101

# From guest, ping host
ping 192.168.56.1
```

### VMware Host-only
```
Host IP:  192.168.56.1   (VMnet1)
Guest IP: 192.168.56.128 (DHCP assigned)
```

### NAT (alternative)
If Host-only is not available, use **NAT with port forwarding**:
- Forward host port `7505` (Rein's default WebSocket port) to guest port `7505`.
- In VirtualBox: Settings → Network → Port Forwarding → add rule `Host 7505 → Guest 7505`.

---

## Testing Rein Between Host and Guest

1. **Start Rein on the Guest** (this is the "server" / machine being controlled):
   ```bash
   npm run electron
   # Note the token shown in the Rein UI
   ```

2. **Connect from the Host** (this is the "client" / controller):
   - Open Rein on the host.
   - Enter the guest's IP address and the token.
   - Click Connect.

3. **Expected result**: Host can see the guest's screen and control its keyboard/mouse.

---

## Virtual Input Testing

### Linux (uinput)

Verify that `uinput` events are being injected correctly:

```bash
# On the guest, monitor input events
sudo evtest /dev/input/event<N>   # replace N with the uinput device index
```

You should see `EV_KEY` and `EV_REL` events when you type/move the mouse from the host.

### Windows (SendInput)

Use the [Spy++](https://docs.microsoft.com/en-us/visualstudio/debugger/spy-increment-views) tool (included with Visual Studio) or `AutoHotkey` to verify `WM_KEYDOWN`/`WM_MOUSEMOVE` messages are being posted.

### macOS (CGEvent)

```bash
# Monitor events with iosnoop (requires SIP disabled) or use Accessibility Inspector
/usr/bin/log stream --predicate 'subsystem == "com.apple.HIToolbox"'
```

---

## Screen Capture Testing

| Platform | Capture method | Test |
|----------|---------------|------|
| Linux X11 | `XShm` / `getdisplayMedia` | `xwd -root -out /tmp/test.xwd` |
| Linux Wayland | PipeWire portal | `gst-launch-1.0 pipewiresrc ! videoconvert ! pngenc ! filesink location=/tmp/test.png` |
| Windows | `getdisplayMedia` | Windows Game Bar (Win+G) should show Rein as a capturable window |
| macOS | `getdisplayMedia` | Screen Recording permission must be granted in System Preferences |

---

## Known Issues and Workarounds

| Issue | Platform | Workaround |
|-------|----------|-----------|
| `uinput: Permission denied` | Linux guest | `sudo usermod -aG input $USER` + re-login |
| Screen capture black on Wayland | Linux | Launch Electron with `--ozone-platform=x11` or enable PipeWire portal |
| `ydotoold` not running | Linux | `sudo systemctl start ydotoold` |
| macOS rejects `CGEventPost` | macOS | Grant Accessibility + Screen Recording in System Preferences |
| VirtualBox 3D crash on Windows | Windows guest | Disable 3D acceleration (Rein runs fine without GPU compositing) |
| Electron sandbox error in VM | All | Launch with `--no-sandbox` for testing only (do NOT ship with this flag) |

---

## CI / Automated VM Testing

For contributors, the `build.yml` workflow already tests compilation on all three platforms via GitHub Actions hosted runners. For **integration tests** that require actual input injection:

```yaml
# Planned addition during GSoC 2026 (see Issue #107)
- name: Run integration tests (Linux, uinput)
  if: runner.os == 'Linux'
  run: |
    sudo modprobe uinput
    npm run test:integration
```

The full VM-based integration test harness (using `qemu` headless VMs with snapshot/restore) will be implemented during GSoC.

---

## Related Issues / PRs

- Issue #107 — original request for VM testing documentation
- Issue #115 — packaging pipelines (release workflow)
- Issue #206 — Flatpak distribution
