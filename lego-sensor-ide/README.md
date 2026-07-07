# LEGO Sensor IDE

A local web app that connects to LEGO Education CS & AI kit hubs (the Motor
hub and the Color Sensor hub used in those kits — not SPIKE Prime/Robot
Inventor, which speak a different Bluetooth protocol) over **Web
Bluetooth**, lets you capture color sensor readings and group them into
named classes, and gives you a small code IDE (tabs + a JS-like editor) to
program a car's behavior against those classes and any connected motors —
across multiple hubs at once.

No native app, no drivers: everything talks to the hub straight from the
browser over the kit's own BLE protocol.

## Requirements

- **Chrome or Edge**, desktop or Android. Web Bluetooth doesn't exist in
  Firefox or Safari (including iOS Safari) — the app will tell you if your
  browser can't do it.
- Served over `http://localhost` (or `https://`) — Web Bluetooth requires a
  "secure context." The dev server below satisfies this automatically.
- One or more LEGO Education CS & AI kit hubs (Motor hub and/or Color
  Sensor hub), powered on and in Bluetooth range. Each physical hub is its
  own Bluetooth peripheral, so connect the Motor hub and the Color Sensor
  hub separately — click "Connect hub" once per hub.

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
**Data**, and **Library**. The hub connection panel on the left stays visible
in every view.

1. **Connect hub** (top left) — this opens Chrome's normal Bluetooth device
   picker. Pick your hub. Repeat to add more hubs; each shows its attached
   ports live.
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
3. **Code tab** — write a script against the API below, click **Run**. Open
   more tabs with **+** for separate scripts; each is saved automatically.
   **Stop** kills the running script immediately.
4. **Library tab** — a reference list of the LEGO Education CS & AI kit's
   Python function library (motors, color sensor, channels, controller),
   grouped by device. Informational only — this app's own script API is the
   one described below, not the kit's native Python API.

## Script API

Every tab runs as the body of an `async` function, so top-level `await`
works directly:

```js
sensorIds          // ["Hub1:A", "Hub2:C", ...] — every connected color sensor
motorIds           // ["Hub1:B", ...] — every connected motor

Sensor(id).read()      // -> { rgb: [r, g, b] } (0-255 each), or null
Sensor(id).classify()  // -> { className, distance } | null if no classes yet

Motor(id).run(speed, power)  // speed: -100..100, power (optional): 0..100
Motor(id).stop()

sleep(ms)          // pause without blocking the page
print(...)         // write to the Console panel
```

Example — drive forward until the sensor sees a class named `stop-line`:

```js
const sensor = Sensor(sensorIds[0]);
const motor = Motor(motorIds[0]);

while (true) {
  const result = await sensor.classify();
  if (result?.className === 'stop-line') {
    await motor.stop();
    break;
  }
  await motor.run(40);
  await sleep(100);
}
```

## Why loops can't freeze the page

Your script runs inside a **Web Worker** — its own JS thread, separate from
the page's UI thread. Even a script that never awaits anything can only spin
its own thread; the page stays responsive and **Stop** always terminates it
instantly.

On top of that, `while`/`for`/`do` loops are automatically rewritten (via
Babel + `loop-protect`) to break themselves after ~2 seconds if they haven't
yielded, so a script that forgot a `sleep()` typically recovers gracefully on
its own instead of needing a hard stop. There's also a 30-second absolute
runtime limit as a last-resort backstop.

## Hardware notes & caveats

- The app talks to the hub over service UUID `0000fd02-...`, with separate
  write (`...-0001-...`) and notify (`...-0002-...`) characteristics — see
  `src/ble/techElement.js`. This is not LWP3 (the SPIKE Prime/Robot
  Inventor protocol); connecting a SPIKE Prime hub here won't work.
- On connect, the app sends an info request and reads back a `GroupID` to
  work out what kind of hub it is: `512`/`513` are Motor hubs (single vs.
  double motor), `514`/`515` are Color Sensor hubs. An unrecognized
  `GroupID` logs a console warning and attaches no ports — that's the first
  thing to check if a hub connects but nothing shows up.
- The Color message's raw red/green/blue channels are scaled to 0-255
  assuming a ~0-1024 raw range (matching other LEGO color sensors). That
  divisor is a guess pending verification against real hardware — if
  colors read too dark or blown out, adjust it in
  `HubConnection.js#_applyDeviceMessages`.
- Multiple hubs connect completely independently — there's no built-in
  master/follower relationship, so scripts that use two hubs' motors are
  just using two `Motor(id)` handles from the combined `motorIds` list.

## Project layout

```
src/
  ble/            Web Bluetooth + CS & AI kit protocol, hub & multi-hub management
  classifier/     labeled-sample storage (IndexedDB) + nearest-centroid classifier
  ide/            tabbed Monaco editor, console, and the sandboxed run pipeline
  ide/runtime/    Web Worker + loop-protection + host<->worker RPC bridge
  components/     sidebar panels (hubs, labeler)
```
