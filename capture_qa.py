import subprocess
import time
import os
import sys
import threading
from http.server import SimpleHTTPRequestHandler, HTTPServer

CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
DIST_DIR = os.path.abspath(r"ui/dist")
OUT_DIR = os.path.abspath(r"docs/screenshots")
os.makedirs(OUT_DIR, exist_ok=True)

class QuietHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST_DIR, **kwargs)
    def log_message(self, format, *args):
        pass

def run_server(server):
    try:
        server.serve_forever()
    except Exception:
        pass

def main():
    server = HTTPServer(("127.0.0.1", 5173), QuietHandler)
    server_thread = threading.Thread(target=run_server, args=(server,), daemon=True)
    server_thread.start()
    time.sleep(1)

    targets = [
        ("01-galaxy-overview.png", "http://127.0.0.1:5173"),
        ("02-system-closeup.png", "http://127.0.0.1:5173/?select=project:fb319eb5ad5912ed"),
        ("03-skill-nebula.png", "http://127.0.0.1:5173/?select=topic:autonomous-ai-agents"),
        ("04-node-inspector.png", "http://127.0.0.1:5173/?select=hermes:soul"),
        ("05-web-mode.png", "http://127.0.0.1:5173/?mode=web"),
        ("06-quality-low.png", "http://127.0.0.1:5173/?quality=low"),
        ("06-quality-med.png", "http://127.0.0.1:5173/?quality=medium"),
        ("06-quality-high.png", "http://127.0.0.1:5173/?quality=high"),
    ]

    for filename, url in targets:
        out_path = os.path.join(OUT_DIR, filename)
        cmd = [
            CHROME_PATH,
            "--headless=new",
            "--use-gl=angle",
            f"--screenshot={out_path}",
            "--window-size=1400,900",
            "--virtual-time-budget=4000",
            url
        ]
        print(f"Capturing {filename} from {url}...")
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if os.path.exists(out_path):
            size = os.path.getsize(out_path)
            print(f"  -> Successfully captured {filename} ({size} bytes)")
        else:
            print(f"  -> Failed to capture {filename}: {res.stderr}")

    server.shutdown()
    print("All captures completed.")

if __name__ == "__main__":
    main()
