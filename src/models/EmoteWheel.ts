export interface EmoteWheel {
    a: string;
    b: boolean;
    c: Record<number, string>;
    d: number;
    e: number | null;
}

export const DEFAULT_EMOTE_SLOTS: Record<number, string> = {
    "0": "RUNNING_IN_PLACE",
    "1": "DAB",
    "2": "NO",
    "3": "WAVE_R",
    "4": "WHEW",
    "5": "YES"
};
