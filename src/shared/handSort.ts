// Display order for a poker hand: the cards that make the hand first, then the rest.
//
//   A K Q 5 5        ->  5 5 A K Q        (the pair leads, kickers by rank)
//   five to a flush  ->  the flush in rank order, then the other cards by rank
//   a straight       ->  the run from the top down, then the other cards
//
// Used wherever a game re-sorts cards after they are turned over.

export type SortCard = {
    id: string;
    /** 2-14, ace high */
    value: number;
    suit: string;
    /**
     * "full": stands in for any card (DJ Wild deuces and joker).
     * "semi": completes a straight or flush, otherwise plays as an ace (Pai Gow joker).
     */
    wild?: "full" | "semi";
};

export type SortMode = "auto" | "groups" | "flush" | "straight";

const byValueDesc = (a: SortCard, b: SortCard) => b.value - a.value;

// Sets first, biggest set first, then by rank. Full wilds sit with the leading set.
function groupOrder(cards: SortCard[]): SortCard[] {
    const fullWilds = cards.filter((c) => c.wild === "full");
    // a semi-wild card that is not completing a straight or flush is an ace
    const rest = cards.filter((c) => c.wild !== "full").map((c) => ({ card: c, value: c.wild === "semi" ? 14 : c.value }));
    const counts = new Map<number, number>();
    for (const r of rest) counts.set(r.value, (counts.get(r.value) ?? 0) + 1);
    rest.sort((a, b) => {
        const ca = counts.get(a.value) ?? 0, cb = counts.get(b.value) ?? 0;
        if (ca !== cb) return cb - ca;
        if (a.value !== b.value) return b.value - a.value;
        // an actual ace before the card standing in for one
        return (a.card.wild ? 1 : 0) - (b.card.wild ? 1 : 0);
    });
    if (fullWilds.length === 0 || rest.length === 0) return [...fullWilds, ...rest.map((r) => r.card)];
    const lead = rest[0].value;
    const leadCards = rest.filter((r) => r.value === lead).map((r) => r.card);
    const others = rest.filter((r) => r.value !== lead).map((r) => r.card);
    return [...leadCards, ...fullWilds, ...others];
}

// The suit holding a five-card flush (wild cards count toward it), or null
function flushCards(cards: SortCard[]): SortCard[] | null {
    const wilds = cards.filter((c) => c.wild);
    const suits = new Map<string, SortCard[]>();
    for (const c of cards) if (!c.wild) suits.set(c.suit, [...(suits.get(c.suit) ?? []), c]);
    let best: SortCard[] | null = null;
    for (const suited of suits.values()) {
        if (suited.length + wilds.length < 5) continue;
        suited.sort(byValueDesc);
        if (!best || suited.length > best.length || (suited.length === best.length && suited[0].value > best[0].value)) best = suited;
    }
    return best ? [...best, ...wilds] : null;
}

// The highest five-card straight (wild cards fill gaps), top card first, or null
function straightCards(cards: SortCard[]): SortCard[] | null {
    const wilds = cards.filter((c) => c.wild);
    const naturals = cards.filter((c) => !c.wild);
    for (let top = 14; top >= 5; top--) {
        const run: SortCard[] = [];
        for (let v = top; v > top - 5; v--) {
            // the ace plays low in 5-4-3-2-A
            const want = v === 1 ? 14 : v;
            const hit = naturals.find((c) => c.value === want && !run.includes(c));
            if (hit) run.push(hit);
        }
        const missing = 5 - run.length;
        if (missing <= wilds.length) return [...run, ...wilds.slice(0, missing)];
    }
    return null;
}

/** Card ids in display order, strongest part of the hand first. */
export function sortByPower(cards: SortCard[], mode: SortMode = "auto"): string[] {
    const ids = (list: SortCard[]) => list.map((c) => c.id);
    if (cards.length === 0) return [];
    const withRest = (lead: SortCard[]) => ids([...lead, ...groupOrder(cards.filter((c) => !lead.includes(c)))]);

    if (mode === "groups") return ids(groupOrder(cards));
    if (mode === "flush") { const f = flushCards(cards); return f ? withRest(f) : ids(groupOrder(cards)); }
    if (mode === "straight") { const s = straightCards(cards); return s ? withRest(s) : ids(groupOrder(cards)); }

    // auto: four of a kind and full houses outrank flushes and straights
    const fullWilds = cards.filter((c) => c.wild === "full").length;
    const counts = new Map<number, number>();
    for (const c of cards) if (c.wild !== "full") { const v = c.wild === "semi" ? 14 : c.value; counts.set(v, (counts.get(v) ?? 0) + 1); }
    const sizes = [...counts.values()].sort((a, b) => b - a);
    const top = (sizes[0] ?? 0) + fullWilds, second = sizes[1] ?? 0;
    if (top >= 4 || (top >= 3 && second >= 2)) return ids(groupOrder(cards));
    if (cards.length >= 5) {
        const f = flushCards(cards);
        if (f) return withRest(f);
        const s = straightCards(cards);
        if (s) return withRest(s);
    }
    return ids(groupOrder(cards));
}
