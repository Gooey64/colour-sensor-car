import React, { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import TabsBar from './TabsBar';
import Console from './Console';

const STORAGE_KEY = 'lego-sensor-ide-tabs-v1';

const STARTER_CODE = `// Available in every script:
//   sensorIds, motorIds        arrays of connected device ids, e.g. "Hub1:A"
//   Sensor(id).read()          -> { rgb: [r, g, b] }
//   Sensor(id).classify()      -> { className, distance } | null (no classes yet)
//   Motor(id).run(speed, power)  speed: -100..100, power: 0..100 (optional)
//   Motor(id).stop()
//   sleep(ms)                  pause without blocking the page
//   print(...)                 write to the console below
//
// Tip: an "await sleep(...)" inside a loop keeps things responsive.
// A loop that never awaits will auto-break after a couple of seconds
// so it can't lock up the page — but a "Stop" click always wins.

print('sensors:', sensorIds);
print('motors:', motorIds);

if (sensorIds.length && motorIds.length) {
  const sensor = Sensor(sensorIds[0]);
  const motor = Motor(motorIds[0]);

  while (true) {
    const result = await sensor.classify();
    if (result) {
      print('seeing:', result.className, result.distance.toFixed(1));
    }

    if (result && result.className === 'stop-line') {
      await motor.stop();
    } else {
      await motor.run(35);
    }

    await sleep(100);
  }
} else {
  print('Connect a hub with a color sensor and a motor, then run again.');
}
`;

function loadTabs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    /* ignore */
  }
  return [{ id: 't1', name: 'main.js', code: STARTER_CODE }];
}

export default function CodeEditor({ runController }) {
  const [tabs, setTabs] = useState(loadTabs);
  const [activeTabId, setActiveTabId] = useState(tabs[0].id);
  const [lines, setLines] = useState([]);
  const [running, setRunning] = useState(false);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
  }, [tabs]);

  useEffect(() => {
    function onPrint(e) {
      setLines((prev) => [...prev, { kind: 'log', text: e.detail }]);
    }
    function onError(e) {
      setLines((prev) => [...prev, { kind: 'error', text: e.detail }]);
    }
    function onStart() {
      setRunning(true);
      setLines((prev) => [...prev, { kind: 'system', text: '▶ Running…' }]);
    }
    function onStop() {
      setRunning(false);
    }
    runController.addEventListener('print', onPrint);
    runController.addEventListener('error', onError);
    runController.addEventListener('start', onStart);
    runController.addEventListener('stop', onStop);
    return () => {
      runController.removeEventListener('print', onPrint);
      runController.removeEventListener('error', onError);
      runController.removeEventListener('start', onStart);
      runController.removeEventListener('stop', onStop);
    };
  }, [runController]);

  function updateCode(code) {
    setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, code } : t)));
  }

  function addTab() {
    const id = `t${Date.now()}`;
    const name = `script${tabs.length + 1}.js`;
    setTabs((prev) => [...prev, { id, name, code: '// New script\n' }]);
    setActiveTabId(id);
  }

  function closeTab(id) {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (activeTabId === id && next.length) setActiveTabId(next[0].id);
      return next;
    });
  }

  function renameTab(id, name) {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, name } : t)));
  }

  function run() {
    setLines([]);
    runController.run(activeTab.code);
  }

  function stop() {
    runController.stop();
    setLines((prev) => [...prev, { kind: 'system', text: '■ Stopped.' }]);
  }

  return (
    <div className="main">
      <TabsBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelect={setActiveTabId}
        onClose={closeTab}
        onAdd={addTab}
        onRename={renameTab}
      />

      <div className="editor-toolbar">
        <button className="btn primary" onClick={run} disabled={running}>
          ▶ Run
        </button>
        <button className="btn danger" onClick={stop} disabled={!running}>
          ■ Stop
        </button>
        <span className={`status-pill ${running ? 'running' : ''}`}>
          {running ? 'running' : 'idle'}
        </span>
      </div>

      <div className="editor-wrap">
        <Editor
          height="100%"
          theme="vs-dark"
          language="javascript"
          value={activeTab.code}
          onChange={(v) => updateCode(v ?? '')}
          options={{
            fontSize: 13,
            fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            tabSize: 2,
          }}
        />
      </div>

      <Console lines={lines} onClear={() => setLines([])} />
    </div>
  );
}
