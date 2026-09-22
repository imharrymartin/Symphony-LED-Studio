"""
Symphony Desktop Application Launcher
Spawns the background server and opens a native application window.
"""

import sys
import os
import time
import subprocess
import threading
import urllib.request
import json
import webbrowser

PORT = 8090
SERVER_URL = f"http://127.0.0.1:{PORT}"
CWD = os.path.dirname(os.path.abspath(__file__))

server_process = None

def start_server():
    global server_process
    print("Launcher: Starting Symphony Server process...", flush=True)
    # Run server.py using the current python executable
    server_process = subprocess.Popen(
        [sys.executable, "server.py"],
        cwd=CWD,
        stdout=sys.stdout,
        stderr=sys.stderr
    )

def wait_for_server(timeout=15):
    start = time.time()
    while time.time() - start < timeout:
        try:
            req = urllib.request.urlopen(f"{SERVER_URL}/api/config", timeout=1)
            if req.status == 200:
                print("Launcher: Server is up and responding!", flush=True)
                return True
        except Exception:
            pass
        time.sleep(0.3)
    return False

def open_window():
    # Try pywebview if available
    try:
        import webview
        print("Launcher: Launching via PyWebView native window...", flush=True)
        window = webview.create_window(
            title="Symphony Studio",
            url=SERVER_URL,
            width=1280,
            height=850,
            min_size=(900, 600),
            background_color="#0e1117"
        )
        webview.start()
        return
    except ImportError:
        pass
    except Exception as e:
        print(f"Launcher: PyWebView failed ({e}), trying standalone app mode...", flush=True)

    # Try Chrome/Edge app mode for standalone window feel without toolbars
    browsers = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"
    ]
    
    launched_app_mode = False
    for browser_path in browsers:
        if os.path.exists(browser_path):
            print(f"Launcher: Launching in App Mode via {os.path.basename(browser_path)}...", flush=True)
            subprocess.Popen([browser_path, f"--app={SERVER_URL}", "--window-size=1280,850"])
            launched_app_mode = True
            break

    if not launched_app_mode:
        print("Launcher: Opening in default web browser...", flush=True)
        webbrowser.open(SERVER_URL)

def main():
    start_server()
    if wait_for_server():
        try:
            open_window()
        except KeyboardInterrupt:
            pass
    else:
        print("Launcher ERROR: Server failed to respond in time.", flush=True)

    # Cleanup server on window close
    if server_process and server_process.poll() is None:
        print("Launcher: Shutting down server...", flush=True)
        server_process.terminate()
        try:
            server_process.wait(timeout=3)
        except Exception:
            server_process.kill()

if __name__ == '__main__':
    main()
