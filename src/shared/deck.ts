import { createContext } from "react";

// Which deck is in play at a table: 1, 2, 3... Two decks take turns, as they do at a real
// table: odd numbers are the gold-backed deck, even numbers the purple one.
// TableShell provides it; cards read it to show the right back.
export const DeckContext = createContext(1);

export function deckBackSrc(deckNo: number): string {
    return deckNo > 0 && deckNo % 2 === 0 ? "/card-back-purple.svg" : "/card-back.svg";
}
