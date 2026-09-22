import asyncio
from aiohttp import web
import json
import os
import keyboard
import flux_led
import numpy as np
import mss
import subprocess
import threading
import sys
import time
import spotipy
from spotipy.oauth2 import SpotifyOAuth

import universal_led
import scanner_engine

BULB_IP = "192.168.1.248"
CONFIG_FILE = "config.json"
bulb = None
main_loop = None

universal_controller = universal_led.UniversalLEDController({"bulb_ip": BULB_IP, "protocol": "flux_led"})
scanner = scanner_engine.ScannerEngine()

config = {"colors": [], "sequences": []}
current_sequence_task = None

audio_sync_active = False
audio_sync_color_id = None
audio_sensitivity = 1.0
audio_preset = "Balanced"
audio_device_id = None
audio_task = None

screen_sync_active = False
screen_combine_audio = False
screen_sensitivity = 2.5
screen_min_brightness = 0.0
screen_scale_brightness = False   # scale light power by screen luminance
screen_device_id = None
screen_task = None

last_saved_rgb = {"r": 255, "g": 255, "b": 255}

# Impermeable CFFI Hardware Memory Buffer
cached_mics_info = None
shared_rms = 0.0
shared_bass = 0.0
shared_mid = 0.0
shared_treble = 0.0
audio_engine_proc = None

# Spotify Beat Sync State
spotify_beat_sync_active = False
spotify_beat_sync_task = None
spotify_beat_sync_brightness_mode = "pulse"  # "pulse" or "breathe"

# Spotify State
spotify_client = None
spotify_oauth = None
spotify_sync_active = False
spotify_sync_task = None
current_spotify_state = {"is_playing": False, "progress_ms": 0, "track_id": None}

# Spotify caching to avoid rate limits
spotify_playback_cache = {"data": None, "timestamp": 0}
SPOTIFY_PLAYBACK_CACHE_TTL = 3.0  # seconds – frontend polls at 3s, so max 1 API call per 3s
spotify_analysis_cache = {}  # track_id -> analysis segments (permanent cache)
spotify_rate_limited_until = 0  # timestamp – skip API calls until this time

def spawn_audio_engine():
    global audio_engine_proc
    print("ENGINE: Spawning Subprocess sidecart...", flush=True)
    audio_engine_proc = subprocess.Popen(
        ['python', '-u', "audio_engine.py"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1
    )
    print(f"ENGINE: Process started (PID: {audio_engine_proc.pid})", flush=True)
    
    def listen_stdout():
        global cached_mics_info, shared_rms
        while True:
            try:
                line = audio_engine_proc.stdout.readline()
                if not line: break
                line = line.strip()
                if not line: continue
                if line.startswith('{'):
                    data = json.loads(line)
                    if data.get('type') == 'mics':
                        cached_mics_info = data.get('data', [])
                        print(f"IPC (STDOUT): Received {len(cached_mics_info)} devices.", flush=True)
                    elif data.get('type') == 'rms':
                        shared_rms = data.get('val', 0.0)
                        shared_bass = data.get('bass', 0.0)
                        shared_mid = data.get('mid', 0.0)
                        shared_treble = data.get('treble', 0.0)
                else:
                    print(f"AUDIO ENGINE (OUT): {line}", flush=True)
            except:
                time.sleep(0.01)

    def listen_stderr():
        while True:
            try:
                line = audio_engine_proc.stderr.readline()
                if not line: break
                line = line.strip()
                if line:
                    print(f"AUDIO ENGINE (ERR): {line}", flush=True)
            except:
                time.sleep(0.01)

    threading.Thread(target=listen_stdout, daemon=True).start()
    threading.Thread(target=listen_stderr, daemon=True).start()

def command_audio_engine(cmd_dict):
    if audio_engine_proc and audio_engine_proc.poll() is None:
        try:
            audio_engine_proc.stdin.write(json.dumps(cmd_dict) + "\n")
            audio_engine_proc.stdin.flush()
        except: pass

def load_config():
    global config, BULB_IP
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r') as f:
            config = json.load(f)
            if "arrangements" not in config:
                config["arrangements"] = []
            if config.get("bulb_ip"):
                BULB_IP = config["bulb_ip"]
    else:
        config = {"colors": [], "sequences": [], "arrangements": []}
        save_config()

def save_config():
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=4)

def refresh_spotify_token():
    """Ensure the Spotify token is fresh. Returns True if client is valid."""
    global spotify_client, spotify_oauth
    if not spotify_oauth:
        return False
    token_info = spotify_oauth.get_cached_token()
    if not token_info:
        return False
    # spotipy's get_cached_token auto-refreshes if expired
    if spotify_oauth.is_token_expired(token_info):
        try:
            token_info = spotify_oauth.refresh_access_token(token_info['refresh_token'])
            print("SPOTIFY: Token refreshed.", flush=True)
        except Exception as e:
            print(f"SPOTIFY: Token refresh failed: {e}", flush=True)
            return False
    spotify_client = spotipy.Spotify(auth=token_info['access_token'], retries=0, requests_timeout=5)
    return True

