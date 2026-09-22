import sys
import json
import time
import threading
import numpy as np

try:
    import pyaudiowpatch as pyaudio
except Exception as e:
    open("engine_error.txt", "w").write(f"Failed to load pyaudiowpatch: {e}")
    sys.exit(1)

current_command = None

def input_thread():
    global current_command
    while True:
        line = sys.stdin.readline()
        if not line: break
        try:
            val = line.strip()
            if val:
                current_command = json.loads(val)
        except: pass

def get_devices(p):
    devices = []
    try:
        # Get WASAPI host API index
        wasapi_api = p.get_host_api_info_by_type(pyaudio.paWASAPI)['index']
        for i in range(p.get_device_count()):
            dev = p.get_device_info_by_index(i)
            if dev['hostApi'] == wasapi_api:
                if dev['maxInputChannels'] > 0:
                    devices.append({
                        "id": str(dev["index"]),
                        "name": dev["name"],
                        "isloopback": dev["isLoopbackDevice"]
                    })
    except Exception as e:
        open("engine_error.txt", "a").write(f"Error getting devices: {e}\n")
    return devices

def find_target_device(p, target_id):
    devices = get_devices(p)
    
    # 1. By ID
    if target_id:
        for d in devices:
            if d['id'] == str(target_id):
                return p.get_device_info_by_index(int(d['id']))

    # 2. Try default WASAPI loopback adapter
    try:
        wasapi_info = p.get_host_api_info_by_type(pyaudio.paWASAPI)
        default_out = p.get_device_info_by_index(wasapi_info["defaultOutputDevice"])
        for loopback in p.get_loopback_device_info_generator():
            if default_out["name"] in loopback["name"]:
                return loopback
    except: pass
    
    # 3. Last resort: ANY loopback or ANY device
    for d in devices:
        if d['isloopback']:
            return p.get_device_info_by_index(int(d['id']))
    if devices:
        return p.get_device_info_by_index(int(devices[0]['id']))
        
    return None

def main():
    global current_command
    threading.Thread(target=input_thread, daemon=True).start()
    
    p = pyaudio.PyAudio()
    
    # Initial broadcast of devices
    devices = get_devices(p)
    sys.stdout.write(json.dumps({"type": "mics", "data": devices}) + "\n")
    sys.stdout.flush()
    
    stream = None
    is_active = False
    target_id = None
    
    def cleanup_stream():
        nonlocal stream
        if stream is not None:
            try:
                stream.stop_stream()
                stream.close()
            except: pass
            stream = None
    
    while True:
        if current_command:
            cmd = current_command
            current_command = None
            action = cmd.get('action')
            
            if action == 'get_mics':
                devices = get_devices(p)
                sys.stdout.write(json.dumps({"type": "mics", "data": devices}) + "\n")
                sys.stdout.flush()
                
            elif action == 'start':
                is_active = True
                target_id = str(cmd.get('device_id', ''))
                cleanup_stream()
                
            elif action == 'stop':
                is_active = False
                cleanup_stream()
                
        if not is_active:
            time.sleep(0.05)
            continue
            
        if not stream:
            target_dev = find_target_device(p, target_id)
            if not target_dev:
                is_active = False
                time.sleep(0.5)
                continue
            
            is_loopback = target_dev.get("isLoopbackDevice", False)
            
            try:
                # Both loopback and mic devices are opened the same way.
                # pyaudiowpatch loopback devices (from get_loopback_device_info_generator)
                # are inherently WASAPI shared mode — no exclusive flag needed.
                stream = p.open(
                    format=pyaudio.paFloat32,
                    channels=min(target_dev["maxInputChannels"], 2),
                    rate=int(target_dev["defaultSampleRate"]),
                    input=True,
                    frames_per_buffer=1024,
                    input_device_index=target_dev["index"]
                )
                open("engine_error.txt", "a").write(
                    f"Opened: {target_dev['name']} loopback={is_loopback} rate={int(target_dev['defaultSampleRate'])}\n"
                )
            except Exception as e:
                open("engine_error.txt", "a").write(f"Stream Open Failed ({target_dev['name']}): {e}\n")
                is_active = False
                cleanup_stream()
                time.sleep(0.5)
                continue
                
        if stream:
            try:
                data = stream.read(1024, exception_on_overflow=False)
                audio_array = np.frombuffer(data, dtype=np.float32)
                
                # Overall RMS
                rms = float(np.sqrt(np.mean(audio_array**2)))
                
                # FFT for frequency band analysis
                n = len(audio_array)
                if n > 0:
                    fft_vals = np.abs(np.fft.rfft(audio_array))
                    fft_freqs = np.fft.rfftfreq(n, d=1.0 / int(stream._rate if hasattr(stream, '_rate') else 44100))
                    
                    # Frequency band masks
                    bass_mask   = (fft_freqs >= 60)   & (fft_freqs < 250)
                    mid_mask    = (fft_freqs >= 250)  & (fft_freqs < 4000)
                    treble_mask = (fft_freqs >= 4000) & (fft_freqs < 20000)
                    
                    def band_rms(mask):
                        vals = fft_vals[mask]
                        return float(np.sqrt(np.mean(vals**2)) / (n / 2)) if len(vals) > 0 else 0.0
                    
                    bass_rms   = band_rms(bass_mask)
                    mid_rms    = band_rms(mid_mask)
                    treble_rms = band_rms(treble_mask)
                else:
                    bass_rms = mid_rms = treble_rms = 0.0
                
                sys.stdout.write(json.dumps({
                    "type": "rms",
                    "val": rms,
                    "bass": bass_rms,
                    "mid": mid_rms,
                    "treble": treble_rms
                }) + "\n")
                sys.stdout.flush()
            except Exception as e:
                open("engine_error.txt", "a").write(f"Stream Read Error: {e}\n")
                cleanup_stream()
                time.sleep(0.5)
                
    p.terminate()

if __name__ == '__main__':
    main()
