import React, { useEffect, useRef, useState } from 'react';
import ReadingsGraph from './ReadingsGraph';

function rgbCss(rgb) {
  if (!rgb) return '#333';
  const [r, g, b] = rgb;
  return `rgb(${r}, ${g}, ${b})`;
}

export default function DataPanel({ sensors, selectedSensorId, onSelectSensor, classifier }) {
  const [labelInput, setLabelInput] = useState('');
  const [highlightedId, setHighlightedId] = useState(null);
  const tableRef = useRef(null);

  const selected = sensors.find((s) => s.id === selectedSensorId) || sensors[0];
  const liveRgb = selected?.latest?.rgb255;
  const classNames = classifier.listClassNames();
  const live = liveRgb ? classifier.classify(liveRgb) : null;
  const readings = classifier.listReadings();
  const unlabeledCount = readings.filter((r) => !r.label).length;

  useEffect(() => {
    if (!highlightedId || !tableRef.current) return;
    const row = tableRef.current.querySelector(`[data-reading-id="${highlightedId}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [highlightedId]);

  async function capture() {
    if (!liveRgb) return;
    const label = labelInput.trim();
    await classifier.captureReading(liveRgb, label || null);
  }

  return (
    <div className="data-panel">
      <div className="panel-section">
        <h2>Capture readings</h2>
        {sensors.length === 0 ? (
          <p className="empty-hint">Connect a device with a color sensor to start capturing readings.</p>
        ) : (
          <>
            <select
              className="text-input"
              value={selected?.id}
              onChange={(e) => onSelectSensor(e.target.value)}
              style={{ marginBottom: 8 }}
            >
              {sensors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id}
                </option>
              ))}
            </select>

            <div className="row" style={{ marginBottom: 10 }}>
              <span className="swatch" style={{ width: 34, height: 34, background: rgbCss(liveRgb) }} />
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--text-dim)' }}>
                {liveRgb ? liveRgb.join(', ') : 'no reading yet'}
                <br />
                {live ? (
                  <span style={{ color: 'var(--data)' }}>
                    ≈ {live.className} (dist {live.distance.toFixed(1)})
                  </span>
                ) : (
                  <span>no classes yet</span>
                )}
              </div>
            </div>

            <div className="row" style={{ marginBottom: 8 }}>
              <input
                list="class-name-options"
                className="text-input"
                placeholder="Label (optional) — leave blank to capture unlabeled"
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
              />
              <datalist id="class-name-options">
                {classNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>

            <button className="btn primary" onClick={capture} disabled={!liveRgb} style={{ width: '100%' }}>
              Capture reading
            </button>
          </>
        )}
      </div>

      <div className="panel-section">
        <h2>
          Reading graph
          {unlabeledCount > 0 && <span className="pill">{unlabeledCount} unlabeled</span>}
        </h2>
        <ReadingsGraph readings={readings} onPointClick={setHighlightedId} />
      </div>

      <div className="panel-section data-columns">
        <div className="readings-list">
          <h2>Readings ({readings.length})</h2>
          {readings.length === 0 ? (
            <p className="empty-hint">Nothing captured yet — pick a sensor above and click Capture reading.</p>
          ) : (
            <div className="readings-table" ref={tableRef}>
              {readings.map((r) => (
                <ReadingRow
                  key={r.id}
                  reading={r}
                  highlighted={r.id === highlightedId}
                  classifier={classifier}
                />
              ))}
            </div>
          )}
        </div>

        <div className="class-summary">
          <h2>Classes</h2>
          {classNames.length === 0 ? (
            <p className="empty-hint">No labeled readings yet. Label a reading below to create one.</p>
          ) : (
            classNames.map((name) => <ClassItem key={name} name={name} classifier={classifier} />)
          )}
        </div>
      </div>
    </div>
  );
}

function ReadingRow({ reading, highlighted, classifier }) {
  const [editing, setEditing] = useState(reading.label || '');

  useEffect(() => {
    setEditing(reading.label || '');
  }, [reading.label]);

  function commitLabel() {
    const trimmed = editing.trim();
    if (trimmed !== (reading.label || '')) classifier.setLabel(reading.id, trimmed || null);
  }

  return (
    <div className={`reading-row ${highlighted ? 'highlighted' : ''}`} data-reading-id={reading.id}>
      <span className="swatch" style={{ background: rgbCss(reading.rgb) }} />
      <span className="reading-rgb">{reading.rgb.join(', ')}</span>
      <span className="reading-time">{new Date(reading.capturedAt).toLocaleTimeString()}</span>
      <input
        list="class-name-options"
        className="text-input reading-label-input"
        placeholder="unlabeled"
        value={editing}
        onChange={(e) => setEditing(e.target.value)}
        onBlur={commitLabel}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <button
        className="btn icon danger small"
        title="Delete reading"
        onClick={() => classifier.removeReading(reading.id)}
      >
        ×
      </button>
    </div>
  );
}

function ClassItem({ name, classifier }) {
  const [editing, setEditing] = useState(name);
  const samples = classifier.getSamples(name);
  const centroid = classifier.centroid(name);

  function commitRename() {
    const trimmed = editing.trim();
    if (trimmed && trimmed !== name) classifier.renameClass(name, trimmed);
    else setEditing(name);
  }

  return (
    <div className="class-item">
      <div className="class-item-head">
        <span className="swatch" style={{ background: rgbCss(centroid) }} />
        <input
          value={editing}
          onChange={(e) => setEditing(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => e.key === 'Enter' && commitRename()}
        />
        <button
          className="btn icon danger small"
          title="Unlabel all readings in this class"
          onClick={() => classifier.removeClass(name)}
        >
          ×
        </button>
      </div>
      <div className="meta">
        {samples.length} sample{samples.length === 1 ? '' : 's'}
        {centroid ? ` · avg ${centroid.map((v) => Math.round(v)).join(',')}` : ''}
      </div>
    </div>
  );
}
