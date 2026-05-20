export type Suit = '♠' | '♥' | '♦' | '♣' | 'JOKER';
export type Rank =
    | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
    | 'T' | 'J' | 'Q' | 'K' | 'A'
    | 'JOKER';

export interface Card {
    suit: Suit;
    rank: Rank;
    faceUp: boolean;
    id: string;
    sideways?: boolean;
    baccaratValue?: number;
}

const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

function bjValue(rank: Rank): number {
    if (rank === 'A') return 11;
    if (rank === 'T' || rank === 'J' || rank === 'Q' || rank === 'K') return 10;
    if (rank === 'JOKER') return 0;
    return parseInt(rank, 10);
}

function baccaratVal(rank: Rank): number {
    if (rank === 'A') return 1;
    if (rank === 'T' || rank === 'J' || rank === 'Q' || rank === 'K') return 0;
    if (rank === 'JOKER') return 0;
    return parseInt(rank, 10);
}

export function shuffle<T>(items: T[]): T[] {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

export function createShoe(decks: number): Card[] {
    const cards: Card[] = [];
    for (let d = 0; d < decks; d++) {
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                cards.push({
                    suit,
                    rank,
                    faceUp: false,
                    id: `${d}-${rank}${suit}-${Math.random().toString(36).slice(2, 9)}`,
                    baccaratValue: baccaratVal(rank),
                });
            }
        }
    }
    return shuffle(cards);
}

export function handTotal(cards: Card[]): { total: number; soft: boolean } {
    let total = 0;
    let aces = 0;

    for (const card of cards) {
        total += bjValue(card.rank);
        if (card.rank === 'A') aces++;
    }

    while (total > 21 && aces > 0) {
        total -= 10;
        aces--;
    }

    return { total, soft: aces > 0 && total !== 21 };
}

export function isSoft(cards: Card[]): boolean {
    return handTotal(cards).soft;
}
