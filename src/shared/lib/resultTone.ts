// The color of a result line under a hand, from what the line says about its own bet:
// a push is yellow, a win is green, a loss is red, anything else is plain. Each line is
// colored on its own, so a pushed main bet stays yellow even if a side bet lost.

export type ResultTone = "win" | "push" | "lose" | "plain";

export function resultTone(line: string): ResultTone {
    // "Push 22" is the name of a side bet, not a push
    const l = line.replace(/Push 22/g, "Side bet").toLowerCase();
    if (/\bno win\b|\blos(e|es|t)\b|\bsurrender/.test(l)) return "lose";
    if (/\bwins?\b|\bwon\b|\bto 1\b|\breturn:|\bwinnings\b|\bprofit\b|\bpays\b/.test(l)) return "win";
    if (/\bpush(es|ed)?\b/.test(l)) return "push";
    // a side bet named with the hand it paid on, like "Pair Plus: Flush"
    if (/^[a-z0-9 '&]+: \S/.test(l) && !/: (no|not)\b/.test(l)) return "win";
    return "plain";
}

const TONE_CLASS: Record<ResultTone, string> = {
    win: "text-emerald-300",
    push: "text-amber-100",
    lose: "text-red-300",
    plain: "text-white/90",
};

/** The text color class for a result line. */
export function resultLineClass(line: string): string {
    return TONE_CLASS[resultTone(line)];
}