def init_spotify():
    global spotify_oauth, spotify_client
    cid = config.get("spotify_client_id")
    csecret = config.get("spotify_client_secret")
    if cid and csecret:
        spotify_oauth = SpotifyOAuth(
            client_id=cid,
            client_secret=csecret,
            redirect_uri="http://127.0.0.1:8090/api/spotify/callback",
            scope="user-read-playback-state user-modify-playback-state user-read-private",
            open_browser=False,
            cache_path=".spotify_cache"
        )
        # Only load cached token from disk at startup (no network I/O)
        # Token refresh is deferred to the first actual API call
        token_info = spotify_oauth.get_cached_token()
        if token_info and not spotify_oauth.is_token_expired(token_info):
            spotify_client = spotipy.Spotify(auth=token_info['access_token'], retries=0, requests_timeout=5)
            print("SPOTIFY: Loaded valid token from cache.", flush=True)
        elif token_info:
            print("SPOTIFY: Cached token expired, will refresh on first use.", flush=True)
        else:
            print("SPOTIFY: No cached token found.", flush=True)

async def setup_bulb():
    global bulb, BULB_IP, universal_controller
    protocol = config.get("protocol", "flux_led")
    ip = config.get("bulb_ip", BULB_IP)
    port = config.get("port")
    device_id = config.get("device_id", "")
    
    universal_controller.reconfigure(protocol, ip, port, device_id)
    loop = asyncio.get_running_loop()
    ok, msg = await loop.run_in_executor(None, universal_controller.test_connection)
    if ok:
        bulb = universal_controller
        print(f"LINKED: [{protocol.upper()}] Successfully bridged to {ip} ({msg})", flush=True)
    else:
        bulb = None
        print(f"STALLED: [{protocol.upper()}] Could not connect to {ip}: {msg}", flush=True)

async def bulb_reconnect_loop():
    """Background task: retry LED device connection every 15s when offline."""
    while True:
        await asyncio.sleep(15)
        if not universal_controller.is_connected:
            print("RECONNECT: Device offline, retrying...", flush=True)
            await setup_bulb()

async def apply_color(r, g, b_val, record_state=True):
    global last_saved_rgb, universal_controller
    try:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, lambda: universal_controller.set_color(r, g, b_val))
        if record_state:
            last_saved_rgb = {"r": r, "g": g, "b": b_val}
    except Exception as e:
        if record_state: print(f"LED Output Error: {e}", flush=True)

async def run_sequence(seq):
    global audio_sync_active, screen_sync_active
    print(f"Started sequence: {seq.get('name')}")
    audio_sync_active = False
    screen_sync_active = False
    command_audio_engine({'action': 'stop'})
    
    loop_sequence = seq.get('loop', True)
    try:
        while True:
            for step in seq.get('steps', []):
                color_id = step.get('color_id')
                c_obj = next((c for c in config['colors'] if c['id'] == color_id), None)
                if c_obj: await apply_color(c_obj['rgb']['r'], c_obj['rgb']['g'], c_obj['rgb']['b'], record_state=False)
                await asyncio.sleep(step.get('duration', 1000) / 1000.0)
            if not loop_sequence: break
        if not loop_sequence and last_saved_rgb:
            await apply_color(last_saved_rgb['r'], last_saved_rgb['g'], last_saved_rgb['b'], record_state=False)
    except asyncio.CancelledError: pass

def stop_active_sequence():
    global current_sequence_task
    if current_sequence_task:
        current_sequence_task.cancel()
        current_sequence_task = None

def trigger_action(action_type, item_id):
    if not main_loop: return
    async def _do():
        stop_active_sequence()
        global audio_sync_active, screen_sync_active
        audio_sync_active = False
        screen_sync_active = False
        command_audio_engine({'action': 'stop'})
        
        if action_type == 'color':
            c_obj = next((c for c in config['colors'] if c['id'] == item_id), None)
            if c_obj: await apply_color(c_obj['rgb']['r'], c_obj['rgb']['g'], c_obj['rgb']['b'])
        elif action_type == 'sequence':
            s_obj = next((s for s in config['sequences'] if s['id'] == item_id), None)
            if s_obj:
                global current_sequence_task
                current_sequence_task = main_loop.create_task(run_sequence(s_obj))
    asyncio.run_coroutine_threadsafe(_do(), main_loop)

def apply_hotkeys():
    try: keyboard.unhook_all()
    except: pass
    for c in config.get('colors', []):
        hk = c.get('hotkey')
        if hk:
            try: keyboard.add_hotkey(hk, trigger_action, args=['color', c['id']])
            except: pass
    for s in config.get('sequences', []):
        hk = s.get('hotkey')
        if hk:
            try: keyboard.add_hotkey(hk, trigger_action, args=['sequence', s['id']])
            except: pass

async def handle_get_config(request):
    return web.json_response({
        **config,
        'bulb_status': 'Connected' if bulb else 'Disconnected',
        'bulb_ip': BULB_IP
    })

async def handle_reconnect_bulb(request):
    """Manual reconnect trigger from the UI."""
    asyncio.ensure_future(setup_bulb())
    return web.json_response({'status': 'reconnecting'})

async def handle_save_config(request):
    global config, BULB_IP, bulb
    new_config = await request.json()
    # If bulb IP changed, disconnect and reconnect
    new_ip = new_config.get("bulb_ip", BULB_IP)
    if new_ip != BULB_IP:
        BULB_IP = new_ip
        bulb = None  # force reconnect
        asyncio.ensure_future(setup_bulb())
    config = new_config
    save_config()
    apply_hotkeys()
    init_spotify()
    return web.json_response({'status': 'success'})

