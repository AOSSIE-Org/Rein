import React from "react";

interface ExtraKeysProps {
  sendKey: (key: string) => void;
  onInputFocus: () => void;
}

const ROWS = [
  ["Esc", "Tab", "Backspace", "Delete"],
  ["Ctrl", "Alt", "Shift", "Meta", "Fn"],
  ["↑", "←", "↓", "→"],
  ["Play", "Prev", "Next", "Vol-", "Vol+"],
];

export const ExtraKeys: React.FC<ExtraKeysProps> = ({ sendKey, onInputFocus }) => {
  const press = (e: React.PointerEvent, k: string) => {
    e.preventDefault();
    sendKey(k.toLowerCase());
    onInputFocus();
  };

  return (
    <div className="bg-base-300 p-2 flex flex-col gap-2 shrink-0">
      {ROWS.map((row, i) => (
        <div key={i} className="flex gap-2 justify-center">
          {row.map(k => (
            <button
              key={k}
              className="btn btn-sm btn-neutral min-w-14
"
              onPointerDown={e => press(e, k)}
            >
              {k}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
};
