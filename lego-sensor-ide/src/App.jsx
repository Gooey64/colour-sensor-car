import React, { useEffect, useMemo, useRef, useState } from 'react';
import { HubManager } from './ble/HubManager';
import { ColorClassifier } from './classifier/colorClassifier';
import { RunController } from './ide/runtime/runController';
import HubPanel from './components/HubPanel';
import DataPanel from './components/DataPanel';
import FunctionLibrary from './components/FunctionLibrary';
import CodeEditor from './ide/CodeEditor';

export default function App() {
  const hubManager = useMemo(() => new HubManager(), []);
  const classifier = useMemo(() => new ColorClassifier(), []);
  const runController = useMemo(() => new RunController(hubManager, classifier), [hubManager, classifier]);

  const [hubs, setHubs] = useState([]);
  const [devices, setDevices] = useState([]);
  const [connecting, setConnecting] = useState(false);
  const [selectedSensorId, setSelectedSensorId] = useState(null);
  const [view, setView] = useState('code'); // 'code' | 'data' | 'library'
  const rerenderTick = useRef(0);
  const [, forceDataRerender] = useState(0);

  useEffect(() => {
    classifier.load();
    function onDataChanged() {
      forceDataRerender((v) => v + 1);
    }
    classifier.addEventListener('changed', onDataChanged);
    return () => classifier.removeEventListener('changed', onDataChanged);
  }, [classifier]);

  useEffect(() => {
    function refresh() {
      setHubs([...hubManager.hubs]);
      setDevices(hubManager.listDevices());
    }
    function onSensorValue() {
      // Sensor values stream frequently; a lightweight tick keeps swatches
      // and live readouts current without restructuring state per-event.
      rerenderTick.current += 1;
      refresh();
    }
    hubManager.addEventListener('changed', refresh);
    hubManager.addEventListener('sensorvalue', onSensorValue);
    refresh();
    return () => {
      hubManager.removeEventListener('changed', refresh);
      hubManager.removeEventListener('sensorvalue', onSensorValue);
    };
  }, [hubManager]);

  const sensors = devices.filter((d) => d.kind === 'color-sensor');

  async function addHub() {
    setConnecting(true);
    try {
      await hubManager.addHub();
    } catch (e) {
      if (e.name !== 'NotFoundError') {
        // NotFoundError = user cancelled the browser's device picker.
        console.error(e);
        alert(`Couldn't connect: ${e.message || e}`);
      }
    } finally {
      setConnecting(false);
    }
  }

  function removeHub(hub) {
    hubManager.removeHub(hub);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="mark" />
        <h1>LEGO Sensor IDE</h1>
        <span className="sub">connect · label · program</span>
        <div className="view-switch">
          <button className={view === 'code' ? 'active' : ''} onClick={() => setView('code')}>
            Code
          </button>
          <button className={view === 'data' ? 'active' : ''} onClick={() => setView('data')}>
            Data
          </button>
          <button className={view === 'library' ? 'active' : ''} onClick={() => setView('library')}>
            Library
          </button>
        </div>
      </header>

      <aside className="sidebar">
        <HubPanel hubs={hubs} onAddHub={addHub} onRemoveHub={removeHub} connecting={connecting} />
      </aside>

      {view === 'code' && <CodeEditor runController={runController} />}
      {view === 'data' && (
        <DataPanel
          sensors={sensors}
          selectedSensorId={selectedSensorId || sensors[0]?.id}
          onSelectSensor={setSelectedSensorId}
          classifier={classifier}
        />
      )}
      {view === 'library' && <FunctionLibrary />}
    </div>
  );
}
