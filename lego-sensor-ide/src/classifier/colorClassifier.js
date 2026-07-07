import { loadAllReadings, addReading, updateReading, deleteReading } from './storage';

export class ColorClassifier extends EventTarget {
  constructor() {
    super();
    this.readings = []; // [{ id, rgb, label: string|null, capturedAt }]
  }

  async load() {
    this.readings = await loadAllReadings();
    this._emitChanged();
  }

  // Newest first — this is the "table view" for the readings graph.
  listReadings() {
    return [...this.readings].sort((a, b) => b.capturedAt - a.capturedAt);
  }

  listUnlabeledReadings() {
    return this.listReadings().filter((r) => !r.label);
  }

  // label is optional — omit it (or pass null/'') to capture now and decide later.
  async captureReading(rgb, label = null) {
    const record = { rgb, label: label || null, capturedAt: Date.now() };
    const id = await addReading(record);
    record.id = id;
    this.readings.push(record);
    this._emitChanged();
    return record;
  }

  async setLabel(id, label) {
    const reading = this.readings.find((r) => r.id === id);
    if (!reading) return;
    reading.label = label || null;
    await updateReading(reading);
    this._emitChanged();
  }

  async removeReading(id) {
    this.readings = this.readings.filter((r) => r.id !== id);
    await deleteReading(id);
    this._emitChanged();
  }

  // ---- label/class views, derived from readings ----

  listClassNames() {
    const names = new Set();
    for (const r of this.readings) if (r.label) names.add(r.label);
    return Array.from(names);
  }

  getSamples(name) {
    return this.readings.filter((r) => r.label === name).map((r) => r.rgb);
  }

  centroid(name) {
    const samples = this.getSamples(name);
    if (samples.length === 0) return null;
    const sum = samples.reduce((acc, [r, g, b]) => [acc[0] + r, acc[1] + g, acc[2] + b], [0, 0, 0]);
    return sum.map((v) => v / samples.length);
  }

  // Returns { className, distance } for the nearest labeled class, or null
  // if no classes have any samples yet.
  classify(rgb) {
    let best = null;
    for (const name of this.listClassNames()) {
      const c = this.centroid(name);
      if (!c) continue;
      const d = distance(rgb, c);
      if (!best || d < best.distance) best = { className: name, distance: d };
    }
    return best;
  }

  async renameClass(oldName, newName) {
    const trimmed = (newName || '').trim();
    if (!trimmed || trimmed === oldName) return;
    const affected = this.readings.filter((r) => r.label === oldName);
    for (const r of affected) {
      r.label = trimmed;
      // eslint-disable-next-line no-await-in-loop
      await updateReading(r);
    }
    this._emitChanged();
  }

  // Unlabels the readings rather than deleting them, so captured samples
  // stay around to relabel instead of losing data.
  async removeClass(name) {
    const affected = this.readings.filter((r) => r.label === name);
    for (const r of affected) {
      r.label = null;
      // eslint-disable-next-line no-await-in-loop
      await updateReading(r);
    }
    this._emitChanged();
  }

  _emitChanged() {
    this.dispatchEvent(new CustomEvent('changed'));
  }
}

function distance(a, b) {
  return Math.sqrt(a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0));
}
