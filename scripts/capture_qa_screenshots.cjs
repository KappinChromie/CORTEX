const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = path.resolve(__dirname, '..', 'docs', 'screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9222/json');
      const targets = await res.json();
      const page = targets.find(
        (t) =>
          t.type === 'page' ||
          (t.title && t.title.includes('Cortex')) ||
          (t.url && t.url.includes('5173'))
      );
      if (page && page.webSocketDebuggerUrl) {
        return page.webSocketDebuggerUrl;
      }
    } catch (e) {
      // wait
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('CDP target not available on port 9222 after 40s');
}

function createCdpClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 1;
  const pending = new Map();

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    }
  };

  const send = (method, params = {}) => {
    return new Promise((resolve, reject) => {
      const currentId = id++;
      pending.set(currentId, { resolve, reject });
      ws.send(JSON.stringify({ id: currentId, method, params }));
    });
  };

  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res && res.exceptionDetails) {
      throw new Error(`Eval failed: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res && res.result ? res.result.value : undefined;
  };

  const captureScreenshot = async (filename) => {
    const res = await send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    const outPath = path.join(SCREENSHOT_DIR, filename);
    fs.writeFileSync(outPath, buffer);
    console.log(`Saved screenshot: ${outPath} (${buffer.length} bytes)`);
    return outPath;
  };

  return new Promise((resolve, reject) => {
    ws.onopen = () => resolve({ ws, send, evaluate, captureScreenshot });
    ws.onerror = (err) => reject(err);
  });
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log('Connecting to CDP on port 9222...');
  const wsUrl = await getWsUrl();
  console.log('Connected to WS URL:', wsUrl);
  const client = await createCdpClient(wsUrl);

  // Wait for test API
  console.log('Waiting for Cortex App to mount...');
  let ready = false;
  for (let i = 0; i < 30; i++) {
    ready = await client.evaluate('Boolean(window.__cortexTestApi)');
    if (ready) break;
    await sleep(1000);
  }
  if (!ready) {
    throw new Error('App did not expose __cortexTestApi');
  }

  // Set high quality for crisp visual screenshots
  await client.evaluate('window.__cortexTestApi.setQuality("high")');
  await sleep(1000);

  // 1. Hybrid Overview
  console.log('Capturing: qa-hybrid-overview.png');
  await client.evaluate('window.__cortexTestApi.setMode("hybrid")');
  await client.evaluate('window.__cortexTestApi.frameAll()');
  await sleep(1800);
  await client.captureScreenshot('qa-hybrid-overview.png');

  // 2. Live Pulse in progress
  console.log('Capturing: qa-live-pulse.png');
  await client.evaluate('window.__cortexTestApi.emitTestEvent()');
  await sleep(350); // Mid-expansion of the glowing ring and photon
  await client.captureScreenshot('qa-live-pulse.png');

  // 3. Live Feed Panel
  console.log('Capturing: qa-live-feed.png');
  // Expand feed panel via DOM click or trigger
  await client.evaluate(`
    const feedHeader = document.querySelector('div.fixed.bottom-4.left-4 > div');
    if (feedHeader) feedHeader.click();
  `);
  // Emit another event so there are multiple items
  await client.evaluate('window.__cortexTestApi.emitTestEvent()');
  await sleep(600);
  await client.captureScreenshot('qa-live-feed.png');

  // 4. Timeline mode with scrubber
  console.log('Capturing: qa-timeline-mode.png');
  await client.evaluate('window.__cortexTestApi.setMode("timeline")');
  await sleep(1800); // 3D cylindrical animation transition
  await client.captureScreenshot('qa-timeline-mode.png');

  // 5. Replay mid-playback
  console.log('Capturing: qa-replay-scrubber.png');
  await client.evaluate('window.__cortexTestApi.toggleReplay()');
  await sleep(1400); // Let scrubber play through time
  await client.captureScreenshot('qa-replay-scrubber.png');
  await client.evaluate('window.__cortexTestApi.toggleReplay()'); // pause

  // 6. Settings > Connect Hermes panel
  console.log('Capturing: qa-settings-hermes.png');
  await client.evaluate('window.__cortexTestApi.openSettings()');
  await sleep(600);
  // Click on "Connect Hermes" tab button
  await client.evaluate(`
    const btns = Array.from(document.querySelectorAll('button'));
    const hermesTab = btns.find(b => b.textContent && b.textContent.includes('Connect Hermes'));
    if (hermesTab) hermesTab.click();
  `);
  await sleep(600);
  await client.captureScreenshot('qa-settings-hermes.png');

  // Clean up
  await client.evaluate('window.__cortexTestApi.closeSettings()');
  await client.evaluate('window.__cortexTestApi.setMode("hybrid")');

  console.log('All QA screenshots captured successfully!');
  client.ws.close();
}

run().catch((err) => {
  console.error('QA Screenshot Capture failed:', err);
  process.exit(1);
});
