// This file runs inside a dedicated module Worker — a separate JS thread
// from the page. That isolation is what actually guarantees a user's
// `while (true) {}` can never freeze the UI: the worst it can do is spin its
// own thread, which the "Stop" button kills outright via worker.terminate().
// Loop-protection (applied before code reaches here, see loopGuard.js) adds a
// second, softer layer: synchronous loops auto-break after a timeout so a
// script can usually finish gracefully instead of needing a hard kill.

let rpcId = 0;
const pending = new Map();

function callHost(method, args = []) {
  return new Promise((resolve, reject) => {
    const id = ++rpcId;
    pending.set(id, { resolve, reject });
    self.postMessage({ type: 'rpc', id, method, args });
  });
}

self.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === 'rpc-result') {
    const p = pending.get(msg.id);
    if (p) {
      pending.delete(msg.id);
      p.resolve(msg.result);
    }
    return;
  }
  if (msg.type === 'rpc-error') {
    const p = pending.get(msg.id);
    if (p) {
      pending.delete(msg.id);
      p.reject(new Error(msg.error));
    }
    return;
  }
  if (msg.type === 'run') {
    await runUserCode(msg.code);
  }
};

function print(...args) {
  self.postMessage({ type: 'print', text: args.map(stringify).join(' ') });
}

function stringify(v) {
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeSensor(id) {
  return {
    read: () => callHost('sensorRead', [id]),
    classify: () => callHost('sensorClassify', [id]),
  };
}

function makeMotor(id) {
  return {
    run: (speed, power) => callHost('motorRun', [id, speed, power]),
    stop: () => callHost('motorStop', [id]),
  };
}

async function runUserCode(code) {
  try {
    const sensorIds = await callHost('listSensorIds');
    const motorIds = await callHost('listMotorIds');

    // eslint-disable-next-line no-new-func
    const fn = new Function(
      'print',
      'sleep',
      'Sensor',
      'Motor',
      'sensorIds',
      'motorIds',
      `return (async () => {\n${code}\n})();`
    );

    await fn(print, sleep, makeSensor, makeMotor, sensorIds, motorIds);
    self.postMessage({ type: 'done' });
  } catch (err) {
    self.postMessage({ type: 'error', message: err && err.message ? err.message : String(err) });
  }
}
