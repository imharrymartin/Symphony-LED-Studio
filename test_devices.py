import soundcard as sc
import sys

print("Gathering microphones...")
mics = sc.all_microphones(include_loopback=True)

test_idx = int(sys.argv[1]) if len(sys.argv) > 1 else 0

if test_idx >= len(mics):
    print("DONE_ALL")
    sys.exit(0)

target = mics[test_idx]
print(f"Testing [{test_idx}] {target.name} (Loopback={target.isloopback})")

try:
    with target.recorder(samplerate=48000) as rec:
        data = rec.record(1024)
        print("SUCCESS_48000")
except Exception as e:
    print(f"FAILED_48000: {e}")

try:
    with target.recorder(samplerate=44100) as rec:
        data = rec.record(1024)
        print("SUCCESS_44100")
except Exception as e:
    print(f"FAILED_44100: {e}")

try:
    with target.recorder(samplerate=None) as rec:
        data = rec.record(1024)
        print("SUCCESS_NONE")
except Exception as e:
    print(f"FAILED_NONE: {e}")

print("FINISHED_DEVICE")
