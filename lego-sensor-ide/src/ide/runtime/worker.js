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

// Two Python APIs, both backed by the RPC bridge above and exposed as
// Python globals:
//   - Sensor(id)/Motor(id)/sensor_ids/motor_ids — this app's own API,
//     addressing devices by name so multiple devices of the same type
//     (e.g. two color sensors, renamed in the Devices panel) can be used
//     at once.
//   - dm/sm/cs/wait/print — the LEGO Education CS & AI kit's own function
//     library, shown in the Library tab. These are singletons bound to the
//     first connected device of the matching type, matching how the kit's
//     own examples are written; they don't distinguish between multiple
//     devices of the same type the way Sensor(id)/Motor(id) do.
// Host calls return plain JS values (or null); `_to_py` converts objects to
// real Python dicts so student code can index them like `result["rgb"]`
// instead of dealing with a JsProxy.
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

class _DoubleMotor:
    async def set_speed(self, speed):
        await _dm_set_speed(speed)

    async def run(self):
        await _dm_run()

    async def run_time(self, ms):
        await _dm_run()
        await wait(ms / 1000)
        await _dm_stop()

    async def turn_left(self, degrees):
        await _dm_turn(degrees, 1)

    async def turn_right(self, degrees):
        await _dm_turn(degrees, 0)

    async def stop(self):
        await _dm_stop()

class _SingleMotor:
    async def set_speed(self, speed):
        await _sm_set_speed(speed)

    async def run(self):
        await _sm_run()

    async def stop(self):
        await _sm_stop()

class _ColorSensor:
    async def detect_rgb(self):
        result = _to_py(await _cs_detect())
        return tuple(result["rgb"]) if result else None

    async def detect_color(self):
        result = _to_py(await _cs_detect())
        return result["colorName"] if result else None

    async def detect_reflection(self):
        result = _to_py(await _cs_detect())
        return result["reflection"] if result else None

dm = _DoubleMotor()
sm = _SingleMotor()
cs = _ColorSensor()
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

    pyodide.globals.set('_dm_set_speed', (speed) => callHost('dmSetSpeed', [speed]));
    pyodide.globals.set('_dm_run', () => callHost('dmRun'));
    pyodide.globals.set('_dm_stop', () => callHost('dmStop'));
    pyodide.globals.set('_dm_turn', (degrees, direction) => callHost('dmTurn', [degrees, direction]));
    pyodide.globals.set('_sm_set_speed', (speed) => callHost('smSetSpeed', [speed]));
    pyodide.globals.set('_sm_run', () => callHost('smRun'));
    pyodide.globals.set('_sm_stop', () => callHost('smStop'));
    pyodide.globals.set('_cs_detect', () => callHost('csDetect'));

    await pyodide.runPythonAsync(PRELUDE);
    await pyodide.runPythonAsync(code);

    self.postMessage({ type: 'done' });
  } catch (err) {
    self.postMessage({ type: 'error', message: err && err.message ? err.message : String(err) });
  }
}
