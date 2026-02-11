import React, { useState } from "react";
import { VolumeX, Volume1, Volume2, SkipBack, Play, Pause, SkipForward } from "lucide-react";

interface MediaKeysProps {
    sendKey: (key: string) => void;
}

const MEDIA_KEYS = [
    { label: "Mute", key: "audiomute", icon: VolumeX },
    { label: "Vol−", key: "audiovoldown", icon: Volume1 },
    { label: "Vol+", key: "audiovolup", icon: Volume2 },
    { label: "Prev", key: "audioprev", icon: SkipBack },
    { label: "Next", key: "audionext", icon: SkipForward },
];

export const MediaKeys: React.FC<MediaKeysProps> = ({ sendKey }) => {
    const [isPlaying, setIsPlaying] = useState(false);

    const handleInteract = (e: React.PointerEvent, key: string) => {
        e.preventDefault();
        sendKey(key);
    };

    const handlePlayPause = (e: React.PointerEvent) => {
        e.preventDefault();
        sendKey(isPlaying ? "audiopause" : "audioplay");
        setIsPlaying(prev => !prev);
    };

    return (
        <div className="grid grid-cols-6 gap-1 p-2 h-full">
            {MEDIA_KEYS.map(({ label, key, icon: Icon }) => (
                <button
                    key={key}
                    type="button"
                    className="btn btn-primary min-w-0 h-full"
                    onPointerDown={(e) => handleInteract(e, key)}
                    title={label}
                    aria-label={label}
                >
                    <Icon size={18} />
                </button>
            ))}
            <button
                type="button"
                className="btn btn-primary min-w-0 h-full"
                onPointerDown={handlePlayPause}
                title={isPlaying ? "Pause" : "Play"}
                aria-label={isPlaying ? "Pause" : "Play"}
            >
                {isPlaying ? <Pause size={18} /> : <Play size={18} />}
            </button>
        </div>
    );
};
