import React, { useState } from 'react';

// Reference-only: the LEGO Education CS & AI kit's Python function library,
// as documented for students. Nothing here calls real hardware — it's the
// same list a student sees in the kit's own code.legoeducation.com editor.
const CATEGORIES = [
  {
    id: 'gn',
    title: 'General',
    fns: [
      { name: 'wait(seconds)', desc: 'Pause for this many seconds' },
      { name: 'print(message)', desc: 'Show a message in the Output box' },
    ],
  },
  {
    id: 'ch',
    title: 'Channels — channel',
    fns: [
      { name: 'channel.msg', desc: 'The latest message from the phone on this channel' },
      { name: 'channel.distance', desc: 'Straight-line distance (cm) to the tag, or None if no tag is seen' },
      { name: 'channel.x', desc: 'Sideways offset (cm): + = tag is to the right' },
      { name: 'channel.y', desc: 'Forward/back offset (cm) to the tag' },
      { name: "channel.send('go')", desc: 'Send a message on the channel' },
      { name: "channel.wait_for('go')", desc: "Pause until 'go' arrives" },
      { name: 'channel.clear()', desc: 'Forget the last message' },
    ],
  },
  {
    id: 'dm',
    title: 'Double Motor — dm',
    fns: [
      { name: 'dm.run()', desc: 'Drive straight until stop()' },
      { name: 'dm.run_time(ms)', desc: 'Drive for this many milliseconds' },
      { name: 'dm.turn_left(degrees)', desc: 'Turn left in place (both wheels)' },
      { name: 'dm.turn_right(degrees)', desc: 'Turn right in place (both wheels)' },
      { name: 'dm.set_speed(speed)', desc: 'Set speed 0–100' },
      { name: 'dm.stop()', desc: 'Stop both motors' },
    ],
  },
  {
    id: 'sm',
    title: 'Single Motor — sm',
    fns: [
      { name: 'sm.run()', desc: 'Run until stop()' },
      { name: 'sm.stop()', desc: 'Stop the motor' },
      { name: 'sm.set_speed(speed)', desc: 'Set speed 0–100' },
    ],
  },
  {
    id: 'cs',
    title: 'Color Sensor — cs',
    fns: [
      { name: 'cs.detect_color()', desc: "Returns color e.g. 'Red'" },
      { name: 'cs.detect_rgb()', desc: 'Returns (R, G, B) values' },
      { name: 'cs.detect_reflection()', desc: 'Reflection 0–100' },
    ],
  },
  {
    id: 'ct',
    title: 'Controller — c',
    fns: [
      { name: 'c.drive(dm)', desc: 'Drive dm with the sticks' },
      { name: 'c.left_position()', desc: 'Left stick −100 to 100' },
      { name: 'c.right_position()', desc: 'Right stick −100 to 100' },
    ],
  },
  {
    id: 'tm',
    title: 'Teachable Machine (phone)',
    fns: [
      {
        name: null,
        desc:
          "The phone runs the model and sends its top prediction over the channel. Read it on the laptop with channel.msg.",
      },
    ],
  },
];

export default function FunctionLibrary() {
  const [openIds, setOpenIds] = useState(() => new Set(['gn']));

  function toggle(id) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="data-panel">
      <div className="panel-section">
        <h2>CS &amp; AI Kit Function Library</h2>
        <p className="empty-hint" style={{ marginBottom: 12 }}>
          Reference only — the Python functions available on the LEGO Education CS &amp; AI
          kit, grouped by device.
        </p>

        {CATEGORIES.map((cat) => {
          const open = openIds.has(cat.id);
          return (
            <div className={`cat-card ${cat.id}`} key={cat.id}>
              <button className={`cat-btn ${open ? 'open' : ''}`} onClick={() => toggle(cat.id)}>
                {cat.title}
                <span className="arrow">▶</span>
              </button>
              {open && (
                <div className="cat-content">
                  {cat.fns.map((fn, i) => (
                    <div className="fn-row" key={fn.name || i}>
                      {fn.name && <div className="fn-name">{fn.name}</div>}
                      <div className="fn-desc">{fn.desc}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
