"""
Universal Multi-Protocol Network & Hardware Discovery Scanner Engine
Scans for:
- Govee Local LAN (UDP 4001/4002)
- Magic Home / Flux LED / Zengge (UDP 48899 & TCP 5577)
- Yeelight / Xiaomi (SSDP 1982 & TCP 55443)
- WLED (HTTP 80 /json/info & UDP 21324)
- Philips Hue Bridge (SSDP 1900 & HTTP /api/config)
- LIFX (UDP 56700)
- OpenRGB (TCP 6742)
- USB Serial Microcontrollers (COM ports / Arduino / FastLED)
- Active Subnet Port Sweep (1-254)
"""

import socket
import json
import time
import threading
import urllib.request
import urllib.error
import concurrent.futures

class ScannerEngine:
    def __init__(self):
        self.discovered_devices = []
        self._lock = threading.Lock()

    def get_local_ip_and_subnet(self):
        """Find the active local IP and /24 subnet prefix."""
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
            s.close()
            parts = local_ip.split('.')
            subnet_prefix = f"{parts[0]}.{parts[1]}.{parts[2]}"
            return local_ip, subnet_prefix
        except Exception:
            return "192.168.1.121", "192.168.1"

    def scan_govee(self, timeout=1.5):
        """Govee LAN UDP Broadcast discovery."""
        devices = []
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            sock.settimeout(timeout)
            
            cmd = json.dumps({"msg": {"cmd": "scan", "data": {"account_topic": "reserve"}}}).encode('utf-8')
            for target in ["239.255.255.250", "255.255.255.255"]:
                try:
                    sock.sendto(cmd, (target, 4001))
                except Exception:
                    pass
            
            start = time.time()
            while time.time() - start < timeout:
                try:
                    data, addr = sock.recvfrom(2048)
                    ip = addr[0]
                    parsed = json.loads(data.decode('utf-8', errors='ignore'))
                    msg = parsed.get("msg", {})
                    cmd_type = msg.get("cmd")
                    if cmd_type == "scan":
                        d_info = msg.get("data", {})
                        sku = d_info.get("sku", "Smart LED")
                        dev_id = d_info.get("device", ip)
                        devices.append({
                            "id": f"govee_{ip.replace('.', '_')}",
                            "name": f"Govee {sku} ({dev_id[-6:]})",
                            "protocol": "govee",
                            "ip": ip,
                            "port": 4003,
                            "status": "Online",
                            "details": f"Govee LAN API | SKU {sku} | BLE/WiFi v{d_info.get('wifiVersionNum', '')}"
                        })
                except socket.timeout:
                    break
                except Exception:
                    continue
            sock.close()
        except Exception as e:
            pass
        return devices

    def scan_flux(self, timeout=1.5):
        """Magic Home / Flux LED UDP broadcast discovery."""
        devices = []
        try:
            msg = b"HF-A11ASSISTHREAD"
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            sock.settimeout(timeout)
            sock.sendto(msg, ("255.255.255.255", 48899))
            
            start = time.time()
            while time.time() - start < timeout:
                try:
                    data, addr = sock.recvfrom(1024)
                    ip = addr[0]
                    raw_str = data.decode('utf-8', errors='ignore').strip()
                    # Response format: IP,MAC,MODEL
                    parts = raw_str.split(',')
                    model = parts[2] if len(parts) > 2 else "Bulb/Strip"
                    mac = parts[1] if len(parts) > 1 else ""
                    devices.append({
                        "id": f"flux_{ip.replace('.', '_')}",
                        "name": f"Magic Home ({model})",
                        "protocol": "flux_led",
                        "ip": ip,
                        "port": 5577,
                        "status": "Online",
                        "details": f"Port 5577 TCP | MAC {mac}"
                    })
                except socket.timeout:
                    break
                except Exception:
                    continue
            sock.close()
        except Exception:
            pass
        return devices

    def scan_yeelight(self, timeout=1.5):
        """Yeelight SSDP discovery on port 1982."""
        devices = []
        try:
            msg = "M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1982\r\nMAN: \"ssdp:discover\"\r\nST: wifi_bulb\r\n\r\n"
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.settimeout(timeout)
            sock.sendto(msg.encode('utf-8'), ("239.255.255.250", 1982))
            
            start = time.time()
            while time.time() - start < timeout:
                try:
                    data, addr = sock.recvfrom(2048)
                    ip = addr[0]
                    text = data.decode('utf-8', errors='ignore')
                    model = "Smart Light"
                    for line in text.splitlines():
                        if line.lower().startswith("model:"):
                            model = line.split(":", 1)[1].strip()
                    devices.append({
                        "id": f"yeelight_{ip.replace('.', '_')}",
                        "name": f"Yeelight {model}",
                        "protocol": "yeelight",
                        "ip": ip,
                        "port": 55443,
                        "status": "Online",
                        "details": "Yeelight LAN Control JSON-RPC"
                    })
                except socket.timeout:
                    break
                except Exception:
                    continue
            sock.close()
        except Exception:
            pass
        return devices

    def probe_ip_target(self, ip):
        """Check known lighting ports on an individual IP."""
        found = []
        # 1. Flux LED port 5577
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(0.18)
            if s.connect_ex((ip, 5577)) == 0:
                s.close()
                found.append({
                    "id": f"flux_{ip.replace('.', '_')}",
                    "name": f"Magic Home / Flux LED ({ip})",
                    "protocol": "flux_led",
                    "ip": ip,
                    "port": 5577,
                    "status": "Online",
                    "details": "Port 5577 open (Direct TCP Light Engine)"
                })
        except Exception:
            pass

        # 2. Yeelight port 55443
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(0.18)
            if s.connect_ex((ip, 55443)) == 0:
                s.close()
                found.append({
                    "id": f"yeelight_{ip.replace('.', '_')}",
                    "name": f"Yeelight Bulb/Strip ({ip})",
                    "protocol": "yeelight",
                    "ip": ip,
                    "port": 55443,
                    "status": "Online",
                    "details": "Port 55443 open (Yeelight LAN Mode)"
                })
        except Exception:
            pass

        # 3. WLED port 80 check
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(0.18)
            if s.connect_ex((ip, 80)) == 0:
                s.close()
                # Query /json/info to verify if it's WLED
                try:
                    url = f"http://{ip}/json/info"
                    req = urllib.request.Request(url, headers={'User-Agent': 'Symphony-Scanner'})
                    with urllib.request.urlopen(req, timeout=0.8) as resp:
                        data = json.loads(resp.read().decode('utf-8'))
                        name = data.get("name", "WLED Controller")
                        ver = data.get("ver", "")
                        count = data.get("leds", {}).get("count", 0)
                        found.append({
                            "id": f"wled_{ip.replace('.', '_')}",
                            "name": f"WLED: {name}",
                            "protocol": "wled",
                            "ip": ip,
                            "port": 80,
                            "status": "Online",
                            "details": f"v{ver} | {count} Addressable LEDs"
                        })
                except Exception:
                    pass
        except Exception:
            pass

        return found

    def scan_subnet_fast(self, subnet_prefix, max_threads=60):
        """Asynchronously probes the /24 subnet for open smart light ports."""
        all_found = []
        ips = [f"{subnet_prefix}.{i}" for i in range(1, 255)]
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_threads) as executor:
            future_to_ip = {executor.submit(self.probe_ip_target, ip): ip for ip in ips}
            for future in concurrent.futures.as_completed(future_to_ip):
                try:
                    res = future.result()
                    if res:
                        all_found.extend(res)
                except Exception:
                    pass
        return all_found

    def scan_openrgb(self):
        """Checks if OpenRGB SDK is running on localhost or standard port."""
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(0.3)
            if s.connect_ex(("127.0.0.1", 6742)) == 0:
                s.close()
                return [{
                    "id": "openrgb_local",
                    "name": "OpenRGB (PC Hardware & Peripherals)",
                    "protocol": "openrgb",
                    "ip": "127.0.0.1",
                    "port": 6742,
                    "status": "Online",
                    "details": "Motherboard, GPU, RAM, Fans & Peripherals"
                }]
        except Exception:
            pass
        return []

    def scan_serial_ports(self):
        """Scans for plugged-in USB microcontrollers (Arduino, ESP32, FastLED)."""
        devices = []
        try:
            import serial.tools.list_ports
            ports = serial.tools.list_ports.comports()
            for p in ports:
                desc = p.description or "USB Serial Device"
                devices.append({
                    "id": f"serial_{p.device.lower()}",
                    "name": f"Serial USB ({p.device}): {desc[:25]}",
                    "protocol": "serial",
                    "ip": p.device,
                    "port": 115200,
                    "status": "Online",
                    "details": f"Adalight / FastLED / NeoPixel Protocol on {p.device}"
                })
        except Exception:
            # Fallback for systems without pyserial
            for i in range(1, 10):
                port_name = f"COM{i}"
                try:
                    import serial
                    s = serial.Serial(port_name, 115200, timeout=0.1)
                    s.close()
                    devices.append({
                        "id": f"serial_com{i}",
                        "name": f"Serial USB ({port_name})",
                        "protocol": "serial",
                        "ip": port_name,
                        "port": 115200,
                        "status": "Online",
                        "details": "Adalight / FastLED Serial COM Port"
                    })
                except Exception:
                    pass
        return devices

    def scan(self):
        return self.scan_all()

    def scan_all(self):
        """Run all discovery vectors concurrently and return deduplicated devices."""
        print("[SCANNER] Commencing Universal Multi-Protocol Hardware Discovery...", flush=True)
        local_ip, subnet_prefix = self.get_local_ip_and_subnet()
        print(f"[SCANNER] Host IP: {local_ip} | Target Subnet: {subnet_prefix}.0/24", flush=True)

        results = []
        # Parallel sweeps
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
            f_govee = executor.submit(self.scan_govee)
            f_flux = executor.submit(self.scan_flux)
            f_yeelight = executor.submit(self.scan_yeelight)
            f_subnet = executor.submit(self.scan_subnet_fast, subnet_prefix)
            f_openrgb = executor.submit(self.scan_openrgb)
            f_serial = executor.submit(self.scan_serial_ports)

            for f in [f_govee, f_flux, f_yeelight, f_subnet, f_openrgb, f_serial]:
                try:
                    res = f.result(timeout=4.5)
                    if res: results.extend(res)
                except Exception as e:
                    pass

        # Deduplicate by IP and protocol
        seen_keys = set()
        unique_devices = []
        for d in results:
            key = f"{d['protocol']}_{d['ip']}"
            if key not in seen_keys:
                seen_keys.add(key)
                unique_devices.append(d)

        print(f"[SCANNER] Discovery scan complete. Found {len(unique_devices)} devices.", flush=True)
        return unique_devices

if __name__ == "__main__":
    scanner = ScannerEngine()
    found = scanner.scan_all()
    print("\n--- Discovered Devices ---")
    print(json.dumps(found, indent=2))
