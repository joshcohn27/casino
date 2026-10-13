// Casino War rules and payouts, as published by Wizard of Odds
// (wizardofodds.com/games/casino-war/). Pure functions: no React, no state.
//
//   Six decks. One card each. Aces are high and suits do not matter.
//   Higher card wins even money. Lower card loses.
//   Tie: surrender and lose half the bet, or go to war by raising an amount equal to the bet.
//   War: three cards are burned, then one more card each. If the player's card ties or beats
//        the dealer's, the raise wins even money and the original bet pushes. Otherwise both lose.
//   Tie during the war: a bonus equal to the original bet (the rule Wizard of Odds lists for
//        the Mirage). House edge 2.33% with it, 2.88% without.
//   Tie side bet: pays 10 to 1 when the first two cards tie.

import type { Card } from "../../shared/lib/cards";

export const DECKS = 6;
export const MIN_BET = 5;
/** The Tie side bet pays this to 1. */
export const TIE_PAYS = 10;
/** Cards burned before the war cards are dealt. */
export const BURN_CARDS = 3;
/** Pay a bonus equal to the original bet when the war itself ends in a tie. */
export const TIE_AFTER_TIE_BONUS = true;

const RANK_ORDER = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
export const rankValue = (card: Pick<Card, "rank">) => RANK_ORDER.indexOf(card.rank);

const RANK_NAMES: Record<string, string> = { T: "10", J: "Jack", Q: "Queen", K: "King", A: "Ace" };
export const rankName = (card: Pick<Card, "rank">) => RANK_NAMES[card.rank] ?? card.rank;

export type FirstResult = "win" | "lose" | "tie";

/** The first two cards: the player's against the dealer's. */
export function compareFirst(player: Pick<Card, "rank">, dealer: Pick<Card, "rank">): FirstResult {
    const p = rankValue(player), d = rankValue(dealer);
    return p > d ? "win" : p < d ? "lose" : "tie";
}

/** What comes back on the main bet when there is no tie: the bet and its winnings, or nothing. */
export function mainReturn(bet: number, first: Exclude<FirstResult, "tie">): number {
    return first === "win" ? bet * 2 : 0;
}

/** What comes back on the Tie side bet, settled on the first two cards. */
export function tieBetReturn(tieBet: number, first: FirstResult): number {
    return tieBet > 0 && first === "tie" ? tieBet + tieBet * TIE_PAYS : 0;
}

/** Surrender on a tie: half the bet comes back. */
export function surrenderReturn(bet: number): number {
    return bet / 2;
}

export type WarResult = "win" | "tie" | "lose";

/** The war cards. The player wins the war on a higher card, and on a tie. */
export function compareWar(player: Pick<Card, "rank">, dealer: Pick<Card, "rank">): WarResult {
    const p = rankValue(player), d = rankValue(dealer);
    return p > d ? "win" : p < d ? "lose" : "tie";
}

/**
 * What comes back after a war, out of the original bet and the raise.
 * Won: the bet pushes and the raise wins even money. Tied: the same, plus the bonus.
 */
export function warReturn(bet: number, raise: number, war: WarResult): number {
    if (war === "lose") return 0;
    const bonus = war === "tie" && TIE_AFTER_TIE_BONUS ? bet : 0;
    return bet + raise * 2 + bonus;
}
