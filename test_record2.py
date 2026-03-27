import traceback
import sys

# DO NOT INIT COM HERE - soundcard should handle it
import soundcard as sc

try:
    mics = sc.all_microphones(include_loopback=True)
    target = next((m for m in mics if m.isloopback), mics[0])
    print(f"Testing {target.name}", flush=True)
    
    with target.recorder(samplerate=48000) as rec:
        print("Opened!", flush=True)
        data = rec.record(1024)
        print("Recorded!", flush=True)

except Exception as e:
    print(f"PYTHON EXCEPTION: {e}", flush=True)
    traceback.print_exc()
