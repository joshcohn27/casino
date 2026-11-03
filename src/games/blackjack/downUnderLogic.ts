// Down Under Blackjack: the rules that differ from regular blackjack. Pure functions only.
//
//   The dealer's hole card is shown as a range before anyone acts:
//     Small (blue)   2 3 4 5
//     Medium (red)   6 7 8 9
//     Large (gold)   10 J Q K A
//   Two gold cards: the dealer's hand is turned face up before the action.
//   A dealer 22 pushes every hand, except a player 20 or 21, which still wins.
//   Split up to four hands; aces split once, and each ace gets one card.
//   Blackjack pays 3 to 2, the dealer stands on all 17s, no surrender, no insurance.

export type HoleRange = "small" | "medium" | "large";

export const RANGES: { id: HoleRange; label: string; ranks: string; color: string }[] = [
    { id: "small", label: "Small", ranks: "2 3 4 5", color: "#2563eb" },
    { id: "medium", label: "Medium", ranks: "6 7 8 9", color: "#dc2626" },
    { id: "large", label: "Large", ranks: "10 J Q K A", color: "#eab308" },
];

/** The range a card falls in, by its blackjack value (an ace is 11, a face card 10). */
export function holeRange(value: number): HoleRange {
    if (value <= 5) return "small";
    if (value <= 9) return "medium";
    return "large";
}

/** Both dealer cards are gold: the hand is shown face up before anyone acts. */
export function bothGold(upValue: number, holeValue: number): boolean {
    return holeRange(upValue) === "large" && holeRange(holeValue) === "large";
}

export type HandResult = "Win" | "Push" | "Lose" | "Bust";

/** How one player hand settles against the dealer's final total. A dealer 22 pushes all but 20 and 21. */
export function settleHand(playerTotal: number, dealerTotal: number): HandResult {
    if (playerTotal > 21) return "Bust";
    if (dealerTotal === 22) return playerTotal >= 20 ? "Win" : "Push";
    if (dealerTotal > 21) return "Win";
    if (playerTotal > dealerTotal) return "Win";
    if (playerTotal < dealerTotal) return "Lose";
    return "Push";
}

/** What a settled hand brings back, the bet included. */
export function handReturn(result: HandResult, wager: number): number {
    return result === "Win" ? wager * 2 : result === "Push" ? wager : 0;
}
