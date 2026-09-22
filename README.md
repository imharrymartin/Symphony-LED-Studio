# Symphony Studio Desktop 🎵💡

> **Universal Hardware LED Lighting Workstation with Real-Time WASAPI Audio Reactivity, Spotify Beat Sync, Multi-Brand Discovery Scanner, and Studio DAW Light Arranger.**

[![License: MIT](https://img.shields.io/badge/License-MIT-amber.svg)](https://opensource.org/licenses/MIT)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/)
[![Platform](https://img.shields.io/badge/platform-Windows%20WASAPI-lightgrey.svg)](https://microsoft.com)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-Donate-yellow.svg)](https://buymeacoffee.com/hazzamatas)

---

## ⚡ Universal Hardware Compatibility

Symphony Studio is built to work out of the box with virtually **any smart lighting setup**:

| Brand / Protocol | Connectivity | Discovery | Notes |
| :--- | :--- | :--- | :--- |
| **Magic Home / Flux LED** | TCP Port 5577 | Auto UDP & Subnet Scan | Instant zero-config connection |
| **Govee Local LAN** | UDP Port 4003 | Auto UDP Broadcast (4001) | Enable "LAN Control" in Govee Home app |
| **WLED Lightstrips** | HTTP JSON / UDP 21324 | Auto Subnet Probing (Port 80) | Zero-latency UDP realtime streaming |
| **Yeelight Smart Bulbs** | TCP Port 55443 | SSDP Broadcast (1982) | Enable "LAN Control" in Yeelight app |
| **Philips Hue Bridge** | REST API (Port 80) | SSDP Discovery | Connect to Hue Bridge & sync entertainment lights |
| **LIFX Smart Bulbs** | UDP Port 56700 | UDP Broadcast Scan | High-speed binary LAN protocol |
| **OpenRGB** | TCP Port 6742 | Local Socket Probe | Sync PC Motherboard, RAM, GPU, & case fans |
| **Arduino / FastLED** | USB COM Serial | Auto COM Port Detection | Works with Adalight protocol at 115200 baud |
| **Custom Webhooks** | HTTP GET/POST | Manual Configuration | Send RGB payloads to custom microcontrollers |

---

## ✨ Key Features

- 🔍 **Universal Network & USB Scanner**: One-click deep subnet sweep (`/24`) and broadcast beacon discovery to find and link any LED light on your home network in seconds.
- 🎛️ **Strict Hardware Design Theme**: High-contrast dark industrial workstation with 6 selectable hardware profiles (*Harsh Amber*, *High-Vis Cyan*, *Laser Emerald*, *Crimson Alert*, *Deep Ultraviolet*, *Solar Monochrome*).
- 🎵 **WASAPI Loopback Audio Reactivity**: Sub-millisecond FFT frequency breakdown (Bass, Mid, Treble) with real-time VU telemetry meters.
- ✨ **Spotify Beat Sync Engine**: Locks hardware light pulses directly to song beat structures, tempo curves, and live section changes.
- 📺 **Screen Reactivity**: Ultra-fast desktop display sampler extracting dominant pixel colors with audio volume multiplication.
- 🎬 **Studio Light Arranger DAW**: Multi-track timeline sequencer for custom light shows, interactive automation envelopes, snap grid, and live launchpad cues.
- ⌨️ **System-Wide PC Hotkeys**: Global background hooks to trigger colors and step sequences across any game or application.
- 🚫 **Zero Intrusive Popups**: Custom hardware toast and modal architecture.

---

## ⚡ Quick Start

### 1. Clone the Repository
```bash
git clone https://github.com/imharrymartin/Symphony-LED-Studio.git
cd Symphony-LED-Studio
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Launch the Application
- **Option A**: Double-click `Symphony.bat` (or `Symphony.pyw`).
- **Option B**: Run via command line:
  ```bash
  python desktop_app.py
  ```

### 4. Link Your Lights
1. Open the **Hardware Link** tab.
2. Click **Scan Network & USB for LEDs**.
3. Once your lights appear, click **Connect & Set as Active**!

---

## ☕ Support & Buy Me a Coffee

If you love **Symphony Studio** and want to support its ongoing development, consider buying me a coffee!

<a href="https://buymeacoffee.com/hazzamatas" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" width="180">
</a>

---

## 📄 License

This project is open-source and licensed under the **[MIT License](LICENSE)**.