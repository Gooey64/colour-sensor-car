import { requestAndConnectDevice } from './DeviceConnection';

const PORT_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export class DeviceManager extends EventTarget {
  constructor() {
    super();
    this.devices = []; // DeviceConnection[]
  }

  async addDevice() {
    const device = await requestAndConnectDevice();
    device.addEventListener('portattached', () => this._emitChanged());
    device.addEventListener('portdetached', () => this._emitChanged());
    device.addEventListener('sensorvalue', (e) =>
      this.dispatchEvent(new CustomEvent('sensorvalue', { detail: { device, ...e.detail } }))
    );
    device.addEventListener('disconnected', () => {
      this.devices = this.devices.filter((d) => d !== device);
      this._emitChanged();
    });
    this.devices.push(device);
    this._emitChanged();
    return device;
  }

  removeDevice(device) {
    device.disconnect();
    this.devices = this.devices.filter((d) => d !== device);
    this._emitChanged();
  }

  renameDevice(device, name) {
    const trimmed = (name || '').trim();
    if (!trimmed || trimmed === device.name) return;
    device.name = trimmed;
    this._emitChanged();
  }

  _emitChanged() {
    this.dispatchEvent(new CustomEvent('changed'));
  }

  // Flat, friendly view of every motor/sensor across every connected
  // device, e.g. [{ id: 'Front Sensor:A', device, portId, kind, deviceType,
  // latest }, ...]. Device names default to whatever the hardware
  // advertises but can be renamed via renameDevice() — handy once more than
  // one device of the same type is connected.
  listEndpoints() {
    const out = [];
    this.devices.forEach((device, deviceIndex) => {
      const ports = device.getPortsSnapshot();
      Object.entries(ports).forEach(([portId, port]) => {
        const letter = PORT_LETTERS[Number(portId)] ?? portId;
        out.push({
          id: `${device.name || `Device${deviceIndex + 1}`}:${letter}`,
          device,
          portId: Number(portId),
          kind: port.kind,
          deviceType: port.deviceType,
          latest: port.latest,
        });
      });
    });
    return out;
  }

  findSensors() {
    return this.listEndpoints().filter((e) => e.kind === 'color-sensor');
  }

  findMotors() {
    return this.listEndpoints().filter((e) => e.kind === 'motor');
  }
}
