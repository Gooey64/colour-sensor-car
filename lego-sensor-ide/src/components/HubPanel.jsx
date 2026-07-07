import React from 'react';

const PORT_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function rgbCss(rgb255) {
  if (!rgb255) return '#333';
  const [r, g, b] = rgb255;
  return `rgb(${r}, ${g}, ${b})`;
}

export default function HubPanel({ hubs, onAddHub, onRemoveHub, connecting }) {
  const bleSupported = typeof navigator !== 'undefined' && !!navigator.bluetooth;

  return (
    <div className="panel-section">
      <h2>
        Hubs
        <button className="btn small primary" onClick={onAddHub} disabled={!bleSupported || connecting}>
          {connecting ? 'Connecting…' : '+ Connect hub'}
        </button>
      </h2>

      {!bleSupported && (
        <p className="empty-hint">
          Web Bluetooth isn't available here. Open this app in Chrome or Edge, over
          http://localhost or https, on desktop or Android.
        </p>
      )}

      {bleSupported && hubs.length === 0 && (
        <p className="empty-hint">
          No hubs connected yet. Turn on your LEGO Education CS &amp; AI kit hub and click
          "Connect hub" — once for the Motor hub, once for the Color Sensor hub.
        </p>
      )}

      {hubs.map((hub) => (
        <div className="hub-card" key={hub.handle}>
          <div className="hub-name">
            <span className="dot" />
            {hub.name}
            <button
              className="btn icon danger small"
              style={{ marginLeft: 'auto' }}
              onClick={() => onRemoveHub(hub)}
              title="Disconnect"
            >
              ×
            </button>
          </div>
          {Array.from(hub.ports.entries()).map(([portId, port]) => (
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
          {hub.ports.size === 0 && <div className="port-row">Waiting for ports to attach…</div>}
        </div>
      ))}
    </div>
  );
}
