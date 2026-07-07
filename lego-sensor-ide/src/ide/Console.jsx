import React, { useEffect, useRef } from 'react';

export default function Console({ lines, onClear }) {
  const bodyRef = useRef(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [lines]);

  return (
    <div className="console">
      <div className="console-head">
        <span>Console</span>
        <button className="btn small" onClick={onClear}>
          Clear
        </button>
      </div>
      <div className="console-body" ref={bodyRef}>
        {lines.length === 0 && <div style={{ color: 'var(--text-dim)' }}>Nothing here yet. Click Run.</div>}
        {lines.map((line, i) => (
          <div className={`console-line ${line.kind}`} key={i}>
            {line.text}
          </div>
        ))}
      </div>
    </div>
  );
}
