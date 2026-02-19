export type ModifierState = "Active" | "Release" | "Hold";

export type RemoteMessage =
    | { type: "move"; dx: number; dy: number }
    | { type: "scroll"; dx?: number; dy?: number }
    | { type: "click"; button: "left" | "right" | "middle"; press: boolean }
    | { type: "key"; key: string }
    | { type: "text"; text: string }
    | { type: "zoom"; delta: number }
    | { type: "combo"; keys: string[] };
