"""Directly test soundcard recording without subprocess IPC."""
import soundcard as sc
import ctypes
try:
    ctypes.windll.ole32.CoInitializeEx(None, 0)
except:
    pass

import numpy as np
import time

print("All microphones (including loopback):")
mics = sc.all_microphones(include_loopback=True)
for i, m in enumerate(mics):
    print(f"  [{i}] {m.name} (loopback={m.isloopback}, id={m.id[:30]}...)")

# Try loopback first
target = next((m for m in mics if m.isloopback), mics[0] if mics else None)
if not target:
    print("ERROR: No audio devices found!")
    exit(1)

print(f"\nTesting: {target.name} (loopback={target.isloopback})")

# Try each sample rate
for sr in [None, 48000, 44100]:
    print(f"\n  Trying samplerate={sr}...", end=" ", flush=True)
    try:
        with target.recorder(samplerate=sr) as rec:
            print("OPENED!", flush=True)
            for frame in range(5):
                data = rec.record(numframes=1024)
                rms = float(np.sqrt(np.mean(data**2)))
                print(f"    Frame {frame}: RMS={rms:.6f}", flush=True)
            print(f"  SUCCESS with samplerate={sr}")
            break
    except Exception as e:
        print(f"FAILED: {e}")
else:
    print("\nAll sample rates failed!")
