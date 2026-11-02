const http = require('http');

async function getWsUrl() {
  for (let i = 0; i < 30; i++) {
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
  throw new Error('CDP target not available on port 9222 after 30s');
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
    if (res.exceptionDetails) {
      throw new Error(`Eval failed: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result ? res.result.value : undefined;
  };

  return new Promise((resolve, reject) => {
    ws.onopen = () => resolve({ ws, send, evaluate });
    ws.onerror = (err) => reject(err);
  });
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function collectStats(client, durationMs = 2500) {
  const samples = [];
  const start = Date.now();
  while (Date.now() - start < durationMs) {
    const stats = await client.evaluate('window.__cortexPerf');
    if (stats) {
      samples.push(stats);
    }
    await sleep(100);
  }
  if (samples.length === 0) {
    throw new Error('No performance samples collected');
  }

  // Aggregate
  const last = samples[samples.length - 1];
  const avgFrameTimes = samples.map((s) => s.avgFrameTimeMs).sort((a, b) => a - b);
  const p95FrameTimes = samples.map((s) => s.p95FrameTimeMs).sort((a, b) => a - b);
  const fpsList = samples.map((s) => s.fps);
  const drawCallsList = samples.map((s) => s.drawCalls);

  const meanAvg = (avgFrameTimes.reduce((a, b) => a + b, 0) / avgFrameTimes.length).toFixed(2);
  const medianP95 = p95FrameTimes[Math.floor(p95FrameTimes.length / 2)].toFixed(2);
  const meanFps = Math.round(fpsList.reduce((a, b) => a + b, 0) / fpsList.length);
  const meanDrawCalls = Math.round(drawCallsList.reduce((a, b) => a + b, 0) / drawCallsList.length);

  return {
    fps: meanFps,
    avgFrameTimeMs: parseFloat(meanAvg),
    p95FrameTimeMs: parseFloat(medianP95),
    drawCalls: meanDrawCalls,
    triangles: last.triangles,
    points: last.points,
    visibleNodes: last.visibleNodes,
    totalNodes: last.totalNodes,
    quality: last.quality,
  };
}

async function run() {
  console.log('Connecting to CDP on port 9222...');
  const wsUrl = await getWsUrl();
  console.log('Connected to WS URL:', wsUrl);
  const client = await createCdpClient(wsUrl);

  // Wait for app ready
  let ready = false;
  for (let i = 0; i < 30; i++) {
    ready = await client.evaluate('Boolean(window.__cortexTestApi && window.__cortexPerf)');
    if (ready) break;
    await sleep(1000);
  }
  if (!ready) {
    throw new Error('App did not expose __cortexTestApi within 30s');
  }

  // Open overlay
  await client.evaluate('window.__cortexTestApi.togglePerfOverlay(true)');
  await sleep(1000);

  // Measure refresh rate
  const refreshRate = await client.evaluate(`
    new Promise(resolve => {
      let frames = 0;
      let start = performance.now();
      function check(now) {
        frames++;
        if (now - start >= 500) {
          resolve(Math.round((frames * 1000) / (now - start)));
        } else {
          requestAnimationFrame(check);
        }
      }
      requestAnimationFrame(check);
    })
  `);

  const gpu = await client.evaluate('window.__cortexGpu || "Unknown GPU"');

  console.log('=== SYSTEM INFO ===');
  console.log('GPU Model:', gpu);
  console.log('Display Refresh Rate:', refreshRate, 'Hz');

  const results = {};

  // 1. Real Graph - Low
  console.log('Measuring Real Graph - Low...');
  await client.evaluate('window.__cortexTestApi.toggleSynthetic(false)');
  await client.evaluate('window.__cortexTestApi.setQuality("low")');
  await sleep(1500);
  results['real_low'] = await collectStats(client);

  // 2. Real Graph - Medium
  console.log('Measuring Real Graph - Medium...');
  await client.evaluate('window.__cortexTestApi.setQuality("medium")');
  await sleep(1500);
  results['real_med'] = await collectStats(client);

  // 3. Real Graph - High
  console.log('Measuring Real Graph - High...');
  await client.evaluate('window.__cortexTestApi.setQuality("high")');
  await sleep(1500);
  results['real_high'] = await collectStats(client);

  // 4. Synthetic 10k - Low
  console.log('Measuring Synthetic 10k - Low...');
  await client.evaluate('window.__cortexTestApi.toggleSynthetic(true)');
  await client.evaluate('window.__cortexTestApi.setQuality("low")');
  await sleep(2500);
  results['synth_low'] = await collectStats(client);

  // 5. Synthetic 10k - Medium
  console.log('Measuring Synthetic 10k - Medium...');
  await client.evaluate('window.__cortexTestApi.setQuality("medium")');
  await sleep(2500);
  results['synth_med'] = await collectStats(client);

  // Restore
  await client.evaluate('window.__cortexTestApi.toggleSynthetic(false)');
  await client.evaluate('window.__cortexTestApi.setQuality("high")');

  console.log('\n=== FINAL RESULTS ===');
  console.log(JSON.stringify({ gpu, refreshRate, results }, null, 2));

  client.ws.close();
}

run().catch((err) => {
  console.error('Error running performance benchmark:', err);
  process.exit(1);
});
