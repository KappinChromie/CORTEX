import asyncio
import json
import base64
import urllib.request
import aiohttp
import time
import os

async def capture_views():
    req = urllib.request.urlopen("http://localhost:9222/json")
    pages = json.loads(req.read().decode())
    page = next(p for p in pages if p.get("type") == "page")
    ws_url = page["webSocketDebuggerUrl"]
    print(f"Connecting to native Tauri WebView2 at: {ws_url}")

    os.makedirs("docs/screenshots", exist_ok=True)

    async with aiohttp.ClientSession() as session:
        async with session.ws_connect(ws_url) as ws:
            msg_id = 0

            async def send_cmd(method, params=None):
                nonlocal msg_id
                msg_id += 1
                cmd = {"id": msg_id, "method": method, "params": params or {}}
                await ws.send_str(json.dumps(cmd))
                while True:
                    resp = await ws.receive()
                    data = json.loads(resp.data)
                    if data.get("id") == msg_id:
                        return data.get("result")

            async def eval_js(expr):
                res = await send_cmd("Runtime.evaluate", {
                    "expression": expr,
                    "returnByValue": True,
                    "awaitPromise": True
                })
                return res.get("result", {}).get("value")

            async def set_viewport(w, h):
                await send_cmd("Emulation.setDeviceMetricsOverride", {
                    "width": w,
                    "height": h,
                    "deviceScaleFactor": 1,
                    "mobile": False
                })
                await asyncio.sleep(0.5)

            async def take_screenshot(filename):
                shot = await send_cmd("Page.captureScreenshot", {"format": "png"})
                if shot and "data" in shot:
                    img_data = base64.b64decode(shot["data"])
                    filepath = os.path.join("docs", "screenshots", filename)
                    with open(filepath, "wb") as f:
                        f.write(img_data)
                    print(f"Captured: {filepath} ({len(img_data)} bytes)")

            # Loop over both view sizes: 1600x1000 and 1280x720
            sizes = [(1600, 1000), (1280, 720)]

            for w, h in sizes:
                suffix = f"{w}x{h}"
                print(f"\n--- CAPTURING AT {w}x{h} ---")
                await set_viewport(w, h)

                # (a) Default Overview: reset view, links = strong, unselected
                print("Setting up View A: Default Overview...")
                await eval_js("""
                (() => {
                    if (window.__cortexTestApi) {
                        window.__cortexTestApi.setSelectedNode(null);
                        window.__cortexTestApi.setHoveredNode(null);
                        window.__cortexTestApi.setLinksMode('strong');
                        window.__cortexTestApi.resetView();
                    }
                })()
                """)
                await asyncio.sleep(1.0)
                await take_screenshot(f"view-a-default-overview-{suffix}.png")

                # (b) One system up close: select 'cortex' project star
                print("Setting up View B: One system up close (cortex)...")
                await eval_js("""
                (() => {
                    if (window.__cortexTestApi) {
                        window.__cortexTestApi.setHoveredNode(null);
                        window.__cortexTestApi.setSelectedNode('cortex');
                    }
                })()
                """)
                await asyncio.sleep(1.5)
                await take_screenshot(f"view-b-system-closeup-{suffix}.png")

                # (c) Hovered node with its edges: hover 'read_file' tool
                print("Setting up View C: Hovered node with its edges (read_file)...")
                await eval_js("""
                (() => {
                    if (window.__cortexTestApi) {
                        window.__cortexTestApi.setSelectedNode(null);
                        window.__cortexTestApi.resetView();
                        window.__cortexTestApi.setHoveredNode('read_file');
                    }
                })()
                """)
                await asyncio.sleep(1.2)
                await take_screenshot(f"view-c-hovered-edges-{suffix}.png")

                # (d) Links: All mode
                print("Setting up View D: Links: All mode...")
                await eval_js("""
                (() => {
                    if (window.__cortexTestApi) {
                        window.__cortexTestApi.setSelectedNode(null);
                        window.__cortexTestApi.setHoveredNode(null);
                        window.__cortexTestApi.setLinksMode('all');
                        window.__cortexTestApi.resetView();
                    }
                })()
                """)
                await asyncio.sleep(1.2)
                await take_screenshot(f"view-d-links-all-{suffix}.png")

                # (e) Skill Nebula: navigate towards skill nebula cluster (creative)
                print("Setting up View E: Skill Nebula (creative)...")
                await eval_js("""
                (() => {
                    if (window.__cortexTestApi) {
                        window.__cortexTestApi.setLinksMode('strong');
                        window.__cortexTestApi.setHoveredNode(null);
                        window.__cortexTestApi.setSelectedNode('creative');
                    }
                })()
                """)
                await asyncio.sleep(1.5)
                await take_screenshot(f"view-e-skill-nebula-{suffix}.png")

    print("\nAll native Tauri captures completed successfully!")

if __name__ == "__main__":
    asyncio.run(capture_views())
