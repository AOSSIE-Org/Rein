import React from "react";
import { KeyGrid } from "./KeyGrid";

const FN_KEYS = [
    { label: "F1", key: "f1" },
    { label: "F2", key: "f2" },
    { label: "F3", key: "f3" },
    { label: "F4", key: "f4" },
    { label: "F5", key: "f5" },
    { label: "F6", key: "f6" },
    { label: "F7", key: "f7" },
    { label: "F8", key: "f8" },
    { label: "F9", key: "f9" },
    { label: "F10", key: "f10" },
    { label: "F11", key: "f11" },
    { label: "F12", key: "f12" },
];

interface FnKeysProps {
    sendKey: (key: string) => void;
}

export const FnKeys: React.FC<FnKeysProps> = ({ sendKey }) => (
    <KeyGrid keys={FN_KEYS} sendKey={sendKey} className="grid-rows-2 h-full" />
);