async def handle_get_devices(request):
    global cached_mics_info
    # If cache is empty, try one quick poll but mostly rely on sidecart broadcasts
    if not cached_mics_info:
        command_audio_engine({'action': 'get_mics'})
        for i in range(20):
            if cached_mics_info: break
            await asyncio.sleep(0.05)
    return web.json_response(cached_mics_info or [])

async def handle_action(request):
    global audio_sync_active, audio_task, screen_sync_active, screen_task, cached_mics_info
    data = await request.json()
    action = data.get('action')
    
    if action == 'rescan_devices':
        cached_mics_info = None
        command_audio_engine({'action': 'get_mics'})
        return web.json_response({'status': 'success'})
    
    stop_active_sequence()
    audio_sync_active = False
    if audio_task:
        audio_task.cancel()
        audio_task = None
    screen_sync_active = False
    if screen_task:
        screen_task.cancel()
        screen_task = None
    # Also stop beat sync if something else is taking over
    global spotify_beat_sync_active, spotify_beat_sync_task
    spotify_beat_sync_active = False
    if spotify_beat_sync_task:
        spotify_beat_sync_task.cancel()
        spotify_beat_sync_task = None

    command_audio_engine({'action': 'stop'})
            
    loop = asyncio.get_running_loop()
    if action == 'on':
        await loop.run_in_executor(None, universal_controller.turn_on)
    elif action == 'off':
        await loop.run_in_executor(None, universal_controller.turn_off)
    elif action == 'test_color':
        r, g, b_val = data.get('r', 255), data.get('g', 255), data.get('b', 255)
        await apply_color(r, g, b_val)
    elif action == 'sequence':
        seq_id = data.get('id')
        s_obj = next((s for s in config['sequences'] if s['id'] == seq_id), None)
        if s_obj:
            global current_sequence_task
            current_sequence_task = main_loop.create_task(run_sequence(s_obj))
        
    return web.json_response({'status': 'success'})

async def audio_sync_loop():
    global bulb, audio_sync_active, shared_rms
    print("Started Fused Pure-Architecture Audio Sync Pipeline")
    command_audio_engine({'action': 'start', 'device_id': audio_device_id})
    
    try:
        while audio_sync_active:
            if not bulb:
                await asyncio.sleep(0.1)
                continue
                
            c_obj = next((c for c in config['colors'] if c['id'] == audio_sync_color_id), None)
            if not c_obj:
                await asyncio.sleep(0.1)
                continue

            rgb = c_obj['rgb']
            total_rms = shared_rms
            shared_rms = total_rms * 0.7 # Mathematics decay smoothing over raw hardware stutters!
            
            multiplier = 0.0
            if audio_preset == "Chill":
                noise_gate, ceiling = 0.02, 0.20
                if total_rms > noise_gate: multiplier = (total_rms - noise_gate) / (ceiling - noise_gate)
            elif audio_preset == "Punchy":
                noise_gate, ceiling = 0.10, 0.25
                if total_rms > noise_gate: multiplier = ((total_rms - noise_gate) / (ceiling - noise_gate)) ** 0.2
            else: 
                noise_gate, ceiling = 0.03, 0.30
                if total_rms > noise_gate: multiplier = (total_rms - noise_gate) / (ceiling - noise_gate)

            multiplier = min(1.0, multiplier * audio_sensitivity)
            final_r = int(rgb['r'] * multiplier)
            final_g = int(rgb['g'] * multiplier)
            final_b = int(rgb['b'] * multiplier)
            print(f"RMS:{total_rms:.4f} mult:{multiplier:.2f} -> ({final_r},{final_g},{final_b})", flush=True) if total_rms > 0.001 else None
            await apply_color(final_r, final_g, final_b, record_state=False)
            
            await asyncio.sleep(0.015)
                
    except asyncio.CancelledError: pass
    finally:
        print("Stopping Native Windows Audio Subsystem Engine...")
        command_audio_engine({'action': 'stop'})
        if bulb and not audio_sync_active and not screen_sync_active:
            await apply_color(last_saved_rgb['r'], last_saved_rgb['g'], last_saved_rgb['b'], record_state=False)


def hsl_to_rgb(h, s, l):
    """Convert HSL (0-360, 0-1, 0-1) to RGB (0-255 ints)."""
    import colorsys
    r, g, b = colorsys.hls_to_rgb(h / 360.0, l, s)
    return int(r * 255), int(g * 255), int(b * 255)


