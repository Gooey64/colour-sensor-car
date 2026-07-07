# LEGO Sensor IDE

A local web app that connects to LEGO Education CS & AI kit devices (the
Motor device and the Color Sensor device used in those kits — not SPIKE
Prime/Robot Inventor, which speak a different Bluetooth protocol) over
**Web Bluetooth**, lets you capture color sensor readings and group them
into named classes, and gives you a small Python code IDE (tabs + editor)
to program a car's behavior against those classes and any connected
motors — across multiple devices at once.

No native app, no drivers: everything talks to the device straight from
the browser over the kit's own BLE protocol.

## Requirements

- **Chrome or Edge**, desktop or Android. Web Bluetooth doesn't exist in
  Firefox or Safari (including iOS Safari) — the app will tell you if your
  browser can't do it.
- Served over `http://localhost` (or `https://`) — Web Bluetooth requires a
  "secure context." The dev server below satisfies this automatically.
- One or more LEGO Education CS & AI kit devices (Motor device and/or
  Color Sensor device), powered on and in Bluetooth range. Each physical
  device is its own Bluetooth peripheral, so connect the Motor device and
  the Color Sensor device separately — click "Connect device" once per
  device.
- Internet access on first run, to fetch the Python runtime (Pyodide) from
  its CDN — see [Why Python needs a moment to start](#why-python-needs-a-moment-to-start).

## Run it

```bash
npm install
npm run dev
```

Open the printed `http://localhost:5173` URL in Chrome/Edge.

For a production build: `npm run build`, then serve the `dist/` folder with
any static file server run from `localhost`.

## Using it

The top-right switcher moves between three full-screen views — **Code**,
**Data**, and **Library**. The device connection panel on the left stays
visible in every view.

1. **Connect device** (top left) — this opens Chrome's normal Bluetooth
   device picker. Pick your device. Repeat to add more devices; each shows
   its ports live. Click a connected device's name to rename it — handy
   once you've connected more than one device of the same type (e.g. two
   Color Sensor devices) and need to tell them apart in the readings list
   and in scripts.
2. **Data tab** — capture and label color sensor readings:
   - Pick a connected color sensor, point it at something, and click
     **Capture reading**. The label field is optional — leave it blank to
     capture now and decide later, or type/reuse a class name to label it
     immediately.
   - Every capture shows up as a point on the **reading graph** (hue vs.
     lightness, each point drawn in its own true color; a dashed ring means
     unlabeled, a solid ring means labeled) and as a row in the **readings**
     table below it, where you can relabel or delete it any time.
   - The **classes** panel on the right summarizes labeled readings by class
     (sample count, average color) and lets you rename or unlabel a whole
     class at once. Readings and labels persist in the browser (IndexedDB)
     between sessions.
3. **Code tab** — write a Python script against the API below, click
   **Run**. Open more tabs with **+** for separate scripts; each is saved
   automatically. **Stop** kills the running script immediately.
4. **Library tab** — a reference list of the LEGO Education CS & AI kit's
   own Python function library (motors, color sensor, channels,
   controller), grouped by device. Informational only — this app's own
   script API is the one described below, not the kit's native Python API.

## Script API

Every tab runs as Python, with top-level `await` available directly:

```python
sensor_ids          # ["Front Sensor:A", "Back Sensor:A", ...] — every connected color sensor
motor_ids           # ["Drive Motors:A", ...] — every connected motor

Sensor(id).read()      # -> {"rgb": [r, g, b]} (0-255 each), or None
Sensor(id).classify()  # -> {"class_name", "distance"} or None if no classes yet

Motor(id).run(speed, power=100)  # speed: -100..100, power (optional): 0..100
Motor(id).stop()

wait(seconds)      # pause without blocking the page
print(...)         # write to the Console panel, just like normal Python print()
```

Example — drive forward until the sensor sees a class named `stop-line`:

```python
sensor = Sensor(sensor_ids[0])
motor = Motor(motor_ids[0])

while True:
    result = await sensor.classify()
    if result and result["class_name"] == "stop-line":
        await motor.stop()
        break
    await motor.run(40)
    await wait(0.1)
```

## Why loops can't freeze the page

Your script runs inside a **Web Worker** — its own thread, separate from
the page's UI thread. Even a script that never awaits anything can only spin
its own thread; the page stays responsive and **Stop** always terminates it
instantly (`worker.terminate()`), regardless of what the script is doing.
There's also a 30-second absolute runtime limit as a last-resort backstop
that clicks Stop for you.

One trade-off from switching to real Python (see below): there's no
automatic mid-loop recovery the way the old JS runtime had (via a
Babel loop-protect transform that broke `while`/`for` loops after ~2s of
no `await`). A Python loop that never awaits just runs until you click
**Stop** or the 30-second limit hits — both still work instantly, there's
just no graceful "gives up on its own" middle ground for Python the way
there was for JS.

## Why Python needs a moment to start

Scripts run on [Pyodide](https://pyodide.org) — a real CPython build
compiled to WebAssembly — loaded fresh inside a new Worker for every
**Run**, matching the "always a clean, isolated worker" design above. That
means every Run pays a load cost (usually well under a second once the
browser has the CDN assets cached, longer on the very first run or a slow
connection) before your script's own code starts. You'll see "Loading
Python runtime…" in the console while this happens.

## Hardware notes & caveats

- The app talks to the device over service UUID `0000fd02-...`, with
  separate write (`...-0001-...`) and notify (`...-0002-...`)
  characteristics — see `src/ble/techElement.js`. This is not LWP3 (the
  SPIKE Prime/Robot Inventor protocol); connecting a SPIKE Prime hub here
  won't work.
- On connect, the app sends an info request and reads back a `GroupID` to
  work out what kind of device it is: `512`/`513` are Motor devices
  (single vs. double motor), `514`/`515` are Color Sensor devices. An
  unrecognized `GroupID` logs a console warning and attaches no ports —
  that's the first thing to check if a device connects but nothing shows
  up.
- The Color message's raw red/green/blue channels are scaled to 0-255
  assuming a ~0-1024 raw range (matching other LEGO color sensors). That
  divisor is a guess pending verification against real hardware — if
  colors read too dark or blown out, adjust it in
  `DeviceConnection.js#_applyDeviceMessages`.
- Multiple devices connect completely independently — there's no built-in
  master/follower relationship, so scripts that use two devices' motors are
  just using two `Motor(id)` handles from the combined `motor_ids` list.

## Project layout

```
src/
  ble/            Web Bluetooth + CS & AI kit protocol, device & multi-device management
  classifier/     labeled-sample storage (IndexedDB) + nearest-centroid classifier
  ide/            tabbed Monaco editor, console, and the sandboxed run pipeline
  ide/runtime/    Web Worker running Pyodide + host<->worker RPC bridge
  components/     sidebar/tab panels (devices, data, function library)
```
