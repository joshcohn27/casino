// Every game on the site, in one list. The routes, the nav dropdowns, the phone menu and the
// Home page cards are all built from it, so adding a game is one entry here.
import { lazy, type ComponentType, type Dispatch, type LazyExoticComponent, type SetStateAction } from "react";

export type GameProps = { bankroll: number; setBankroll: Dispatch<SetStateAction<number>> };

/** Where a game sits in the nav: inside a dropdown, or as a link of its own. */
export type GameGroup = "blackjack" | "poker" | "table";

export type GameEntry = {
    id: string;
    /** The URL. Blackjack games live under /blackjack, poker games under /poker. */
    path: string;
    /** Name on the Home card. */
    title: string;
    /** Name in the nav, when it differs from the title. */
    navLabel?: string;
    group: GameGroup;
    /** Small line under the name on the Home card. */
    cardLabel?: string;
    /** Description on the Home card. */
    subtitle: string;
    /** Position on the Home page. */
    homeOrder: number;
    /** Loaded the first time the table is opened. */
    component: LazyExoticComponent<ComponentType<GameProps>>;
};

export const NAV_GROUPS: ReadonlyArray<{ id: Exclude<GameGroup, "table">; label: string; menuLabel: string; base: string }> = [
    { id: "blackjack", label: "Blackjack", menuLabel: "Blackjack", base: "/blackjack" },
    { id: "poker", label: "Poker Games", menuLabel: "Poker", base: "/poker" },
];

// Listed in nav order.
export const GAMES: ReadonlyArray<GameEntry> = [
    {
        id: "blackjack",
        path: "/blackjack",
        title: "Blackjack",
        navLabel: "Classic Blackjack",
        group: "blackjack",
        subtitle: "6-deck shoe · Blackjack pays 3 to 2 · Dealer stands on all 17s · Split up to 4 hands · Double after split · Reshuffles at 85% penetration",
        homeOrder: 1,
        component: lazy(() => import("./Blackjack")),
    },
    {
        id: "freebetblackjack",
        path: "/blackjack/free-bet",
        title: "Free Bet Blackjack",
        group: "blackjack",
        subtitle: "Free doubles on hard 9, 10, and 11 · Free splits on pairs through 9s and aces · Dealer 22 pushes all live hands · Push 22 side bet pays 11 to 1 · Pot of Gold side bet pays by free-bet token count",
        homeOrder: 2,
        component: lazy(() => import("./FreeBetBlackjack")),
    },
    {
        id: "doubledownmadness",
        path: "/blackjack/double-down-madness",
        title: "Double Down Madness",
        group: "blackjack",
        subtitle: "One-card blackjack with aggressive re-doubling · Push 22 side bet · Configurable blackjack pay · Insurance available",
        homeOrder: 3,
        component: lazy(() => import("./DoubleDownMadness")),
    },
    {
        id: "uth",
        path: "/poker/ultimate-texas-holdem",
        title: "Ultimate Texas Hold'em",
        group: "poker",
        subtitle: "Bet 4x or 3x preflop · 2x on the flop · 1x or fold on the river · Dealer qualifies with pair or better · Blind pays on straight or better · Trips and 6 Card Bonus side bets available",
        homeOrder: 4,
        component: lazy(() => import("./UltimateTexasHoldem")),
    },
    {
        id: "paigow",
        path: "/poker/pai-gow",
        title: "Pai Gow Poker",
        group: "poker",
        subtitle: "7 cards set into a 5-card back hand and 2-card front hand · Joker plays as semi-wild · Fortune and Ace High side bets · Dealer qualifies with Ace-high low hand",
        homeOrder: 5,
        component: lazy(() => import("./PaiGow")),
    },
    {
        id: "threecardpoker",
        path: "/poker/three-card-poker",
        title: "Three Card Poker",
        group: "poker",
        subtitle: "3-card hands · Trips beats straights · Dealer qualifies with Queen-high · Pair Plus side bet pays up to 40 to 1 · 6 Card Bonus uses best 5 of all 6 cards",
        homeOrder: 6,
        component: lazy(() => import("./ThreeCardPoker")),
    },
    {
        id: "mississippistud",
        path: "/poker/mississippi-stud",
        title: "Mississippi Stud",
        group: "poker",
        subtitle: "No dealer hand · Pair of 6s or better pays · Bet 1× or 3× at each of 3 streets · 3 Card Bonus side bet",
        homeOrder: 7,
        component: lazy(() => import("./MississippiStud")),
    },
    {
        id: "iluvsuits",
        path: "/poker/i-luv-suits",
        title: "I Luv Suits",
        group: "poker",
        subtitle: "7 cards · Longest flush wins · Play up to 3x with a 6-card flush · Dealer qualifies with a 3-card flush, 9 high · Flush Rush and Super Flush Rush side bets",
        homeOrder: 8,
        component: lazy(() => import("./ILuvSuits")),
    },
    {
        id: "djwild",
        path: "/poker/dj-wild",
        title: "DJ Wild",
        group: "poker",
        subtitle: "Deuces and the Joker are wild · Play 2x or fold · Dealer always qualifies · Blind pays up to 1,000 to 1 · Trips pays more on natural hands",
        homeOrder: 9,
        component: lazy(() => import("./DJWild")),
    },
    {
        id: "videopoker",
        path: "/poker/video-poker",
        title: "Video Poker",
        group: "poker",
        cardLabel: "Video Poker",
        subtitle: "Jacks or Better · Bonus Poker · Deuces Wild · Choose your game and variant from the bar-top machine",
        homeOrder: 12,
        component: lazy(() => import("./VideoPoker")),
    },
    {
        id: "roulette",
        path: "/roulette",
        title: "Roulette",
        group: "table",
        subtitle: "American wheel with 38 pockets · Straight up pays 35 to 1 · Proximity-based bet inference for splits, streets, and corners · Full outside bet support · Recent results tracker",
        homeOrder: 11,
        component: lazy(() => import("./Roulette")),
    },
    {
        id: "baccarat",
        path: "/baccarat",
        title: "Baccarat",
        group: "table",
        subtitle: "EZ Baccarat — banker pushes on any 3-card 7 · Player pays 1 to 1 · Tie pays 8 to 1 · Dragon 7 side bet pays 40 to 1 · Panda 8 side bet pays 25 to 1 · 8-deck shoe",
        homeOrder: 10,
        component: lazy(() => import("./Baccarat")),
    },
];

/** The cards on the Home page, in the order they are shown. */
export const HOME_GAMES: ReadonlyArray<GameEntry> = [...GAMES].sort((a, b) => a.homeOrder - b.homeOrder);

/** The game at this URL, if there is one. */
export function gameAtPath(pathname: string): GameEntry | undefined {
    return GAMES.find((g) => g.path === pathname);
}