async def spotify_beat_sync_loop():
    """Spotify Beat Sync: fires colour changes locked to the actual beats/sections
    of whatever is currently playing on Spotify, modulated by live bass RMS."""
    global bulb, spotify_beat_sync_active, shared_rms, shared_bass, current_spotify_state

    print("BEAT SYNC: Starting Spotify Beat Sync Engine", flush=True)

    # --- state ---
    last_beat_idx   = -1
    last_section_idx = -1
    section_hues    = []   # generated once per track
    current_track_id = None
    beats    = []
    sections = []

    # Smoothed brightness (for decay between beats)
    smooth_bright = 0.0
    DECAY = 0.80           # brightness decay per 15ms tick (~0.80^(1000/15) ≈ very fast)

    # Start audio engine so we have bass data
    command_audio_engine({'action': 'start', 'device_id': None})

    try:
        while spotify_beat_sync_active:
            if not bulb:
                await asyncio.sleep(0.1)
                continue

            # --- poll Spotify state (uses the cached value, ≤3s stale) ---
            st = current_spotify_state
            track_id  = st.get('track_id')
            progress  = st.get('progress_ms', 0)
            is_playing = st.get('is_playing', False)

            if not track_id or not is_playing:
                await asyncio.sleep(0.2)
                continue

            # --- reload analysis when track changes ---
            if track_id != current_track_id:
                current_track_id = track_id
                beats = []
                sections = []
                section_hues = []
                last_beat_idx = -1
                last_section_idx = -1
                print(f"BEAT SYNC: Loading analysis for {track_id}", flush=True)
                try:
                    loop = asyncio.get_running_loop()
                    analysis = await loop.run_in_executor(
                        None,
                        lambda: spotify_client.audio_analysis(track_id)
                    )
                    beats    = analysis.get('beats', [])
                    sections = analysis.get('sections', [])
                    print(f"BEAT SYNC: {len(beats)} beats, {len(sections)} sections loaded", flush=True)

                    # Generate a vivid, evenly-spaced hue palette for the sections
                    n_sec = max(1, len(sections))
                    base_hue = (hash(track_id) & 0xFFFF) % 360   # unique starting hue per song
                    section_hues = [
                        (base_hue + (i * 360 / n_sec)) % 360
                        for i in range(n_sec)
                    ]
                except Exception as e:
                    print(f"BEAT SYNC: Analysis fetch failed: {e}", flush=True)
                    await asyncio.sleep(1.0)
                    continue

            if not beats:
                await asyncio.sleep(0.1)
                continue

            # --- find current beat & section ---
            prog_s = progress / 1000.0

            # Current section
            sec_idx = 0
            for i, sec in enumerate(sections):
                if prog_s >= sec['start']:
                    sec_idx = i

            # Detect beat crossing (next beat whose start ≤ now)
            beat_idx = 0
            for i, b in enumerate(beats):
                if prog_s >= b['start']:
                    beat_idx = i

            beat_fired = (beat_idx != last_beat_idx)
            last_beat_idx = beat_idx

            # --- colour for this section ---
            hue = section_hues[sec_idx] if section_hues else 0.0

            # On section change: shift hue +15° for variety between adjacent bars
            section_changed = (sec_idx != last_section_idx)
            last_section_idx = sec_idx

            # --- bass-modulated brightness ---
            raw_bass = shared_bass * 120.0   # scale up from FFT normalised range
            bass_norm = min(1.0, raw_bass)

            # Also use overall RMS as a fallback energy signal
            rms_norm = min(1.0, shared_rms * 4.0)
            energy = max(bass_norm, rms_norm * 0.5)

            if beat_fired:
                # Snap brightness up on the beat; stronger bass = brighter flash
                beat_confidence = beats[beat_idx].get('confidence', 0.5) if beats else 0.5
                smooth_bright = 0.35 + energy * 0.65 * beat_confidence
            else:
                # Decay between beats
                smooth_bright *= DECAY
                smooth_bright = max(0.05, smooth_bright)

            # Saturation: always vivid, slightly higher on treble
            saturation = 0.85 + min(0.15, shared_treble * 80.0)
            lightness  = smooth_bright * 0.5   # HSL lightness 0..0.5

            r, g, b_val = hsl_to_rgb(hue, saturation, lightness)
            await apply_color(r, g, b_val, record_state=False)

            await asyncio.sleep(0.015)  # ~66 fps update rate

    except asyncio.CancelledError:
        pass
    finally:
        command_audio_engine({'action': 'stop'})
        print("BEAT SYNC: Stopped", flush=True)
        if bulb and not audio_sync_active and not screen_sync_active:
            await apply_color(last_saved_rgb['r'], last_saved_rgb['g'], last_saved_rgb['b'], record_state=False)


async def handle_spotify_beat_sync(request):
    global spotify_beat_sync_active, spotify_beat_sync_task
    data = await request.json()
    action = data.get('action')

    if action == 'start':
        if not spotify_client:
            return web.json_response({'error': 'Spotify not connected'}, status=400)
        stop_active_sequence()
        # Stop other sync modes
        global audio_sync_active, audio_task, screen_sync_active, screen_task
        audio_sync_active = False
        if audio_task:
            audio_task.cancel(); audio_task = None
        screen_sync_active = False
        if screen_task:
            screen_task.cancel(); screen_task = None

        if not spotify_beat_sync_active:
            spotify_beat_sync_active = True
            spotify_beat_sync_task = main_loop.create_task(spotify_beat_sync_loop())

    elif action == 'stop':
        spotify_beat_sync_active = False
        if spotify_beat_sync_task:
            spotify_beat_sync_task.cancel()
            spotify_beat_sync_task = None

    return web.json_response({'status': 'success'})

