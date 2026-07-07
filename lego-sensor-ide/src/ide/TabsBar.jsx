import React from 'react';

export default function TabsBar({ tabs, activeTabId, onSelect, onClose, onAdd, onRename }) {
  return (
    <div className="tabs-bar">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
          onClick={() => onSelect(tab.id)}
        >
          <span
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => onRename(tab.id, e.target.textContent.trim() || tab.name)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          >
            {tab.name}
          </span>
          {tabs.length > 1 && (
            <span
              className="close"
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.id);
              }}
            >
              ×
            </span>
          )}
        </div>
      ))}
      <div className="tab-add" onClick={onAdd} title="New script tab">
        +
      </div>
    </div>
  );
}
