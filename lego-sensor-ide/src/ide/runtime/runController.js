const HARD_TIMEOUT_MS = 30000; // absolute backstop even if a script never awaits/finishes

export class RunController extends EventTarget {
  constructor(deviceManager, classifier) {
    super();
    this.deviceManager = deviceManager;
    this.classifier = classifier;
    this.worker = null;
    this.hardTimeoutHandle = null;
    this.running = false;
  }

  _log(text) {
    this.dispatchEvent(new CustomEvent('print', { detail: text }));
  }

  async run(code) {
    this.stop(); // ensure any previous run is torn down first

    this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    this.running = true;
    this.dispatchEvent(new CustomEvent('start'));

    this.worker.onmessage = (e) => this._handleWorkerMessage(e.data);
    this.worker.onerror = (e) => {
      this.dispatchEvent(new CustomEvent('error', { detail: e.message || 'Worker error' }));
      this._teardown();
    };

    this.hardTimeoutHandle = setTimeout(() => {
      this._log(`⏱ Stopped automatically after ${HARD_TIMEOUT_MS / 1000}s (safety limit).`);
      this.stop();
    }, HARD_TIMEOUT_MS);

    this.worker.postMessage({ type: 'run', code });
  }

  stop() {
    if (this.worker) {
      this.worker.terminate();
    }
    this._teardown();
  }

  _teardown() {
    if (this.hardTimeoutHandle) clearTimeout(this.hardTimeoutHandle);
    this.hardTimeoutHandle = null;
    const wasRunning = this.running;
    this.running = false;
    this.worker = null;
    if (wasRunning) this.dispatchEvent(new CustomEvent('stop'));
  }

  async _handleWorkerMessage(msg) {
    switch (msg.type) {
      case 'print':
        this._log(msg.text);
        break;
      case 'done':
        this._log('✔ Finished.');
        this._teardown();
        break;
      case 'error':
        this.dispatchEvent(new CustomEvent('error', { detail: msg.message }));
        this._teardown();
        break;
      case 'rpc':
        await this._handleRpc(msg);
        break;
      default:
        break;
    }
  }

  async _handleRpc(msg) {
    const { id, method, args } = msg;
    try {
      const result = await this._dispatchRpc(method, args);
      this.worker && this.worker.postMessage({ type: 'rpc-result', id, result });
    } catch (err) {
      this.worker &&
        this.worker.postMessage({ type: 'rpc-error', id, error: err.message || String(err) });
    }
  }

  _findEndpoint(id, kindFilter) {
    const endpoint = this.deviceManager
      .listEndpoints()
      .find((e) => e.id === id && (!kindFilter || e.kind === kindFilter));
    if (!endpoint) throw new Error(`Device "${id}" is not connected.`);
    return endpoint;
  }

  _findFirst(devices, label) {
    if (!devices.length) throw new Error(`No ${label} device connected.`);
    return devices[0];
  }

  async _dispatchRpc(method, args) {
    switch (method) {
      case 'listSensorIds':
        return this.deviceManager.findSensors().map((e) => e.id);
      case 'listMotorIds':
        return this.deviceManager.findMotors().map((e) => e.id);
      case 'sensorRead': {
        const [id] = args;
        const endpoint = this._findEndpoint(id, 'color-sensor');
        const latest = endpoint.device.ports.get(endpoint.portId)?.latest;
        if (!latest) return null;
        return { rgb: latest.rgb255, colorName: latest.colorName, reflection: latest.reflection };
      }
      case 'sensorClassify': {
        const [id] = args;
        const endpoint = this._findEndpoint(id, 'color-sensor');
        const latest = endpoint.device.ports.get(endpoint.portId)?.latest;
        if (!latest) return null;
        return this.classifier.classify(latest.rgb255);
      }
      case 'motorRun': {
        const [id, speed, power] = args;
        const endpoint = this._findEndpoint(id, 'motor');
        await endpoint.device.runMotor(endpoint.portId, speed, power ?? 100);
        return true;
      }
      case 'motorStop': {
        const [id] = args;
        const endpoint = this._findEndpoint(id, 'motor');
        await endpoint.device.stopMotor(endpoint.portId);
        return true;
      }

      // Kit-native dm/sm/cs API (see the Library tab) — singleton bindings
      // to the first connected device of the matching type.
      case 'dmSetSpeed': {
        const [speed] = args;
        const device = this._findFirst(this.deviceManager.findDoubleMotorDevices(), 'double motor');
        // Sequential, not Promise.all: both ports share one BLE connection,
        // and Web Bluetooth throws "GATT operation already in progress" on
        // concurrent writes to the same device.
        await device.setSpeed(0, speed);
        await device.setSpeed(1, speed);
        return true;
      }
      case 'dmRun': {
        const device = this._findFirst(this.deviceManager.findDoubleMotorDevices(), 'double motor');
        await device.runMotor(0);
        await device.runMotor(1);
        return true;
      }
      case 'dmStop': {
        const device = this._findFirst(this.deviceManager.findDoubleMotorDevices(), 'double motor');
        await device.stopMotor(0);
        await device.stopMotor(1);
        return true;
      }
      case 'dmTurn': {
        const [degrees, directionA] = args;
        const device = this._findFirst(this.deviceManager.findDoubleMotorDevices(), 'double motor');
        await device.turn(degrees, directionA);
        return true;
      }
      case 'smSetSpeed': {
        const [speed] = args;
        const device = this._findFirst(this.deviceManager.findSingleMotorDevices(), 'single motor');
        await device.setSpeed(0, speed);
        return true;
      }
      case 'smRun': {
        const device = this._findFirst(this.deviceManager.findSingleMotorDevices(), 'single motor');
        await device.runMotor(0);
        return true;
      }
      case 'smStop': {
        const device = this._findFirst(this.deviceManager.findSingleMotorDevices(), 'single motor');
        await device.stopMotor(0);
        return true;
      }
      case 'csDetect': {
        const devices = this.deviceManager.findColorSensorDevices();
        if (!devices.length) return null;
        const latest = devices[0].ports.get(0)?.latest;
        if (!latest) return null;
        return { rgb: latest.rgb255, colorName: latest.colorName, reflection: latest.reflection };
      }
      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }
}
