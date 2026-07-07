import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DeviceManager } from './ble/DeviceManager';
import { ColorClassifier } from './classifier/colorClassifier';
import { RunController } from './ide/runtime/runController';
import DevicePanel from './components/DevicePanel';
import DataPanel from './components/DataPanel';
import FunctionLibrary from './components/FunctionLibrary';
import CodeEditor from './ide/CodeEditor';

export default function App() {
  const deviceManager = useMemo(() => new DeviceManager(), []);
  const classifier = useMemo(() => new ColorClassifier(), []);
  const runController = useMemo(
    () => new RunController(deviceManager, classifier),
    [deviceManager, classifier]
  );

  const [devices, setDevices] = useState([]);
  const [endpoints, setEndpoints] = useState([]);
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
      setDevices([...deviceManager.devices]);
      setEndpoints(deviceManager.listEndpoints());
    }
    function onSensorValue() {
      // Sensor values stream frequently; a lightweight tick keeps swatches
      // and live readouts current without restructuring state per-event.
      rerenderTick.current += 1;
      refresh();
    }
    deviceManager.addEventListener('changed', refresh);
    deviceManager.addEventListener('sensorvalue', onSensorValue);
    refresh();
    return () => {
      deviceManager.removeEventListener('changed', refresh);
      deviceManager.removeEventListener('sensorvalue', onSensorValue);
    };
  }, [deviceManager]);

  const sensors = endpoints.filter((e) => e.kind === 'color-sensor');

  async function addDevice() {
    setConnecting(true);
    try {
      await deviceManager.addDevice();
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

  function removeDevice(device) {
    deviceManager.removeDevice(device);
  }

  function renameDevice(device, name) {
    deviceManager.renameDevice(device, name);
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
        <DevicePanel
          devices={devices}
          onAddDevice={addDevice}
          onRemoveDevice={removeDevice}
          onRenameDevice={renameDevice}
          connecting={connecting}
        />
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
