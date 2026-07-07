import React, { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import TabsBar from './TabsBar';
import Console from './Console';

const STORAGE_KEY = 'lego-sensor-ide-tabs-v2';

const STARTER_CODE = `# Available in every script:
#   sensor_ids, motor_ids            lists of connected device ids, e.g. "Front Sensor:A"
#   Sensor(id).read()                -> {"rgb": [r, g, b]}
#   Sensor(id).classify()            -> {"class_name", "distance"} or None (no classes yet)
#   Motor(id).run(speed, power=100)  speed: -100..100, power: 0..100 (optional)
#   Motor(id).stop()
#   wait(seconds)                    pause without blocking the page
#   print(...)                       write to the console below
#
# The kit's own dm / sm / cs functions (see the Library tab) also work here,
# bound to the first connected device of each type:
#   dm.set_speed(speed); dm.run(); dm.stop(); dm.turn_left(deg); dm.turn_right(deg); dm.run_time(ms)
#   sm.set_speed(speed); sm.run(); sm.stop()
#   cs.detect_rgb(); cs.detect_color(); cs.detect_reflection()
#
# Tip: an "await wait(...)" inside a loop keeps things responsive.
# "Stop" always ends the script immediately; there's also a 30-second
# automatic safety limit in case a script never finishes.

print("sensors:", sensor_ids)
print("motors:", motor_ids)

if sensor_ids and motor_ids:
    sensor = Sensor(sensor_ids[0])
    motor = Motor(motor_ids[0])

    while True:
        result = await sensor.classify()
        if result:
            print("seeing:", result["class_name"], round(result["distance"], 1))

        if result and result["class_name"] == "stop-line":
            await motor.stop()
        else:
            await motor.run(35)

        await wait(0.1)
else:
    print("Connect a device with a color sensor and a motor, then run again.")
`;

const DEMO_CODE = `# Demo: drive a Double Motor device forward while reading and printing
# from a Color Sensor device, using the kit's own dm/cs functions (see the
# Library tab). dm is bound to the first connected Double Motor device, cs
# to the first connected Color Sensor device.

try:
    await dm.set_speed(40)
    await dm.run()

    for _ in range(20):
        rgb = await cs.detect_rgb()
        color = await cs.detect_color()
        print("color:", color, "rgb:", rgb)
        await wait(0.2)

    await dm.stop()
except Exception as e:
    print("Connect a Double Motor device and a Color Sensor device, then run again:", e)
`;

function loadTabs() {
  let tabs = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) tabs = JSON.parse(raw);
  } catch (e) {
    /* ignore */
  }
  if (!tabs || !tabs.length) {
    tabs = [{ id: 't1', name: 'main.py', code: STARTER_CODE }];
  }
  if (!tabs.some((t) => t.name === 'demo.py')) {
    tabs = [...tabs, { id: 'demo', name: 'demo.py', code: DEMO_CODE }];
  }
  return tabs;
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
    const name = `script${tabs.length + 1}.py`;
    setTabs((prev) => [...prev, { id, name, code: '# New script\n' }]);
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
          language="python"
          value={activeTab.code}
          onChange={(v) => updateCode(v ?? '')}
          options={{
            fontSize: 13,
            fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            tabSize: 4,
          }}
        />
      </div>

      <Console lines={lines} onClear={() => setLines([])} />
    </div>
  );
}
