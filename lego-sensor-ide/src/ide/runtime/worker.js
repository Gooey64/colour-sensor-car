// This file runs inside a dedicated module Worker — a separate JS thread
// from the page. That isolation is what actually guarantees a runaway
// script can never freeze the UI: the worst it can do is spin its own
// thread, which the "Stop" button kills outright via worker.terminate().
// A fresh worker (and so a fresh Pyodide interpreter) boots per run — that
// costs a load every time instead of just the first, but guarantees no
// state leaks between runs and keeps Stop instant and total.

const PYODIDE_VERSION = '0.26.4';
const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

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

function print(text) {
  self.postMessage({ type: 'print', text });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Sensor(id)/Motor(id)/wait(seconds), backed by the RPC bridge above and
// exposed as Python globals. Host calls return plain JS values (or null);
// `_to_py` converts objects to real Python dicts so student code can index
// them like `result["rgb"]` instead of dealing with a JsProxy.
const PRELUDE = `
def _to_py(x):
    return x.to_py() if hasattr(x, "to_py") else x

class Sensor:
    def __init__(self, id):
        self.id = id

    async def read(self):
        return _to_py(await _sensor_read(self.id))

    async def classify(self):
        result = _to_py(await _sensor_classify(self.id))
        if result is None:
            return None
        return {"class_name": result["className"], "distance": result["distance"]}

class Motor:
    def __init__(self, id):
        self.id = id

    async def run(self, speed, power=100):
        await _motor_run(self.id, speed, power)

    async def stop(self):
        await _motor_stop(self.id)

async def wait(seconds):
    await _sleep_ms(seconds * 1000)
`;

let pyodidePromise = null;

function loadPyodideRuntime() {
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      print('Loading Python runtime…');
      const { loadPyodide } = await import(/* @vite-ignore */ `${PYODIDE_CDN}pyodide.mjs`);
      return loadPyodide({
        indexURL: PYODIDE_CDN,
        stdout: print,
        stderr: print,
      });
    })();
  }
  return pyodidePromise;
}

async function runUserCode(code) {
  try {
    const pyodide = await loadPyodideRuntime();
    const sensorIds = await callHost('listSensorIds');
    const motorIds = await callHost('listMotorIds');

    pyodide.globals.set('_sensor_read', (id) => callHost('sensorRead', [id]));
    pyodide.globals.set('_sensor_classify', (id) => callHost('sensorClassify', [id]));
    pyodide.globals.set('_motor_run', (id, speed, power) => callHost('motorRun', [id, speed, power]));
    pyodide.globals.set('_motor_stop', (id) => callHost('motorStop', [id]));
    pyodide.globals.set('_sleep_ms', (ms) => sleep(ms));
    pyodide.globals.set('sensor_ids', pyodide.toPy(sensorIds));
    pyodide.globals.set('motor_ids', pyodide.toPy(motorIds));

    await pyodide.runPythonAsync(PRELUDE);
    await pyodide.runPythonAsync(code);

    self.postMessage({ type: 'done' });
  } catch (err) {
    self.postMessage({ type: 'error', message: err && err.message ? err.message : String(err) });
  }
}
