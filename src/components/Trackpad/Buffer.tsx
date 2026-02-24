import type React from "react";

interface ControlBarProps {
	bufferText: string;
}

export const BufferBar: React.FC<ControlBarProps> = ({ bufferText }) => {
	return <p>{bufferText}</p>;
};
