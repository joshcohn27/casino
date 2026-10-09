// The site's version and its change log. This file is the single source of truth.
//
// EVERY change that lands on master adds an entry at the TOP of CHANGELOG and bumps the
// version (keep "version" in package.json the same):
//
//   MAJOR (x.0.0)  changes how the whole site looks or plays
//   MINOR (1.x.0)  adds something: a new game, side bet, page or setting
//   PATCH (1.0.x)  fixes and polish
//
// Entries are written for players, not developers: say what they will notice, in plain words.

export type ChangeKind = "new" | "improved" | "fixed";

export type ChangeEntry = {
    version: string;
    /** yyyy-mm-dd */
    date: string;
    title: string;
    changes: ReadonlyArray<readonly [ChangeKind, string]>;
};

export const CHANGELOG: ChangeEntry[] = [
    {
        version: "3.1.0",
        date: "2026-10-09",
        title: "Version number and What's New",
        changes: [
            ["new", "The site now shows its version at the bottom of the page."],
            ["new", "This What's New page lists what changed in each update."],
        ],
    },
    {
        version: "3.0.0",
        date: "2026-10-09",
        title: "The consistency update",
        changes: [
            ["improved", "Betting works the same way at every table: tap a spot to highlight it, tap a chip to bet it, and tap the chips on the table to take one back. Every table has a Clear button."],
            ["new", "New game: I Luv Suits. Seven cards each, longest flush wins, with Flush Rush and Super Flush Rush side bets."],
            ["new", "New game: DJ Wild. Deuces and the joker are wild, with Trips, Two-Way Bad Beat and a $5 progressive jackpot that keeps growing."],
            ["new", "Settings page: choose the bets each table starts with, switch the DJ Wild progressive on automatically, and pick larger text."],
            ["new", "I Luv Suits and DJ Wild suggest whether to play or fold. In DJ Wild you can play your hand blind."],
            ["improved", "Ultimate Texas Hold'em: the dealer's cards turn over one at a time and each bet pays in turn. The 6 Card Bonus cards sit beside your hand and reveal on their own."],
            ["improved", "Pai Gow Poker: turn over your own cards, and set your hand by sliding cards into the low spot. Hands are laid out the way a dealer stacks them."],
            ["improved", "Pai Gow Poker: your main bet now pushes when the dealer has an Ace-high pai gow. Auto Set Best is now Ask Dealer for Help."],
            ["improved", "Hands are sorted so the cards that make your hand come first, with wild cards placed where they play."],
            ["improved", "Payouts everywhere read the way a table does: 3 to 2, 200 to 1."],
            ["fixed", "Double-clicking a button could deal, charge or pay twice in a few games. It no longer can."],
            ["fixed", "Ultimate Texas Hold'em showed the wrong Net when you had no 6 Card Bonus bet."],
        ],
    },
    {
        version: "2.3.2",
        date: "2026-09-20",
        title: "Mississippi Stud dealing",
        changes: [["improved", "Mississippi Stud turns over the community cards right to left, the way a dealer does."]],
    },
    {
        version: "2.3.1",
        date: "2026-06-09",
        title: "Fixes",
        changes: [
            ["fixed", "Mississippi Stud colors."],
            ["fixed", "Blackjack dealing."],
            ["improved", "Max Bet is greyed out when you cannot use it, instead of disappearing."],
        ],
    },
    {
        version: "2.3.0",
        date: "2026-06-08",
        title: "Mississippi Stud",
        changes: [["new", "New game: Mississippi Stud, with the 3 Card Bonus side bet."]],
    },
    {
        version: "2.2.0",
        date: "2026-06-07",
        title: "Three Card Poker and more Video Poker",
        changes: [
            ["new", "New game: Three Card Poker, with Pair Plus and 6 Card Bonus."],
            ["new", "Video Poker adds Bonus Poker and Deuces Wild."],
        ],
    },
    {
        version: "2.1.0",
        date: "2026-05-28",
        title: "Built for phones",
        changes: [["improved", "Every table has a layout made for phone screens, including Roulette and the betting bar."]],
    },
    {
        version: "2.0.1",
        date: "2026-05-27",
        title: "Polish",
        changes: [
            ["fixed", "$2.50 chips and cents are handled correctly at every table."],
            ["new", "Baccarat has a rules button."],
            ["improved", "Touch-ups to Ultimate Texas Hold'em, Free Bet Blackjack, Double Down Madness, Pai Gow Poker and Roulette."],
        ],
    },
    {
        version: "2.0.0",
        date: "2026-05-26",
        title: "A new look",
        changes: [
            ["improved", "Every table was rebuilt on the same felt, chips and cards, so the games look and feel like one casino."],
            ["improved", "Ultimate Texas Hold'em, Blackjack, Baccarat and Free Bet Blackjack were redesigned, with new card and chip animations."],
            ["improved", "A new home page with a card for every game."],
        ],
    },
    {
        version: "1.5.1",
        date: "2026-04-11",
        title: "Blackjack and Hold'em touch-ups",
        changes: [
            ["improved", "A cleaner Blackjack table."],
            ["improved", "Smoother card turning in Ultimate Texas Hold'em."],
        ],
    },
    {
        version: "1.5.0",
        date: "2026-04-01",
        title: "Double Down Madness",
        changes: [
            ["new", "New game: Double Down Madness."],
            ["improved", "A menu for moving between games on a phone."],
        ],
    },
    {
        version: "1.4.0",
        date: "2026-03-31",
        title: "Pai Gow Poker",
        changes: [["new", "New game: Pai Gow Poker, with Fortune and Ace High side bets."]],
    },
    {
        version: "1.3.0",
        date: "2026-03-27",
        title: "Feedback",
        changes: [["new", "A feedback form, so you can report a problem or suggest a game."]],
    },
    {
        version: "1.2.1",
        date: "2026-03-26",
        title: "Fixes",
        changes: [
            ["fixed", "In Ultimate Texas Hold'em the Blind always matches the Ante."],
            ["improved", "A new site icon."],
        ],
    },
    {
        version: "1.2.0",
        date: "2026-03-20",
        title: "Video Poker",
        changes: [["new", "New game: Video Poker, Jacks or Better."]],
    },
    {
        version: "1.1.0",
        date: "2026-03-20",
        title: "Baccarat",
        changes: [["new", "New game: Baccarat, with Dragon 7 and Panda 8."]],
    },
    {
        version: "1.0.0",
        date: "2026-03-20",
        title: "Opening day",
        changes: [
            ["new", "Cohn Casino opens with Ultimate Texas Hold'em, Blackjack, Free Bet Blackjack and Roulette."],
            ["new", "One bankroll that follows you from table to table."],
        ],
    },
];

/** The current version: always the newest entry. */
export const VERSION = CHANGELOG[0].version;

/** "2026-10-09" -> "October 9, 2026" */
export function formatChangeDate(date: string): string {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}