async def handle_audio_api(request):
    global audio_sync_active, audio_sync_color_id, audio_task, audio_sensitivity, audio_preset, audio_device_id
    data = await request.json()
    action = data.get('action')
    
    if action == 'start':
        stop_active_sequence()
        audio_sync_color_id = data.get('color_id')
        audio_sensitivity = float(data.get('sensitivity', 1.0))
        audio_preset = data.get('preset', 'Balanced')
        audio_device_id = data.get('device_id')
        
        if not audio_sync_active:
            audio_sync_active = True
            audio_task = main_loop.create_task(audio_sync_loop())
            
    elif action == 'update':
        audio_sync_color_id = data.get('color_id')
        audio_sensitivity = float(data.get('sensitivity', 1.0))
        audio_preset = data.get('preset', 'Balanced')
        
        if audio_device_id != data.get('device_id'):
            audio_device_id = data.get('device_id')
            if audio_task: audio_task.cancel()
            audio_sync_active = True
            audio_task = main_loop.create_task(audio_sync_loop())
            
    elif action == 'stop':
        audio_sync_active = False
        if audio_task:
            audio_task.cancel()
            audio_task = None
            
    return web.json_response({'status': 'success'})

async def screen_sync_loop():
    global bulb, screen_sync_active, shared_rms
    print("Started Fused Pure-Architecture Screen Multi-Dimensional Hook!")
    
    if screen_combine_audio:
        command_audio_engine({'action': 'start', 'device_id': screen_device_id})
        
    try:
        with mss.mss() as sct:
            monitor = sct.monitors[1] 
            
            while screen_sync_active:
                if not bulb:
                    await asyncio.sleep(0.1)
                    continue
                
                sct_img = sct.grab(monitor)
                img = np.array(sct_img)
                small_img = img[::32, ::32, :3]
                avg_color = np.mean(small_img, axis=(0, 1))
                b, g, r = avg_color

                # Optional: scale final brightness by how bright the screen is
                lum_multiplier = 1.0
                if screen_scale_brightness:
                    # Perceived luminance (0-1)
                    luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0
                    lum_multiplier = luminance  # dim screen = dim lights

                multiplier = 1.0
                if screen_combine_audio:
                    total_rms = shared_rms
                    shared_rms = total_rms * 0.7

                    noise_gate, ceiling = 0.03, 0.30
                    if total_rms > noise_gate:
                        multiplier = (total_rms - noise_gate) / (ceiling - noise_gate)
                    else:
                        multiplier = screen_min_brightness
                    multiplier = max(screen_min_brightness, multiplier)

                multiplier = min(2.5, multiplier * screen_sensitivity * lum_multiplier)
                
                r_val = min(255, r * multiplier)
                g_val = min(255, g * multiplier)
                b_val = min(255, b * multiplier)
                
                await apply_color(int(r_val), int(g_val), int(b_val), record_state=False)
                await asyncio.sleep(0.015)
                    
    except asyncio.CancelledError: pass
    finally:
        print("Stopping Native Windows Audio Subsystem Engine...")
        command_audio_engine({'action': 'stop'})
        if bulb and not audio_sync_active and not screen_sync_active:
            await apply_color(last_saved_rgb['r'], last_saved_rgb['g'], last_saved_rgb['b'], record_state=False)

async def handle_screen_api(request):
    global screen_sync_active, screen_task, screen_sensitivity, screen_combine_audio, screen_device_id, screen_min_brightness, screen_scale_brightness
    data = await request.json()
    action = data.get('action')
    
    if action == 'start':
        stop_active_sequence()
        screen_sensitivity = float(data.get('sensitivity', 2.5))
        screen_combine_audio = data.get('combine_audio', False)
        screen_device_id = data.get('device_id')
        screen_min_brightness = float(data.get('min_brightness', 0.0))
        screen_scale_brightness = bool(data.get('scale_brightness', False))
        
        if not screen_sync_active:
            screen_sync_active = True
            screen_task = main_loop.create_task(screen_sync_loop())
            
    elif action == 'update':
        screen_sensitivity = float(data.get('sensitivity', 2.5))
        screen_min_brightness = float(data.get('min_brightness', 0.0))
        screen_scale_brightness = bool(data.get('scale_brightness', False))
        old_combine = screen_combine_audio
        screen_combine_audio = data.get('combine_audio', False)
        
        if screen_device_id != data.get('device_id') or old_combine != screen_combine_audio:
            screen_device_id = data.get('device_id')
            if screen_task: screen_task.cancel()
            screen_sync_active = True
            screen_task = main_loop.create_task(screen_sync_loop())
            
    elif action == 'stop':
        screen_sync_active = False
        if screen_task:
            screen_task.cancel()
            screen_task = None
            
    return web.json_response({'status': 'success'})

async def handle_hotkey_state(request):
    data = await request.json()
    state = data.get('state')
    
    if state == 'pause':
        try:
            keyboard.unhook_all()
            print("Arranger Mode: Global Hotkeys Paused", flush=True)
        except Exception as e:
            pass
    elif state == 'resume':
        print("Arranger Mode Exit: Global Hotkeys Resumed", flush=True)
        apply_hotkeys()
        
    return web.json_response({'status': 'success'})

async def handle_telemetry(request):
    return web.json_response({
        'rms': shared_rms,
        'bass': shared_bass,
        'mid': shared_mid,
        'treble': shared_treble,
        'audio_sync': audio_sync_active,
        'spotify_beat_sync': spotify_beat_sync_active,
        'screen_sync': screen_sync_active,
        'bulb_status': 'Connected' if universal_controller.is_connected else 'Disconnected',
        'bulb_ip': universal_controller.ip,
        'protocol': universal_controller.protocol
    })

cached_discovered_devices = []
scanner_status = "idle"

