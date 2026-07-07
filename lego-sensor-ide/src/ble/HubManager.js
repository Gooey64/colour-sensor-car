import { requestAndConnectHub } from './HubConnection';

const PORT_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export class HubManager extends EventTarget {
  constructor() {
    super();
    this.hubs = []; // HubConnection[]
  }

  async addHub() {
    const hub = await requestAndConnectHub();
    hub.addEventListener('portattached', () => this._emitChanged());
    hub.addEventListener('portdetached', () => this._emitChanged());
    hub.addEventListener('sensorvalue', (e) =>
      this.dispatchEvent(new CustomEvent('sensorvalue', { detail: { hub, ...e.detail } }))
    );
    hub.addEventListener('disconnected', () => {
      this.hubs = this.hubs.filter((h) => h !== hub);
      this._emitChanged();
    });
    this.hubs.push(hub);
    this._emitChanged();
    return hub;
  }

  removeHub(hub) {
    hub.disconnect();
    this.hubs = this.hubs.filter((h) => h !== hub);
    this._emitChanged();
  }

  _emitChanged() {
    this.dispatchEvent(new CustomEvent('changed'));
  }

  // Flat, friendly view of every attached device across every hub, e.g.
  // [{ id: 'Hub1:A', hub, portId, kind, deviceType, latest }, ...]
  listDevices() {
    const out = [];
    this.hubs.forEach((hub, hubIndex) => {
      const ports = hub.getPortsSnapshot();
      Object.entries(ports).forEach(([portId, port]) => {
        const letter = PORT_LETTERS[Number(portId)] ?? portId;
        out.push({
          id: `${hub.name || `Hub${hubIndex + 1}`}:${letter}`,
          hub,
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
    return this.listDevices().filter((d) => d.kind === 'color-sensor');
  }

  findMotors() {
    return this.listDevices().filter((d) => d.kind === 'motor');
  }
}
