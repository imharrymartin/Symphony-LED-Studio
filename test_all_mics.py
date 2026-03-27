import subprocess
import sys

print("Testing 13 devices sequentially without loading soundcard in parent...", flush=True)

for i in range(14):
    print(f"\n--- Testing index [{i}] ---", flush=True)
    
    proc = subprocess.Popen([sys.executable, 'test_devices.py', str(i)], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    out, err = proc.communicate()
    
    out_str = out.decode('utf-8', errors='replace').strip()
    err_str = err.decode('utf-8', errors='replace').strip()
        
    print(f"Exit code {proc.returncode}", flush=True)
    if out_str: print(f"OUT: {out_str}", flush=True)
    if err_str: print(f"ERR: {err_str}", flush=True)
    
    if "DONE_ALL" in out_str:
        break

print("\n=== SUMMARY COMPLETE ===", flush=True)