async def handle_scan_devices(request):
    global cached_discovered_devices, scanner_status
    scanner_status = "scanning"
    loop = asyncio.get_running_loop()
    try:
        devices = await loop.run_in_executor(None, scanner.scan_all)
        cached_discovered_devices = devices or []
        scanner_status = "idle"
        print(f"[API] Discovery completed with {len(cached_discovered_devices)} devices.", flush=True)
        return web.json_response({
            'status': 'success',
            'scan_status': 'idle',
            'devices': cached_discovered_devices,
            'discovered_devices': cached_discovered_devices,
            'count': len(cached_discovered_devices)
        })
    except Exception as e:
        scanner_status = "idle"
        print(f"[API ERROR] Discovery failed: {e}", flush=True)
        return web.json_response({
            'status': 'error',
            'scan_status': 'idle',
            'error': str(e),
            'devices': cached_discovered_devices,
            'discovered_devices': cached_discovered_devices,
            'count': len(cached_discovered_devices)
        })

async def handle_connect_device(request):
    global config, universal_controller
    data = await request.json()
    protocol = data.get('protocol', 'flux_led')
    ip = data.get('ip', '')
    port = data.get('port')
    device_id = data.get('device_id', '')
    
    config['protocol'] = protocol
    config['bulb_ip'] = ip
    if port: config['port'] = int(port)
    if device_id: config['device_id'] = device_id
    save_config()
    
    universal_controller.reconfigure(protocol, ip, port, device_id)
    loop = asyncio.get_running_loop()
    ok, msg = await loop.run_in_executor(None, universal_controller.test_connection)
    
    try:
        with open("active_hardware.json", "w") as f:
            json.dump({
                "protocol": protocol,
                "ip": ip,
                "port": port,
                "device_id": device_id
            }, f, indent=2)
    except Exception:
        pass

    return web.json_response({
        'status': 'ok' if ok else 'error',
        'connected': ok,
        'message': msg,
        'device': universal_controller.get_info()
    })

async def handle_devices_info(request):
    global cached_discovered_devices, scanner_status
    return web.json_response({
        'status': 'success',
        'scan_status': scanner_status,
        'active_device': universal_controller.get_info(),
        'discovered_devices': cached_discovered_devices,
        'devices': cached_discovered_devices,
        'saved_device': {
            'protocol': config.get('protocol', 'flux_led'),
            'ip': config.get('bulb_ip', ''),
            'port': config.get('port', 0),
            'device_id': config.get('device_id', '')
        }
    })

async def handle_test_device(request):
    data = await request.json()
    r = int(data.get('r', 255))
    g = int(data.get('g', 255))
    b = int(data.get('b', 255))
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, lambda: universal_controller.set_color(r, g, b))
    return web.json_response({'status': 'success'})

