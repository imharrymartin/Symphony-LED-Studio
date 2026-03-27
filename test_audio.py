"""Quick test: launch audio_engine, send 'start', print incoming RMS for 5 seconds."""
import subprocess, json, time, threading

proc = subprocess.Popen(
    ['python', '-u', 'audio_engine.py'],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True,
    bufsize=1
)

rms_count = [0]

def read_out():
    for line in iter(proc.stdout.readline, ''):
        line = line.strip()
        if not line:
            continue
        if line.startswith('{'):
            try:
                d = json.loads(line)
                if d.get('type') == 'rms':
                    rms_count[0] += 1
                    if rms_count[0] % 20 == 0:
                        print(f"RMS: {d['val']:.4f}", flush=True)
                elif d.get('type') == 'mics':
                    print(f"Mics: {[m['name'] for m in d['data']]}", flush=True)
            except Exception as e:
                print(f"Parse error: {e} | {line}", flush=True)
        else:
            print(f"ENG OUT: {line}", flush=True)

def read_err():
    for line in iter(proc.stderr.readline, ''):
        line = line.strip()
        if line:
            print(f"ENG ERR: {line}", flush=True)

threading.Thread(target=read_out, daemon=True).start()
threading.Thread(target=read_err, daemon=True).start()

time.sleep(1)
print("Sending 'start' command...", flush=True)
proc.stdin.write(json.dumps({'action': 'start', 'device_id': ''}) + '\n')
proc.stdin.flush()

time.sleep(6)
proc.kill()
print(f"\nTotal RMS frames received: {rms_count[0]}")
if rms_count[0] == 0:
    print("ERROR: Zero RMS frames - audio capture is not working!")
else:
    print("SUCCESS: Audio capture is working!")
