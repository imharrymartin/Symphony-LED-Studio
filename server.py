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

BULB_IP = "192.168.1.247"
CONFIG_FILE = "config.json"
bulb = None
main_loop = None

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
audio_engine_proc = None

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
    global config
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r') as f:
            config = json.load(f)
    else:
        config = {"colors": [], "sequences": []}
        save_config()

def save_config():
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=4)

async def setup_bulb():
    global bulb, BULB_IP
    print(f"Connecting to Bulb {BULB_IP}...", flush=True)
    
    def try_connect():
        try:
            # WifiLedBulb connects and queries state on construction
            sb = flux_led.WifiLedBulb(BULB_IP)
            # raw_state is populated automatically on connect
            _ = sb.raw_state
            return sb
        except Exception as e:
            print(f"LINK FAILED: {e}", flush=True)
            return None
        
    loop = asyncio.get_running_loop()
    sb = await loop.run_in_executor(None, try_connect)
    if sb:
        bulb = sb
        print(f"LINKED: Successfully bridged to {BULB_IP}", flush=True)
    else:
        bulb = None
        print("STALLED: No hardware bridge could be established.", flush=True)

async def apply_color(r, g, b_val, record_state=True):
    if not bulb: return
    global last_saved_rgb
    try:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, lambda: bulb.set_levels(r, g, b_val))
        if record_state:
            last_saved_rgb = {"r": r, "g": g, "b": b_val}
    except Exception as e:
        if record_state: print(f"Bulb Error: {e}", flush=True)

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

async def handle_save_config(request):
    global config
    config = await request.json()
    save_config()
    apply_hotkeys()
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
        
    command_audio_engine({'action': 'stop'})
            
    loop = asyncio.get_running_loop()
    if action == 'on' and bulb:
        await loop.run_in_executor(None, lambda: bulb.turn_on())
    elif action == 'off' and bulb:
        await loop.run_in_executor(None, lambda: bulb.turn_off())
    elif action == 'test_color' and bulb:
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

async def init_app():
    global main_loop
    main_loop = asyncio.get_running_loop()
    
    spawn_audio_engine()
    
    load_config()
    apply_hotkeys()
    await setup_bulb()
    
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

    app.middlewares.append(cors_middleware)
    
    # API Routes
    app.router.add_get('/api/config', handle_get_config)
    app.router.add_get('/api/audio_devices', handle_get_devices)
    app.router.add_post('/api/config', handle_save_config)
    app.router.add_options('/api/config', handle_save_config)
    app.router.add_post('/api/action', handle_action)
    app.router.add_options('/api/action', handle_action)
    app.router.add_post('/api/audio_sync', handle_audio_api)
    app.router.add_options('/api/audio_sync', handle_audio_api)
    app.router.add_post('/api/screen_sync', handle_screen_api)
    app.router.add_options('/api/screen_sync', handle_screen_api)
    
    # Static Files (Serve the Dashboard natively)
    async def index_handler(request):
        return web.FileResponse('./index.html')
    app.router.add_get('/', index_handler)
    app.router.add_static('/', path='.', name='static')
    
    return app

if __name__ == '__main__':
    print("  Symphony Desktop Immutably Decoupled Web Engine Online!")
    web.run_app(init_app(), host='127.0.0.1', port=8090)
