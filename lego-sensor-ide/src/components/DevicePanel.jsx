import React, { useEffect, useState } from 'react';

const PORT_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function rgbCss(rgb255) {
  if (!rgb255) return '#333';
  const [r, g, b] = rgb255;
  return `rgb(${r}, ${g}, ${b})`;
}

export default function DevicePanel({ devices, onAddDevice, onRemoveDevice, onRenameDevice, connecting }) {
  const bleSupported = typeof navigator !== 'undefined' && !!navigator.bluetooth;

  return (
    <div className="panel-section">
      <h2>
        Devices
        <button className="btn small primary" onClick={onAddDevice} disabled={!bleSupported || connecting}>
          {connecting ? 'Connecting…' : '+ Connect device'}
        </button>
      </h2>

      {!bleSupported && (
        <p className="empty-hint">
          Web Bluetooth isn't available here. Open this app in Chrome or Edge, over
          http://localhost or https, on desktop or Android.
        </p>
      )}

      {bleSupported && devices.length === 0 && (
        <p className="empty-hint">
          No devices connected yet. Turn on your LEGO Education CS &amp; AI kit device and click
          "Connect device" — once for the Motor device, once for the Color Sensor device. Once
          connected, rename a device below to tell multiple devices of the same type apart.
        </p>
      )}

      {devices.map((device) => (
        <DeviceCard key={device.handle} device={device} onRemove={onRemoveDevice} onRename={onRenameDevice} />
      ))}
    </div>
  );
}

function DeviceCard({ device, onRemove, onRename }) {
  const [editing, setEditing] = useState(device.name);

  useEffect(() => {
    setEditing(device.name);
  }, [device.name]);

  function commitRename() {
    const trimmed = editing.trim();
    if (trimmed && trimmed !== device.name) onRename(device, trimmed);
    else setEditing(device.name);
  }

  return (
    <div className="device-card">
      <div className="device-name">
        <span className="dot" />
        <input
          className="device-name-input"
          value={editing}
          onChange={(e) => setEditing(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          title="Click to rename this device"
        />
        <button
          className="btn icon danger small"
          style={{ marginLeft: 'auto' }}
          onClick={() => onRemove(device)}
          title="Disconnect"
        >
          ×
        </button>
      </div>
      {Array.from(device.ports.entries()).map(([portId, port]) => (
        <div className="port-row" key={portId}>
          <span>{PORT_LETTERS[portId] ?? portId}</span>
          <span>
            {port.kind === 'color-sensor'
              ? 'Color sensor'
              : port.kind === 'motor'
              ? 'Motor'
              : `Device ${port.deviceType}`}
          </span>
          {port.kind === 'color-sensor' && (
            <span
              className="swatch"
              style={{ background: rgbCss(port.latest?.rgb255), marginLeft: 'auto' }}
              title={port.latest ? port.latest.rgb255.join(', ') : 'no reading yet'}
            />
          )}
        </div>
      ))}
      {device.ports.size === 0 && <div className="port-row">Waiting for ports to attach…</div>}
    </div>
  );
}
