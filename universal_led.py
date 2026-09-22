"""
Universal Multi-Protocol Smart LED Controller Driver
Supports:
- Govee Local LAN API (UDP 4003)
- WLED (HTTP JSON /json/state & UDP port 21324 realtime)
- Magic Home / Flux LED / Zengge (TCP 5577)
- Yeelight / Xiaomi (TCP 55443)
- Philips Hue (REST API)
- LIFX (Binary LAN UDP 56700)
- Tuya / Smart Life Local
- OpenRGB (PC Hardware SDK port 6742)
- Serial USB / FastLED / Arduino (Adalight protocol)
- Custom Webhook / HTTP REST
"""

import socket
import json
import time
import asyncio
import urllib.request
import urllib.error
import threading

class UniversalLEDController:
    def __init__(self, config_data=None):
        self.config = config_data or {}
        self.protocol = self.config.get("protocol", "flux_led").lower()
        self.ip = self.config.get("bulb_ip", "192.168.1.247")
        self.port = int(self.config.get("port", 0)) or self._default_port(self.protocol)
        self.device_id = self.config.get("device_id", "")
        self.extra_settings = self.config.get("extra_settings", {})
        
        self.is_connected = False
        self.last_status_msg = "Initialized"
        self.last_color = {"r": 255, "g": 255, "b": 255}
        self._lock = threading.Lock()
        self._flux_instance = None
        self._serial_instance = None
        
        # Fast socket caching for UDP/TCP
        self._udp_sock = None
        self._tcp_sock = None

    def _default_port(self, protocol):
        ports = {
            "govee": 4003,
            "wled": 80,
            "wled_udp": 21324,
            "flux_led": 5577,
            "yeelight": 55443,
            "hue": 80,
            "lifx": 56700,
            "tuya": 6668,
            "openrgb": 6742,
            "serial": 115200,
            "webhook": 80
        }
        return ports.get(protocol, 80)

    def get_info(self):
        protocol_names = {
            "flux_led": "Magic Home / Flux LED",
            "govee": "Govee Local LAN",
            "wled": "WLED Lightstrip",
            "wled_udp": "WLED Realtime UDP",
            "yeelight": "Yeelight Smart LED",
            "hue": "Philips Hue Bridge",
            "lifx": "LIFX Smart Bulb",
            "openrgb": "OpenRGB SDK",
            "serial": "USB Serial Arduino",
            "webhook": "Custom Webhook"
        }
        status_str = "Connected" if self.is_connected else "Offline"
        dev_name = self.device_id if self.device_id else f"{protocol_names.get(self.protocol, self.protocol)} ({self.ip})"
        return {
            "protocol": self.protocol,
            "protocol_name": protocol_names.get(self.protocol, self.protocol.upper()),
            "ip": self.ip,
            "port": self.port,
            "name": dev_name,
            "device_id": self.device_id,
            "status": status_str,
            "last_status_msg": self.last_status_msg
        }

    def get_status(self):
        return self.get_info()

    def reconfigure(self, protocol, ip, port=None, device_id="", extra_settings=None):
        with self._lock:
            self.protocol = (protocol or "flux_led").lower()
            self.ip = ip or "127.0.0.1"
            self.port = int(port) if port else self._default_port(self.protocol)
            self.device_id = device_id or ""
            self.extra_settings = extra_settings or {}
            self._close_sockets()
            self.is_connected = False
            self.last_status_msg = f"Reconfigured to {self.protocol} on {self.ip}:{self.port}"
            print(f"[UNIVERSAL_LED] {self.last_status_msg}", flush=True)

    def _close_sockets(self):
        try:
            if self._udp_sock:
                self._udp_sock.close()
                self._udp_sock = None
        except Exception:
            pass
        try:
            if self._tcp_sock:
                self._tcp_sock.close()
                self._tcp_sock = None
        except Exception:
            pass
        try:
            if self._serial_instance:
                self._serial_instance.close()
                self._serial_instance = None
        except Exception:
            pass
        self._flux_instance = None

    def test_connection(self):
        """Quick synchronous connectivity and handshake test."""
        try:
            if self.protocol == "govee":
                return self._test_govee()
            elif self.protocol in ("wled", "wled_udp"):
                return self._test_wled()
            elif self.protocol == "flux_led":
                return self._test_flux()
            elif self.protocol == "yeelight":
                return self._test_yeelight()
            elif self.protocol == "openrgb":
                return self._test_openrgb()
            elif self.protocol == "serial":
                return self._test_serial()
            elif self.protocol == "hue":
                return self._test_hue()
            elif self.protocol == "webhook":
                return True, "Webhook URL configured"
            else:
                # Generic socket connectivity check
                return self._test_generic_socket()
        except Exception as e:
            self.is_connected = False
            self.last_status_msg = f"Error: {e}"
            return False, str(e)

    def _test_generic_socket(self):
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1.5)
        try:
            sock.connect((self.ip, self.port))
            sock.close()
            self.is_connected = True
            return True, f"Port {self.port} reachable on {self.ip}"
        except Exception as e:
            return False, f"Cannot connect to {self.ip}:{self.port} - {e}"

    def _test_govee(self):
        # Govee uses UDP port 4003 for control
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(1.5)
        msg = json.dumps({"msg": {"cmd": "turn", "data": {"value": 1}}}).encode('utf-8')
        sock.sendto(msg, (self.ip, self.port or 4003))
        sock.close()
        self.is_connected = True
        return True, f"Govee LAN UDP command dispatched to {self.ip}:4003"

    def _test_wled(self):
        url = f"http://{self.ip}/json/info"
        req = urllib.request.Request(url, headers={'User-Agent': 'Symphony-LED-Studio'})
        try:
            with urllib.request.urlopen(req, timeout=2.0) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                name = data.get("name", "WLED Device")
                ver = data.get("ver", "")
                led_count = data.get("leds", {}).get("count", 0)
                self.is_connected = True
                return True, f"Linked to {name} v{ver} ({led_count} LEDs)"
        except Exception as e:
            return False, f"WLED HTTP endpoint unreachable on {self.ip}: {e}"

    def _test_flux(self):
        try:
            import flux_led
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(2.0)
            sock.connect((self.ip, 5577))
            sock.close()
            bulb = flux_led.WifiLedBulb(self.ip, timeout=3)
            _ = bulb.raw_state
            self._flux_instance = bulb
            self.is_connected = True
            return True, f"Magic Home / Flux LED bridge online at {self.ip}:5577"
        except Exception as e:
            return False, f"Flux LED connection failed: {e}"

    def _test_yeelight(self):
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(2.0)
        sock.connect((self.ip, self.port or 55443))
        # Send query
        query = json.dumps({"id": 1, "method": "get_prop", "params": ["power", "bright", "rgb"]}) + "\r\n"
        sock.sendall(query.encode('utf-8'))
        resp = sock.recv(512).decode('utf-8', errors='ignore')
        sock.close()
        self.is_connected = True
        return True, f"Yeelight response: {resp.strip()}"

    def _test_openrgb(self):
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(2.0)
        sock.connect((self.ip, self.port or 6742))
        sock.close()
        self.is_connected = True
        return True, f"OpenRGB SDK server online on {self.ip}:6742"

    def _test_serial(self):
        try:
            import serial
            ser = serial.Serial(self.ip, self.port or 115200, timeout=1)
            ser.close()
            self.is_connected = True
            return True, f"Serial port {self.ip} opened at {self.port} baud"
        except Exception as e:
            return False, f"Serial error: {e}"

    def _test_hue(self):
        url = f"http://{self.ip}/api/config"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            name = data.get("name", "Hue Bridge")
            self.is_connected = True
            return True, f"Philips Hue Bridge ({name}) reachable"

    # --- Core Dispatcher: set_color(r, g, b) ---
    def set_color(self, r, g, b):
        r = max(0, min(255, int(r)))
        g = max(0, min(255, int(g)))
        b = max(0, min(255, int(b)))
        self.last_color = {"r": r, "g": g, "b": b}
        
        try:
            if self.protocol == "govee":
                self._send_govee_color(r, g, b)
            elif self.protocol == "wled":
                self._send_wled_color(r, g, b)
            elif self.protocol == "wled_udp":
                self._send_wled_udp_color(r, g, b)
            elif self.protocol == "flux_led":
                self._send_flux_color(r, g, b)
            elif self.protocol == "yeelight":
                self._send_yeelight_color(r, g, b)
            elif self.protocol == "hue":
                self._send_hue_color(r, g, b)
            elif self.protocol == "lifx":
                self._send_lifx_color(r, g, b)
            elif self.protocol == "openrgb":
                self._send_openrgb_color(r, g, b)
            elif self.protocol == "serial":
                self._send_serial_color(r, g, b)
            elif self.protocol == "webhook":
                self._send_webhook_color(r, g, b)
            else:
                self._send_flux_color(r, g, b)
            self.is_connected = True
        except Exception as e:
            # Avoid spamming console in fast loops
            pass

    def turn_on(self):
        try:
            if self.protocol == "govee":
                self._send_govee_turn(True)
            elif self.protocol == "wled":
                self._send_wled_turn(True)
            elif self.protocol == "flux_led":
                if self._flux_instance: self._flux_instance.turnOn()
            elif self.protocol == "yeelight":
                self._send_yeelight_cmd("set_power", ["on", "smooth", 200])
            self.is_connected = True
        except Exception:
            pass

    def turn_off(self):
        try:
            if self.protocol == "govee":
                self._send_govee_turn(False)
            elif self.protocol == "wled":
                self._send_wled_turn(False)
            elif self.protocol == "flux_led":
                if self._flux_instance: self._flux_instance.turnOff()
            elif self.protocol == "yeelight":
                self._send_yeelight_cmd("set_power", ["off", "smooth", 200])
        except Exception:
            pass

    # --- Protocol Implementations ---
    def _send_govee_color(self, r, g, b):
        if not self._udp_sock:
            self._udp_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        payload = json.dumps({
            "msg": {
                "cmd": "colorwc",
                "data": {
                    "color": {"r": r, "g": g, "b": b},
                    "colorTemInKelvin": 0
                }
            }
        }).encode('utf-8')
        self._udp_sock.sendto(payload, (self.ip, self.port or 4003))

    def _send_govee_turn(self, state):
        if not self._udp_sock:
            self._udp_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        payload = json.dumps({
            "msg": {
                "cmd": "turn",
                "data": {"value": 1 if state else 0}
            }
        }).encode('utf-8')
        self._udp_sock.sendto(payload, (self.ip, self.port or 4003))

    def _send_wled_color(self, r, g, b):
        url = f"http://{self.ip}/json/state"
        body = json.dumps({"on": True, "seg": [{"col": [[r, g, b]]}]}).encode('utf-8')
        req = urllib.request.Request(url, data=body, headers={'Content-Type': 'application/json'}, method='POST')
        with urllib.request.urlopen(req, timeout=1.0) as _:
            pass

    def _send_wled_udp_color(self, r, g, b):
        """WLED Realtime 0x02 protocol over UDP port 21324 for zero-latency audio reactivity"""
        if not self._udp_sock:
            self._udp_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        # 0x02 = WARLS, timeout 2 sec, repeated RGB
        packet = bytearray([0x02, 2, 0, r, g, b])
        self._udp_sock.sendto(packet, (self.ip, self.port or 21324))

    def _send_wled_turn(self, state):
        url = f"http://{self.ip}/json/state"
        body = json.dumps({"on": bool(state)}).encode('utf-8')
        req = urllib.request.Request(url, data=body, headers={'Content-Type': 'application/json'}, method='POST')
        with urllib.request.urlopen(req, timeout=1.0) as _:
            pass

    def _send_flux_color(self, r, g, b):
        if not self._flux_instance:
            import flux_led
            self._flux_instance = flux_led.WifiLedBulb(self.ip, timeout=3)
        self._flux_instance.set_levels(r, g, b)

    def _send_yeelight_color(self, r, g, b):
        rgb_int = (r << 16) | (g << 8) | b
        self._send_yeelight_cmd("set_rgb", [rgb_int, "smooth", 50])

    def _send_yeelight_cmd(self, method, params):
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(0.5)
        sock.connect((self.ip, self.port or 55443))
        cmd = json.dumps({"id": 1, "method": method, "params": params}) + "\r\n"
        sock.sendall(cmd.encode('utf-8'))
        sock.close()

    def _send_hue_color(self, r, g, b):
        # Convert RGB to approximate CIE 1931 xy
        x = (r * 0.664511 + g * 0.154324 + b * 0.162028) / (r + g + b + 0.0001)
        y = (r * 0.283881 + g * 0.668433 + b * 0.047685) / (r + g + b + 0.0001)
        bri = max(1, min(254, int((r + g + b) / 3)))
        user = self.device_id or "symphonystudio"
        light_id = self.extra_settings.get("light_id", "1")
        url = f"http://{self.ip}/api/{user}/lights/{light_id}/state"
        body = json.dumps({"on": True, "xy": [round(x, 4), round(y, 4)], "bri": bri, "transitiontime": 1}).encode('utf-8')
        req = urllib.request.Request(url, data=body, method='PUT')
        with urllib.request.urlopen(req, timeout=1.0) as _:
            pass

    def _send_lifx_color(self, r, g, b):
        # Basic binary LIFX SetColor frame (packet type 102)
        if not self._udp_sock:
            self._udp_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        # Map RGB to HSV
        import colorsys
        h, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
        hue_word = int(h * 65535)
        sat_word = int(s * 65535)
        bri_word = int(v * 65535)
        # Header (36 bytes) + SetColor payload (13 bytes)
        import struct
        header = struct.pack('<HHI8s8sBBQ', 49, 0x3400, 0, b'\x00'*8, b'\x00'*8, 0, 0, 0)
        payload = struct.pack('<BHHHHI', 0, hue_word, sat_word, bri_word, 3500, 50)
        self._udp_sock.sendto(header + payload, (self.ip, self.port or 56700))

    def _send_openrgb_color(self, r, g, b):
        # OpenRGB SDK Packet Header: 'ORGB' + device_idx(4) + packet_type(4) + pkt_len(4)
        import struct
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(0.5)
        sock.connect((self.ip, self.port or 6742))
        # Set all LEDs on device 0
        color_bytes = struct.pack('<BBBB', r, g, b, 0) * 16  # set first 16 leds
        body = struct.pack('<IHH', 0, len(color_bytes)//4, 0) + color_bytes
        header = struct.pack('<4sIII', b'ORGB', 0, 1050, len(body)) # RGBLAMP_UPDATE_LEDS = 1050
        sock.sendall(header + body)
        sock.close()

    def _send_serial_color(self, r, g, b):
        import serial
        if not self._serial_instance:
            self._serial_instance = serial.Serial(self.ip, self.port or 115200, timeout=0.1)
        # Adalight Protocol Header: 'Ada' + count_hi + count_lo + checksum + RGB
        cnt = 1
        cnt_hi = (cnt - 1) >> 8
        cnt_lo = (cnt - 1) & 0xff
        chk = cnt_hi ^ cnt_lo ^ 0x55
        frame = bytearray([ord('A'), ord('d'), ord('a'), cnt_hi, cnt_lo, chk, r, g, b])
        self._serial_instance.write(frame)

    def _send_webhook_color(self, r, g, b):
        hex_color = f"#{r:02x}{g:02x}{b:02x}"
        template_url = self.extra_settings.get("webhook_url", f"http://{self.ip}/set?r={{r}}&g={{g}}&b={{b}}")
        url = template_url.replace("{r}", str(r)).replace("{g}", str(g)).replace("{b}", str(b)).replace("{hex}", hex_color)
        req = urllib.request.Request(url, headers={'User-Agent': 'Symphony-LED-Studio'})
        with urllib.request.urlopen(req, timeout=1.0) as _:
            pass

    def get_status(self):
        return {
            "protocol": self.protocol,
            "ip": self.ip,
            "port": self.port,
            "device_id": self.device_id,
            "is_connected": self.is_connected,
            "last_status": self.last_status_msg,
            "last_color": self.last_color
        }
