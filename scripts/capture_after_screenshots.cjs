const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = path.resolve(__dirname, '..', 'docs', 'screenshots');

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
  const client = await createCdpClient(wsUrl);

  // Reload page to ensure new bundle is running
  await client.send('Page.reload');
  await sleep(2500);

  // Wait for test API
  for (let i = 0; i < 30; i++) {
    const ready = await client.evaluate('Boolean(window.__cortexTestApi)');
    if (ready) break;
    await sleep(1000);
  }

  await client.evaluate('window.__cortexTestApi.setQuality("high")');
  await sleep(1000);

  // 1. After Shot 1: Timeline Mode with Panoramic Framing
  console.log('Capturing: flaw1-timeline-framing-after.png');
  await client.evaluate('window.__cortexTestApi.setMode("timeline")');
  await sleep(2000);
  await client.captureScreenshot('flaw1-timeline-framing-after.png');
  await client.captureScreenshot('qa-timeline-mode.png');

  // 2. After Shot 2: Enhanced Scrubber Histogram & Glowing Diamond Needle
  console.log('Capturing: flaw2-scrubber-histogram-after.png');
  await client.evaluate('window.__cortexTestApi.toggleReplay()');
  await sleep(1200);
  await client.captureScreenshot('flaw2-scrubber-histogram-after.png');
  await client.captureScreenshot('qa-replay-scrubber.png');
  await client.evaluate('window.__cortexTestApi.toggleReplay()'); // pause

  // 3. After Shot 3: Stacked Live Feed Panel (no overlap with HUD)
  console.log('Capturing: flaw3-feed-hud-overlap-after.png');
  await client.evaluate('window.__cortexTestApi.setMode("hybrid")');
  await sleep(1500);
  // Expand feed panel
  await client.evaluate(`
    const feedHeader = document.querySelector('div.fixed.bottom-16.left-4 > div');
    if (feedHeader) feedHeader.click();
  `);
  await client.evaluate('window.__cortexTestApi.emitTestEvent()');
  await sleep(600);
  await client.captureScreenshot('flaw3-feed-hud-overlap-after.png');
  await client.captureScreenshot('qa-live-feed.png');

  // 4. Update Overview & Pulse
  console.log('Updating: qa-hybrid-overview.png & qa-live-pulse.png');
  await client.evaluate(`{
    const feedHeader = document.querySelector('div.fixed.bottom-16.left-4 > div');
    if (feedHeader) feedHeader.click();
  }`);
  await client.evaluate('window.__cortexTestApi.frameAll()');
  await sleep(1200);
  await client.captureScreenshot('qa-hybrid-overview.png');

  await client.evaluate('window.__cortexTestApi.emitTestEvent()');
  await sleep(350);
  await client.captureScreenshot('qa-live-pulse.png');

  console.log('All Before/After and QA screenshots captured successfully!');
  client.ws.close();
}

run().catch((err) => {
  console.error('Capture after failed:', err);
  process.exit(1);
});
