import {
  SERVICE_UUID,
  WRITE_UUID,
  NOTIFY_UUID,
  MessageId,
  Command,
  MOTOR_GROUP_IDS,
  SENSOR_GROUP_IDS,
  DOUBLE_MOTOR_GROUP_ID,
  COLOR_INDEX_NAMES,
  buildCommand,
  parseInfoResponse,
  parseDeviceMessages,
} from './techElement';

const FEED_INTERVAL_MS = 100;
const INFO_TIMEOUT_MS = 5000;
const MOTOR_BRAKE_STATE = 1; // 0 = coast, 1 = brake, 2 = hold

let nextDeviceHandle = 1;

function clampInt8(v) {
  v = Math.round(v);
  if (v > 127) v = 127;
  if (v < -127) v = -127;
  return v;
}

// A single physical LEGO Education CS & AI kit peripheral — a Motor device
// (single or double) or a Color Sensor device — connected over its own BLE
// GATT connection. See techElement.js for the wire protocol.
export class DeviceConnection extends EventTarget {
  constructor(bleDevice) {
    super();
    this.handle = nextDeviceHandle++;
    this.bleDevice = bleDevice;
    this.name = bleDevice.name || `Device ${this.handle}`;
    this.gatt = null;
    this.writeCharacteristic = null;
    this.notifyCharacteristic = null;
    this.ports = new Map(); // portId -> { kind, hwPort, deviceType, latest }
    this.connected = false;
    this.info = null;
    this._pendingInfo = null;
  }

  async connect() {
    this.gatt = await this.bleDevice.gatt.connect();
    const service = await this.gatt.getPrimaryService(SERVICE_UUID);
    this.writeCharacteristic = await service.getCharacteristic(WRITE_UUID);
    this.notifyCharacteristic = await service.getCharacteristic(NOTIFY_UUID);
    await this.notifyCharacteristic.startNotifications();
    this.notifyCharacteristic.addEventListener('characteristicvaluechanged', (e) =>
      this._handleNotification(e.target.value)
    );
    this.bleDevice.addEventListener('gattserverdisconnected', () => {
      this.connected = false;
      this.dispatchEvent(new CustomEvent('disconnected'));
    });

    await this._write(buildCommand(Command.INFO_REQUEST));
    this.info = await this._waitForInfo();
    this._setupPortsFromGroupId(this.info.GroupID);
    await this._write(buildCommand(Command.FEED, [FEED_INTERVAL_MS]));

    this.connected = true;
    this.dispatchEvent(new CustomEvent('connected'));
  }

  disconnect() {
    try {
      this.bleDevice.gatt.disconnect();
    } catch (e) {
      /* ignore */
    }
  }

  async _write(bytes) {
    if (!this.writeCharacteristic) return;
    await this.writeCharacteristic.writeValue(bytes);
  }

  _waitForInfo(timeoutMs = INFO_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        if (this._pendingInfo) {
          const info = this._pendingInfo;
          this._pendingInfo = null;
          resolve(info);
          return;
        }
        if (Date.now() - start > timeoutMs) {
          reject(new Error('Timed out waiting for device info response.'));
          return;
        }
        setTimeout(check, 100);
      };
      check();
    });
  }

  _setupPortsFromGroupId(groupId) {
    if (MOTOR_GROUP_IDS.has(groupId)) {
      const motorCount = groupId === DOUBLE_MOTOR_GROUP_ID ? 2 : 1;
      for (let i = 0; i < motorCount; i++) {
        const portId = i;
        this.ports.set(portId, { kind: 'motor', hwPort: i + 1, deviceType: null, latest: null });
        this.dispatchEvent(
          new CustomEvent('portattached', { detail: { portId, deviceType: null, kind: 'motor' } })
        );
      }
    } else if (SENSOR_GROUP_IDS.has(groupId)) {
      const portId = 0;
      this.ports.set(portId, { kind: 'color-sensor', hwPort: null, deviceType: null, latest: null });
      this.dispatchEvent(
        new CustomEvent('portattached', { detail: { portId, deviceType: null, kind: 'color-sensor' } })
      );
    } else {
      console.warn(`Unrecognized device GroupID ${groupId}; no ports registered.`);
    }
  }

  _handleNotification(dataView) {
    const bytes = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
    const envelopeId = bytes[0];
    if (envelopeId === MessageId.INFO_RESPONSE) {
      this._pendingInfo = parseInfoResponse(bytes.slice(1));
      return;
    }
    if (envelopeId === MessageId.DEVICE_NOTIFICATION) {
      const length = new DataView(bytes.buffer, bytes.byteOffset + 1, 2).getUint16(0, true);
      const payload = bytes.slice(3, 3 + length);
      this._applyDeviceMessages(parseDeviceMessages(payload));
    }
  }

  _applyDeviceMessages(messages) {
    for (const [key, fields] of Object.entries(messages)) {
      if (key.startsWith('Motor_')) {
        const hwPort = fields.port;
        const entry = [...this.ports.entries()].find(([, p]) => p.kind === 'motor' && p.hwPort === hwPort);
        if (!entry) continue;
        const [portId, port] = entry;
        port.latest = {
          type: 'motor',
          angle: fields.angle,
          power: fields.power,
          speed: fields.speed,
          position: fields.position,
        };
        this.dispatchEvent(
          new CustomEvent('sensorvalue', { detail: { portId, reading: port.latest, kind: 'motor' } })
        );
      } else if (key === 'Color') {
        const entry = [...this.ports.entries()].find(([, p]) => p.kind === 'color-sensor');
        if (!entry) continue;
        const [portId, port] = entry;
        const raw = [fields.red, fields.green, fields.blue];
        // Raw channels are wider than 8 bits; 1024 matches the scale LEGO's
        // other color sensors use. Re-check against real hardware if colors
        // read too dark or blown out and adjust this divisor.
        const rgb255 = raw.map((v) => Math.max(0, Math.min(255, Math.round((v / 1024) * 255))));
        const reading = {
          type: 'rgb',
          raw,
          rgb255,
          colorIndex: fields.color,
          colorName: COLOR_INDEX_NAMES[fields.color] ?? null,
          reflection: fields.reflection,
          hue: fields.hue,
          saturation: fields.saturation,
          value: fields.value,
        };
        port.latest = reading;
        this.dispatchEvent(
          new CustomEvent('sensorvalue', { detail: { portId, reading, kind: 'color-sensor' } })
        );
      }
    }
  }

  async runMotor(portId, speed, _maxPower = 100, direction = 2) {
    const port = this.ports.get(portId);
    if (!port || port.kind !== 'motor') return;
    await this._write(buildCommand(Command.MOTOR_SPEED, [port.hwPort, clampInt8(speed)]));
    await this._write(buildCommand(Command.MOTOR_RUN, [port.hwPort, direction]));
  }

  async stopMotor(portId) {
    const port = this.ports.get(portId);
    if (!port || port.kind !== 'motor') return;
    await this._write(buildCommand(Command.MOTOR_BRAKE, [port.hwPort, MOTOR_BRAKE_STATE]));
    await this._write(buildCommand(Command.MOTOR_STOP, [port.hwPort]));
  }

  getPortsSnapshot() {
    const out = {};
    for (const [portId, port] of this.ports.entries()) {
      out[portId] = { ...port };
    }
    return out;
  }
}

export async function requestAndConnectDevice() {
  const bleDevice = await navigator.bluetooth.requestDevice({
    filters: [{ services: [SERVICE_UUID] }],
    optionalServices: [SERVICE_UUID],
  });
  const device = new DeviceConnection(bleDevice);
  await device.connect();
  return device;
}
