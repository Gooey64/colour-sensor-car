import React, { useState } from 'react';

const VB_W = 640;
const VB_H = 320;
const MARGIN = { top: 16, right: 16, bottom: 32, left: 40 };
const PLOT_W = VB_W - MARGIN.left - MARGIN.right;
const PLOT_H = VB_H - MARGIN.top - MARGIN.bottom;

const HUE_TICKS = [0, 60, 120, 180, 240, 300, 360];
const LIGHTNESS_TICKS = [0, 25, 50, 75, 100];

// Readings only carry RGB, so hue/lightness (the plot axes) are derived from
// that on the fly — this keeps the chart meaningful regardless of which
// device produced the reading, instead of depending on hardware-reported HSV fields
// that not every sensor sends.
function rgbToHueLightness([r, g, b]) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const lightness = ((max + min) / 2) * 100;
  const d = max - min;
  let hue = 0;
  if (d !== 0) {
    switch (max) {
      case rn:
        hue = ((gn - bn) / d) % 6;
        break;
      case gn:
        hue = (bn - rn) / d + 2;
        break;
      default:
        hue = (rn - gn) / d + 4;
        break;
    }
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return { hue, lightness };
}

function xScale(hue) {
  return MARGIN.left + (hue / 360) * PLOT_W;
}
function yScale(lightness) {
  return MARGIN.top + (1 - lightness / 100) * PLOT_H;
}

export default function ReadingsGraph({ readings, onPointClick }) {
  const [hoveredId, setHoveredId] = useState(null);
  const hovered = readings.find((r) => r.id === hoveredId) || null;

  return (
    <div className="graph-wrap">
      <svg
        className="graph-svg"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        style={{ aspectRatio: `${VB_W} / ${VB_H}` }}
        role="img"
        aria-label="Scatter plot of captured readings by hue and lightness"
      >
        {/* gridlines */}
        {HUE_TICKS.map((h) => (
          <line
            key={`vx${h}`}
            x1={xScale(h)}
            x2={xScale(h)}
            y1={MARGIN.top}
            y2={VB_H - MARGIN.bottom}
            className="grid-line"
          />
        ))}
        {LIGHTNESS_TICKS.map((l) => (
          <line
            key={`hy${l}`}
            x1={MARGIN.left}
            x2={VB_W - MARGIN.right}
            y1={yScale(l)}
            y2={yScale(l)}
            className="grid-line"
          />
        ))}

        {/* axis tick labels */}
        {HUE_TICKS.map((h) => (
          <text key={`xl${h}`} x={xScale(h)} y={VB_H - MARGIN.bottom + 16} className="axis-label" textAnchor="middle">
            {h}°
          </text>
        ))}
        {LIGHTNESS_TICKS.map((l) => (
          <text key={`yl${l}`} x={MARGIN.left - 8} y={yScale(l) + 3} className="axis-label" textAnchor="end">
            {l}%
          </text>
        ))}
        <text x={MARGIN.left + PLOT_W / 2} y={VB_H - 4} className="axis-title" textAnchor="middle">
          Hue
        </text>
        <text
          x={-(MARGIN.top + PLOT_H / 2)}
          y={12}
          className="axis-title"
          textAnchor="middle"
          transform="rotate(-90)"
        >
          Lightness
        </text>

        {/* points */}
        {readings.map((r) => {
          const { hue, lightness } = rgbToHueLightness(r.rgb);
          const cx = xScale(hue);
          const cy = yScale(lightness);
          const labeled = !!r.label;
          return (
            <g key={r.id}>
              <circle
                cx={cx}
                cy={cy}
                r={12}
                className="point-hit"
                tabIndex={0}
                role="img"
                aria-label={`${labeled ? r.label : 'Unlabeled'} reading, RGB ${r.rgb.join(', ')}`}
                onMouseEnter={() => setHoveredId(r.id)}
                onMouseLeave={() => setHoveredId((id) => (id === r.id ? null : id))}
                onFocus={() => setHoveredId(r.id)}
                onBlur={() => setHoveredId((id) => (id === r.id ? null : id))}
                onClick={() => onPointClick && onPointClick(r.id)}
              />
              <circle
                cx={cx}
                cy={cy}
                r={7}
                fill="none"
                className={labeled ? 'point-ring labeled' : 'point-ring unlabeled'}
              />
              <circle cx={cx} cy={cy} r={5} fill={`rgb(${r.rgb.join(',')})`} className="point-core" />
            </g>
          );
        })}
      </svg>

      {hovered && (
        <div
          className="graph-tooltip"
          style={{
            left: `${(xScale(rgbToHueLightness(hovered.rgb).hue) / VB_W) * 100}%`,
            top: `${(yScale(rgbToHueLightness(hovered.rgb).lightness) / VB_H) * 100}%`,
          }}
        >
          <div className="graph-tooltip-value">RGB {hovered.rgb.join(', ')}</div>
          <div className="graph-tooltip-meta">
            {hovered.label || 'Unlabeled'} · {new Date(hovered.capturedAt).toLocaleTimeString()}
          </div>
        </div>
      )}

      {readings.length === 0 && <p className="empty-hint">No readings captured yet.</p>}
    </div>
  );
}