async def init_app():
    global main_loop
    main_loop = asyncio.get_running_loop()
    
    spawn_audio_engine()
    
    load_config()
    apply_hotkeys()
    init_spotify()  # Fast: only reads cached token from disk, no network I/O
    
    app = web.Application()
    async def cors_middleware(app, handler):
        async def middleware_handler(request):
            if request.method == "OPTIONS": resp = web.Response()
            else: resp = await handler(request)
            resp.headers['Access-Control-Allow-Origin'] = '*'
            resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
            resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
            return resp
        return middleware_handler

    # Background init for bulb (don't block server startup)
    async def background_init(app):
        asyncio.ensure_future(setup_bulb())
        asyncio.ensure_future(bulb_reconnect_loop())
    
    app.on_startup.append(background_init)

    app.middlewares.append(cors_middleware)
    
    # API Routes
    app.router.add_get('/api/config', handle_get_config)
    app.router.add_get('/api/telemetry', handle_telemetry)
    app.router.add_post('/api/reconnect_bulb', handle_reconnect_bulb)
    app.router.add_get('/api/scan_devices', handle_scan_devices)
    app.router.add_post('/api/connect_device', handle_connect_device)
    app.router.add_options('/api/connect_device', handle_connect_device)
    app.router.add_get('/api/devices', handle_devices_info)
    app.router.add_post('/api/test_device', handle_test_device)
    app.router.add_options('/api/test_device', handle_test_device)
    app.router.add_get('/api/audio_devices', handle_get_devices)
    app.router.add_post('/api/config', handle_save_config)
    app.router.add_options('/api/config', handle_save_config)
    app.router.add_post('/api/action', handle_action)
    app.router.add_options('/api/action', handle_action)
    app.router.add_post('/api/audio_sync', handle_audio_api)
    app.router.add_options('/api/audio_sync', handle_audio_api)
    app.router.add_post('/api/screen_sync', handle_screen_api)
    app.router.add_options('/api/screen_sync', handle_screen_api)
    app.router.add_post('/api/hotkey_state', handle_hotkey_state)
    app.router.add_options('/api/hotkey_state', handle_hotkey_state)
    app.router.add_post('/api/spotify_beat_sync', handle_spotify_beat_sync)
    app.router.add_options('/api/spotify_beat_sync', handle_spotify_beat_sync)
    
    # Spotify Routes
    async def handle_spotify_login(request):
        if not spotify_oauth:
            init_spotify()
        if not spotify_oauth:
            return web.json_response({'error': 'No credentials'}, status=400)
        auth_url = spotify_oauth.get_authorize_url()
        return web.json_response({'auth_url': auth_url})

    async def handle_spotify_callback(request):
        global spotify_client
        code = request.query.get('code')
        if code and spotify_oauth:
            loop = asyncio.get_running_loop()
            token_info = await loop.run_in_executor(None, lambda: spotify_oauth.get_access_token(code, as_dict=True))
            if token_info:
                spotify_client = spotipy.Spotify(auth=token_info['access_token'], retries=0, requests_timeout=5)
                html_resp = """<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Spotify Authorized - Symphony Studio</title>
    <style>
        body { background: #0d0d0d; color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
        .card { background: #1a1a1a; border: 1px solid #1DB954; padding: 36px 48px; border-radius: 4px; box-shadow: 0 10px 40px rgba(29, 185, 84, 0.25); max-width: 400px; }
        h2 { color: #1DB954; margin: 0 0 12px 0; font-size: 20px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
        p { color: #bbb; font-size: 13px; line-height: 1.6; margin: 0 0 16px 0; }
        .badge { display: inline-block; background: rgba(29, 185, 84, 0.15); color: #1DB954; border: 1px solid #1DB954; padding: 4px 10px; border-radius: 2px; font-size: 11px; font-family: monospace; }
    </style>
</head>
<body>
    <div class="card">
        <h2>✓ Spotify Connected!</h2>
        <p>Your Spotify credentials are authenticated and saved. Symphony Studio is now locked to your playback.</p>
        <div class="badge">SESSION ACTIVE</div>
        <p style="color: #666; font-size: 11px; margin-top: 14px;">This window will close automatically...</p>
    </div>
    <script>
        try {
            if (window.opener) {
                window.opener.postMessage({ type: 'spotify_auth_success' }, '*');
            }
        } catch (e) {}
        setTimeout(function() { window.close(); }, 1800);
    </script>
</body>
</html>"""
                return web.Response(text=html_resp, content_type="text/html")
        return web.Response(text="Authorization failed or expired. Please retry from Symphony Studio.", content_type="text/html")

    async def handle_spotify_disconnect(request):
        global spotify_client, spotify_oauth, config
        spotify_client = None
        spotify_oauth = None
        config['spotify_client_id'] = ''
        config['spotify_client_secret'] = ''
        save_config()
        try:
            import os
            if os.path.exists(".cache"):
                os.remove(".cache")
        except Exception:
            pass
        return web.json_response({'status': 'disconnected'})

    async def handle_spotify_state(request):
        global current_spotify_state, spotify_client, spotify_playback_cache, spotify_rate_limited_until
        if not spotify_client:
            # Try to refresh token in case it just expired (run in executor - it does network I/O)
            loop = asyncio.get_running_loop()
            ok = await loop.run_in_executor(None, refresh_spotify_token)
            if not ok:
                return web.json_response({'status': 'unauthorized'})

        now = time.time()

        # If we're rate-limited, return cached state + interpolated progress
        if now < spotify_rate_limited_until:
            # Interpolate progress forward based on elapsed time since last real poll
            if current_spotify_state.get('is_playing') and spotify_playback_cache['timestamp'] > 0:
                elapsed_ms = (now - spotify_playback_cache['timestamp']) * 1000
                current_spotify_state['progress_ms'] = int(
                    min(current_spotify_state.get('duration_ms', 300000),
                        spotify_playback_cache.get('base_progress_ms', 0) + elapsed_ms)
                )
            return web.json_response({'status': 'success', 'state': current_spotify_state})

        # Serve from cache if fresh enough
        if spotify_playback_cache['data'] and (now - spotify_playback_cache['timestamp']) < SPOTIFY_PLAYBACK_CACHE_TTL:
            # Interpolate progress forward for smoother playhead
            if current_spotify_state.get('is_playing'):
                elapsed_ms = (now - spotify_playback_cache['timestamp']) * 1000
                current_spotify_state['progress_ms'] = int(
                    min(current_spotify_state.get('duration_ms', 300000),
                        spotify_playback_cache.get('base_progress_ms', 0) + elapsed_ms)
                )
            return web.json_response({'status': 'success', 'state': current_spotify_state})

        # Actually call Spotify API — in a thread so it doesn't block the event loop
        try:
            loop = asyncio.get_running_loop()
            playback = await loop.run_in_executor(None, spotify_client.current_playback)
            spotify_playback_cache['timestamp'] = now
            spotify_playback_cache['data'] = playback

            if playback and playback.get('item'):
                item = playback['item']
                artist_name = "Unknown Artist"
                if item.get('artists') and len(item['artists']) > 0:
                    artist_name = item['artists'][0].get('name', 'Unknown Artist')
                elif item.get('show'):
                    artist_name = item['show'].get('name', 'Unknown Show')

                progress = playback.get('progress_ms', 0)
                current_spotify_state = {
                    "is_playing": playback.get('is_playing', False),
                    "progress_ms": progress,
                    "track_id": item.get('id'),
                    "track_name": item.get('name', 'Unknown Track'),
                    "artist_name": artist_name,
                    "duration_ms": item.get('duration_ms', 30000)
                }
                spotify_playback_cache['base_progress_ms'] = progress
            else:
                current_spotify_state['is_playing'] = False
                spotify_playback_cache['base_progress_ms'] = 0
            return web.json_response({
                'status': 'success',
                'state': current_spotify_state
            })
        except spotipy.exceptions.SpotifyException as e:
            if e.http_status == 429:
                retry_after = int(e.headers.get('Retry-After', 5)) if hasattr(e, 'headers') and e.headers else 5
                spotify_rate_limited_until = now + max(retry_after, 30)
                print(f"SPOTIFY: Rate limited! Backing off for {max(retry_after, 30)}s", flush=True)
                return web.json_response({'status': 'success', 'state': current_spotify_state})
            elif e.http_status == 401:
                # Token expired mid-session
                if refresh_spotify_token():
                    return web.json_response({'status': 'success', 'state': current_spotify_state})
            return web.json_response({'status': 'error', 'message': str(e)})
        except Exception as e:
            return web.json_response({'status': 'error', 'message': str(e)})
            
    async def handle_spotify_control(request):
        global spotify_client, spotify_playback_cache, spotify_rate_limited_until
        if not spotify_client:
            loop = asyncio.get_running_loop()
            ok = await loop.run_in_executor(None, refresh_spotify_token)
            if not ok:
                return web.json_response({'error': 'unauthorized'}, status=401)
        
        # Don't send control commands while rate limited
        if time.time() < spotify_rate_limited_until:
            return web.json_response({'status': 'rate_limited', 'message': 'Waiting for rate limit cooldown'})
        
        data = await request.json()
        try:
            loop = asyncio.get_running_loop()
            if data['action'] == 'play': await loop.run_in_executor(None, spotify_client.start_playback)
            elif data['action'] == 'pause': await loop.run_in_executor(None, spotify_client.pause_playback)
            elif data['action'] == 'seek': await loop.run_in_executor(None, lambda: spotify_client.seek_track(int(data.get('position_ms', 0))))
            # Invalidate playback cache after a control action so next poll gets fresh state
            spotify_playback_cache['timestamp'] = 0
            return web.json_response({'status': 'success'})
        except spotipy.exceptions.SpotifyException as e:
            if e.http_status == 429:
                retry_after = int(e.headers.get('Retry-After', 5)) if hasattr(e, 'headers') and e.headers else 5
                spotify_rate_limited_until = time.time() + max(retry_after, 30)
                print(f"SPOTIFY: Rate limited on control! Backing off {max(retry_after, 30)}s", flush=True)
            return web.json_response({'status': 'error', 'message': str(e)})
        except Exception as e:
            return web.json_response({'status': 'error', 'message': str(e)})

    async def handle_spotify_analysis(request):
        global spotify_client, spotify_analysis_cache, spotify_rate_limited_until
        if not spotify_client:
            loop = asyncio.get_running_loop()
            ok = await loop.run_in_executor(None, refresh_spotify_token)
            if not ok:
                return web.json_response({'error': 'unauthorized'}, status=401)
        track_id = request.query.get('track_id')
        if not track_id: return web.json_response({'error': 'missing track_id'}, status=400)
        
        # Return from permanent cache if available
        if track_id in spotify_analysis_cache:
            return web.json_response({'status': 'success', 'segments': spotify_analysis_cache[track_id]})
        
        # Don't call analysis API while rate limited
        if time.time() < spotify_rate_limited_until:
            return web.json_response({'status': 'error', 'message': 'Rate limited, using synthetic waveform'})
        
        try:
            loop = asyncio.get_running_loop()
            analysis = await loop.run_in_executor(None, lambda: spotify_client.audio_analysis(track_id))
            # We only need segments for the waveform
            segments = []
            for seg in analysis.get('segments', []):
                segments.append({
                    'start': seg['start'],
                    'duration': seg['duration'],
                    'loudness_max': seg['loudness_max']
                })
            # Cache permanently – analysis data never changes for a track
            spotify_analysis_cache[track_id] = segments
            return web.json_response({'status': 'success', 'segments': segments})
        except spotipy.exceptions.SpotifyException as e:
            if e.http_status == 429:
                retry_after = int(e.headers.get('Retry-After', 5)) if hasattr(e, 'headers') and e.headers else 5
                spotify_rate_limited_until = time.time() + max(retry_after, 30)
                print(f"SPOTIFY: Rate limited on analysis! Backing off {max(retry_after, 30)}s", flush=True)
            return web.json_response({'status': 'error', 'message': str(e)})
        except Exception as e:
            return web.json_response({'status': 'error', 'message': str(e)})

    app.router.add_get('/api/spotify/login', handle_spotify_login)
    app.router.add_get('/api/spotify/callback', handle_spotify_callback)
    app.router.add_post('/api/spotify/disconnect', handle_spotify_disconnect)
    app.router.add_options('/api/spotify/disconnect', handle_spotify_disconnect)
    app.router.add_get('/api/spotify/state', handle_spotify_state)
    app.router.add_get('/api/spotify/analysis', handle_spotify_analysis)
    app.router.add_post('/api/spotify/control', handle_spotify_control)
    app.router.add_options('/api/spotify/control', handle_spotify_control)

    # Static Files (Serve the Dashboard natively)
    async def index_handler(request):
        return web.FileResponse('./index.html')
    app.router.add_get('/', index_handler)
    app.router.add_static('/', path='.', name='static')
    
    return app

if __name__ == '__main__':
    print("  Symphony Desktop Immutably Decoupled Web Engine Online!")
    web.run_app(init_app(), host='127.0.0.1', port=8090)
