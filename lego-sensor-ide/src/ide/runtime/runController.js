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
        return { rgb: latest.rgb255 };
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
      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }
}
