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
        version: "4.16.2",
        date: "2026-10-30",
        title: "Envy Bonus stays up",
        changes: [
            ["improved", "Pai Gow Envy Bonus: the notice now stays on screen until you click its X or move on to the next hand, so you can get a good look at the cards."],
        ],
    },
    {
        version: "4.16.1",
        date: "2026-10-26",
        title: "Pai Gow jackpot runs on the real clock",
        changes: [
            ["improved", "Pai Gow table jackpot: the other linked tables now play like a real pit. Two to four tables, a hand about every 90 seconds, 1 to 6 players, and only some of them take the jackpot bet."],
            ["improved", "The meters keep climbing while you are away and catch up when you come back. On its own, the Must Hit by $500 pays somewhere within about 3 days."],
            ["improved", "Your own jackpot bets count for much more now: playing makes the Must Hit come sooner, and you win a big share of the hits while you are at the table."],
        ],
    },
    {
        version: "4.16.0",
        date: "2026-10-26",
        title: "Reset your bets to your saved defaults",
        changes: [
            ["new", "Every table has a Reset button next to Clear while you place bets. It puts each bet back to the default you saved in Settings, including the jackpot, Blazing 7s and progressive switches. Shortcut: E."],
        ],
    },
    {
        version: "4.15.1",
        date: "2026-10-26",
        title: "Fortune pays the best line",
        changes: [
            ["fixed", "Pai Gow Fortune: when your cards make both a straight and three of a kind, you are now paid for three of a kind (3 to 1), the better line on the pay table, instead of the straight (2 to 1)."],
        ],
    },
    {
        version: "4.15.0",
        date: "2026-10-26",
        title: "Pai Gow by deal number",
        changes: [
            ["new", "Your Stats: a Pai Gow table showing how often you win, push and lose for each deal number from 1 to 7."],
        ],
    },
    {
        version: "4.14.1",
        date: "2026-10-25",
        title: "Pai Gow side bets swapped",
        changes: [
            ["improved", "Pai Gow: the Ace High bet is now on the left and Fortune on the right."],
        ],
    },
    {
        version: "4.14.0",
        date: "2026-10-25",
        title: "Fortune Envy Bonus",
        changes: [
            ["new", "Pai Gow: the Fortune Envy Bonus. With a Fortune bet of $5 or more, you win when another seat at the table makes four of a kind or better: $5 for four of a kind, up to $5,000 for a natural 7-card straight flush."],
            ["new", "Each seat that hits pays you, and a notice shows who hit, what they made and their cards. The amounts are in a new Envy column on the Fortune pay table."],
        ],
    },
    {
        version: "4.13.4",
        date: "2026-10-25",
        title: "Royal Match fixed",
        changes: [
            ["fixed", "Pai Gow Fortune: Royal Flush + Royal Match now needs a King and Queen of the same suit beside the royal flush, as at a real table. Before, any pair counted."],
        ],
    },
    {
        version: "4.13.3",
        date: "2026-10-25",
        title: "Ace high marker",
        changes: [
            ["new", "Pai Gow: when the dealer has ace-high pai gow, a white Ace High chip appears beside the dealer's hand before you turn your cards, so you can sweat your own ace high."],
        ],
    },
    {
        version: "4.13.2",
        date: "2026-10-25",
        title: "Nothing moves on phones and tablets",
        changes: [
            ["fixed", "On phones and tablets, the bets no longer slide down when cards are dealt in Ultimate Texas Hold'em, Pai Gow, I Luv Suits and DJ Wild."],
            ["fixed", "On phones, the buttons at the bottom fit on one row, so the bar keeps one height in Pai Gow and Mississippi Stud."],
        ],
    },
    {
        version: "4.13.1",
        date: "2026-10-25",
        title: "Blackjack tables hold still",
        changes: [
            ["fixed", "Blackjack, Free Bet and Side Bet Blackjack: the table no longer grows when the cards are dealt. Each hand's bet now sits in its label or beside its total."],
            ["fixed", "Free Bet and Side Bet Blackjack: the chips stay in the bottom bar during the dealer's turn, so the bar keeps one height."],
        ],
    },
    {
        version: "4.13.0",
        date: "2026-10-25",
        title: "Pick your Pai Gow seat",
        changes: [
            ["new", "Pai Gow: choose your seat (1, 2, 3, 5, 6 or 7; there is no seat 4), and change it any time."],
            ["new", "Pai Gow deals like a real table: the deck is set out in seven stacks of seven, and a random deal number from 1 to 7, shown each hand, picks the dealer's stack. Your seat decides which stack is yours. The i button explains it."],
            ["new", "Your Stats shows how each Pai Gow seat has done."],
        ],
    },
    {
        version: "4.12.0",
        date: "2026-10-25",
        title: "Your Stats",
        changes: [
            ["new", "A Stats page with your play year by year: hands, total bet, net, hands won, average bet, time played and your longest streaks."],
            ["new", "Every bet on its own, side bets included: how often you made it, how often it won, what it returned, its biggest win and what it hit."],
            ["new", "Net by month as a chart, every game side by side, your biggest win and loss, best and worst day, and your Card Ladder and bankroll history."],
            ["new", "Stats are kept in this browser for five years. Find them in the footer, in the phone menu, and in the top bar on wide screens."],
        ],
    },
    {
        version: "4.11.0",
        date: "2026-10-19",
        title: "A new Roulette table",
        changes: [
            ["new", "Roulette: a real-looking wheel. The white ball rides the track the other way, drops, and settles in the winning pocket, which lights up."],
            ["improved", "Roulette: the layout looks like a real table, with black and red numbers, printed outside bets, and chips in the same colours as every other table."],
            ["improved", "Roulette: on a phone the layout stands upright and fits the screen, with no sideways scrolling."],
            ["improved", "Roulette: Bet, Returned and Net, and Clear, Change Bet and Rebet & Spin, like the other tables. Your chips stay on the layout after a spin."],
            ["fixed", "Roulette: a quick click on the layout always places the bet."],
        ],
    },
    {
        version: "4.10.1",
        date: "2026-10-19",
        title: "Banker rule lights on time",
        changes: [
            ["fixed", "Baccarat: when both sides draw, the Banker's third card rule now lights up as soon as the cards are dealt, instead of waiting for the Player's third card to be turned."],
        ],
    },
    {
        version: "4.10.0",
        date: "2026-10-19",
        title: "Hide the Baccarat rules",
        changes: [
            ["new", "Baccarat: a Hide rules button tucks away the third card rules, and the Big Road moves over to the left in their place. Show rules brings them back. The table remembers your choice."],
        ],
    },
    {
        version: "4.9.0",
        date: "2026-10-19",
        title: "Baccarat squeeze",
        changes: [
            ["new", "Baccarat: Squeeze mode. The cards come out face down, and your side comes up big in front of you while the bets fade back. Peel by hand: drag in from a long edge to count the side pips, from a short end to see the middle, or lift a corner, before turning it over."],
            ["new", "In Squeeze, the dealer turns the other side whenever you say: click a card, or Flip Dealer Cards. When both sides draw, both third cards come out together and you choose which to see first."],
            ["new", "Switch between Quick and Squeeze above the table, or pick your default on the Settings page."],
            ["improved", "Baccarat has a new table: curved Tie, Banker and Player rows like a real EZ Baccarat layout, printed card boxes, and the third card dealt sideways."],
            ["new", "Baccarat: the Big Road is back in the bottom right corner, showing every result in the shoe. It starts over when the shoe is shuffled."],
        ],
    },
    {
        version: "4.8.11",
        date: "2026-10-18",
        title: "Card Ladder suit order",
        changes: [
            ["improved", "Card Ladder: the suit buttons now go Spades, Hearts, Clubs, Diamonds, so the colors alternate."],
        ],
    },
    {
        version: "4.8.10",
        date: "2026-10-18",
        title: "Pai Gow set check",
        changes: [
            ["improved", "Pai Gow: if you set your hand a way that does worse against the dealer than it could, you are asked to make sure first, and shown the better Low hand."],
            ["improved", "The fold check popup now matches the rest of the site."],
        ],
    },
    {
        version: "4.8.9",
        date: "2026-10-18",
        title: "Straight name fix",
        changes: [
            ["fixed", "Pai Gow: an ace-high straight was named \"100-High Straight\". It now reads \"Ace-High Straight\"."],
        ],
    },
    {
        version: "4.8.8",
        date: "2026-10-18",
        title: "Pai Gow fold rules",
        changes: [
            ["improved", "Pai Gow: the rules now explain folding. You lose the main bet; Fortune, Ace High and the table jackpot still pay."],
        ],
    },
    {
        version: "4.8.7",
        date: "2026-10-18",
        title: "Pai Gow fold check",
        changes: [
            ["improved", "Pai Gow: if you try to fold a hand that can still win or push, you are asked to make sure first."],
        ],
    },
    {
        version: "4.8.6",
        date: "2026-10-18",
        title: "Folding in Pai Gow",
        changes: [
            ["improved", "Pai Gow: when you fold, your cards turn face down one by one and slide into a pile."],
        ],
    },
    {
        version: "4.8.5",
        date: "2026-10-18",
        title: "Pai Gow title centered",
        changes: [
            ["fixed", "Pai Gow: the title is centered on the table again."],
            ["fixed", "Pai Gow with Large text: the top jackpot line fits on one row, and on phones and tablets nothing moves when the cards are dealt."],
        ],
    },
    {
        version: "4.8.4",
        date: "2026-10-18",
        title: "Pay tables never covered",
        changes: [
            ["fixed", "Pai Gow: the jackpot table now sits at the top of the pay tables beside the title, so it can never cover the Fortune Bonus table, whatever your text size."],
        ],
    },
    {
        version: "4.8.3",
        date: "2026-10-18",
        title: "Fortune Bonus title is back",
        changes: [
            ["fixed", "Pai Gow: the Fortune Bonus pay table title was hidden under the jackpot table. When another player wins a jackpot, the news now shows in the jackpot table's heading."],
        ],
    },
    {
        version: "4.8.2",
        date: "2026-10-18",
        title: "Pai Gow fits the screen again",
        changes: [
            ["improved", "Pai Gow: the jackpot table moved up into the top right corner and got more compact, so the table fits the window without scrolling."],
        ],
    },
    {
        version: "4.8.1",
        date: "2026-10-18",
        title: "Pai Gow jackpot layout",
        changes: [
            ["improved", "Pai Gow: the red $5 jackpot light now sits on the felt between Fortune and Ace High, as at a real table."],
            ["improved", "Pai Gow: the jackpot meters and what it pays have their own table on the right, boxed in red."],
        ],
    },
    {
        version: "4.8.0",
        date: "2026-10-17",
        title: "Table jackpot",
        changes: [
            ["new", "Pai Gow: a $5 table jackpot. Light it to play. Full house pays $25, four of a kind $375, straight flush $500 and a royal flush $2,000."],
            ["new", "Five aces or a 7-card straight flush wins the Ultra or the Major jackpot, picked at random."],
            ["new", "A third jackpot must hit by $500. Every jackpot bet moves it closer, and the bet that pushes it over wins it."],
            ["new", "Players at other tables add to the jackpots while you play, and now and then one of them wins."],
            ["fixed", "Pressing Space at a table no longer scrolls the page."],
        ],
    },
    {
        version: "4.7.0",
        date: "2026-10-17",
        title: "Fold in Pai Gow",
        changes: [
            ["new", "Pai Gow: a Fold button. Folding gives up your main bet and ends the hand. Side bets still pay on your cards."],
            ["new", "Pai Gow: when no way of setting your cards can beat the dealer, the table suggests folding. You can still set the hand if you like."],
        ],
    },
    {
        version: "4.6.5",
        date: "2026-10-17",
        title: "Pai Gow message",
        changes: [
            ["fixed", "Pai Gow: after Ask Dealer for Help, moving a card clears the message saying the dealer set your hand, since the hand is now yours."],
        ],
    },
    {
        version: "4.6.4",
        date: "2026-10-17",
        title: "Clearer results",
        changes: [
            ["improved", "Result lines under a hand are colored by what happened to that bet: a push is yellow, a win green, a loss red. A pushed main bet no longer shows red because a side bet lost."],
        ],
    },
    {
        version: "4.6.3",
        date: "2026-10-17",
        title: "Pai Gow advice",
        changes: [
            ["improved", "Pai Gow: setting your hand the house way is now marked as the best play whenever it wins as much as any other way."],
            ["improved", "Pai Gow: when another way wins more against the face-up dealer, the advice says so and shows that Low hand. Otherwise it shows the house way."],
            ["improved", "Pai Gow: Ask Dealer for Help sets the house way, unless another way wins more against this dealer."],
        ],
    },
    {
        version: "4.6.2",
        date: "2026-10-13",
        title: "Chip stacks and big bets",
        changes: [
            ["fixed", "Bet, Returned and Net no longer run into each other when the amounts get large. The figures shrink to fit."],
            ["improved", "Chip stacks always sit with the biggest chip on the bottom, whatever order you add them in. Tapping a stack takes off the top chip."],
        ],
    },
    {
        version: "4.6.1",
        date: "2026-10-12",
        title: "Tables hold still on every screen",
        changes: [
            ["fixed", "The bar at the bottom of each table keeps one height through a hand. It no longer grows or shrinks as buttons appear and disappear."],
            ["fixed", "Phones and tablets: the cards and the bets no longer swap places when a hand is dealt at Hold'em, Pai Gow, I Luv Suits and DJ Wild."],
            ["fixed", "Phones: the chips stay in the bottom bar during a hand, so the page no longer slides when you deal."],
            ["fixed", "Desktop: the felt now reaches the bottom of the window, so the bottom bar no longer drops when a hand is dealt."],
        ],
    },
    {
        version: "4.6.0",
        date: "2026-10-12",
        title: "Casino War",
        changes: [
            ["new", "New game: Casino War, under Poker Games. One card each and the high card wins."],
            ["new", "On a tie, go to war by matching your bet, or surrender and take half back. A tie during the war pays a bonus equal to your bet."],
            ["new", "Tie side bet: pays 10 to 1 when the first two cards tie."],
        ],
    },
    {
        version: "4.5.0",
        date: "2026-10-12",
        title: "Card Ladder",
        changes: [
            ["new", "Card Ladder: a free game for winning chips. Call red or black, higher or lower, inside or outside, then the suit. Get all four right and win $1,000."],
            ["new", "Out of chips? A notice now points you to Card Ladder, and it has its own Free Chips link in the menu."],
            ["improved", "Pai Gow: with two small pairs (6s or lower) the dealer now plays the higher pair in the High hand and the lower pair in the Low hand, unless an Ace or King can go in the Low hand."],
        ],
    },
    {
        version: "4.4.2",
        date: "2026-10-12",
        title: "Fits more screens",
        changes: [
            ["fixed", "Tablets and small laptops: tables no longer run off the side of the screen, and button labels stay on one line."],
            ["fixed", "Video Poker on a phone: the five cards sit in one row, the pay table lines up, and the credit read-out is no longer cut off."],
            ["fixed", "Double Down Madness and Video Poker: the session read-out no longer sits on top of the pay table or the game tabs."],
            ["improved", "Short screens: tables are drawn a little smaller so more of the felt fits without scrolling."],
            ["improved", "Video Poker no longer scrolls on a large screen."],
        ],
    },
    {
        version: "4.4.1",
        date: "2026-10-11",
        title: "DJ Wild pay tables",
        changes: [
            ["fixed", "DJ Wild: the pay tables no longer scroll sideways. Long hand names wrap inside their column."],
        ],
    },
    {
        version: "4.4.0",
        date: "2026-10-10",
        title: "Keyboard shortcuts",
        changes: [
            ["new", "Play from the keyboard. Every table button shows its key, like Hit (H) and Stand (G). Space deals the next hand."],
            ["new", "Blackjack tables: H hits, G stands, B doubles, P splits. Poker tables: K checks, 1 to 4 bet, C plays (calls), F folds. Q clears your bets."],
            ["new", "Pai Gow: once your cards are sorted, 1 to 7 move that card to the Low hand or back. The arrow keys and Space do the same, and Enter sets the hand."],
            ["new", "Where you turn your own cards over (Pai Gow, I Luv Suits, DJ Wild), a number key turns over that card: 5 for the fifth. R turns them all."],
            ["new", "Video Poker: 1 to 5 hold a card, and Space deals or draws."],
            ["new", "Esc closes a rules popup. You can turn shortcuts off under Settings, Display."],
            ["new", "Baccarat: the pay table is now on the felt, with the third card rules beside it. The rule that applies to the hand lights up."],
            ["new", "Three Card Poker: you can play Pair Plus on its own, with no Ante. Your cards are turned over and the side bets are paid."],
            ["fixed", "Three Card Poker: Pair Plus is now paid even if you fold the main hand, as in a casino."],
            ["improved", "Tables hold still. Results, suggestions and chips no longer push the cards, bet spots or pay tables around when they appear."],
            ["improved", "Blackjack tables: Stand now sits to the left of Hit, matching G and H on the keyboard."],
            ["improved", "Three Card Poker: the Play spot is always on the felt, and results show beside the cards."],
            ["fixed", "Three Card Poker and Mississippi Stud no longer show the same result line twice."],
        ],
    },
    {
        version: "4.3.0",
        date: "2026-10-10",
        title: "Session stats",
        changes: [
            ["new", "Every table now shows your session in the top left: hands played, your average bet, and how much you are up or down."],
            ["new", "A session lasts for as long as you stay at one game. It starts over when you play a hand at a different game, or when you close the site and come back."],
        ],
    },
    {
        version: "4.2.0",
        date: "2026-10-10",
        title: "Side Bet Blackjack",
        changes: [
            ["new", "New game: Side Bet Blackjack. Classic blackjack with six side bets you can mix and match."],
            ["new", "Blazing 7s: a $5 progressive that pays on 7s in your two cards and the dealer's up card. Three 7s of diamonds win the whole jackpot."],
            ["new", "TriLux, King's Bounty, Lucky Ladies, Match the Dealer and Fortune side bets, each with its pay table on the felt."],
            ["new", "Holding two 7s on a Blazing 7s bet? The dealer's card stays face down until you choose to turn it over."],
            ["new", "The Blazing 7s jackpot grows as other players bet, and now and then one of them wins it."],
            ["improved", "Double Down Madness: the Double Ladder lights up the step your hand is on."],
            ["fixed", "Double Down Madness: the rules and the pay table now show the Push 22 payout correctly as 11 to 1."],
            ["fixed", "Three Card Poker: when you and the dealer both have a pair, the higher pair now wins. A-2-3 is now the lowest straight."],
            ["fixed", "Ultimate Texas Hold'em: the dealer needs a pair or better to qualify. Ace-King high no longer counts."],
            ["fixed", "Ultimate Texas Hold'em: when the dealer doesn't qualify, your Ante comes back even if the dealer has the better hand, unless you folded."],
            ["fixed", "Video Poker: Jacks or Better now pays every four of a kind the same, as the real game does."],
            ["fixed", "Double Down Madness: the message now says how the hand ended."],
        ],
    },
    {
        version: "4.1.7",
        date: "2026-10-10",
        title: "Double for less",
        changes: [
            ["new", "Blackjack, Free Bet Blackjack and Double Down Madness: if you cannot cover a full double, the button becomes Double for Less and puts in the rest of your balance."],
            ["improved", "Double Down Madness: the dealer's up card is dealt first, then your card, then the dealer's face-down card."],
            ["improved", "Double Down Madness: the Push 22 payout is now shown on the table."],
        ],
    },
    {
        version: "4.1.6",
        date: "2026-10-10",
        title: "Real-table dealing at every blackjack table",
        changes: [
            ["improved", "Free Bet Blackjack and Double Down Madness: your cards are stacked the way a dealer lays them, double-down cards are laid sideways, and the deal comes out one card at a time."],
            ["improved", "Blackjack: both dealer cards come out face down, then the dealer slides the second card under the first to flip it over."],
            ["improved", "Blackjack: when it is the dealer's turn, the dealer uses the up card to flip the hole card."],
        ],
    },
    {
        version: "4.1.5",
        date: "2026-10-10",
        title: "Blackjack dealt like a real table",
        changes: [
            ["improved", "Blackjack: your cards are stacked the way a dealer lays them, each one over the corner of the last, with every number and suit still in view."],
            ["improved", "Blackjack: a double-down card is laid sideways."],
            ["improved", "Blackjack: the deal comes out one card at a time: you, dealer, you, dealer."],
        ],
    },
    {
        version: "4.1.4",
        date: "2026-10-10",
        title: "Smoother Free Bet and Double Down Madness",
        changes: [
            ["improved", "Free Bet Blackjack: cards are dealt in turn, a Hit card arrives right away, and the dealer starts as soon as you stay."],
            ["improved", "Free Bet Blackjack and Double Down Madness: cards slide over to make room for a new one instead of jumping."],
            ["improved", "Free Bet Blackjack and Double Down Madness: the table glides into place when a hand is dealt instead of hopping."],
        ],
    },
    {
        version: "4.1.3",
        date: "2026-10-10",
        title: "Smoother Blackjack",
        changes: [
            ["improved", "Blackjack: cards are dealt in turn (you, dealer, you, dealer) and a Hit card arrives right away instead of after a pause."],
            ["improved", "Blackjack: cards slide over to make room for a new one instead of jumping, and the table no longer shifts when the hand is dealt."],
            ["improved", "Blackjack: the dealer starts playing as soon as you stand, and draws cards face up one at a time."],
        ],
    },
    {
        version: "4.1.2",
        date: "2026-10-10",
        title: "Pai Gow house way",
        changes: [
            ["fixed", "Pai Gow Poker: the dealer now sets every hand the way a real casino does, following a published Las Vegas house way. Before, a dealer holding the joker could break up a pair of aces."],
            ["fixed", "Pai Gow Poker: four of a kind can now be split into a pair in each hand."],
        ],
    },
    {
        version: "4.1.1",
        date: "2026-10-10",
        title: "DJ Wild Trips pay table",
        changes: [
            ["improved", "DJ Wild: when Trips hits, the payout that applies (Natural or Wild) is tinted green and the other is greyed out."],
        ],
    },
    {
        version: "4.1.0",
        date: "2026-10-09",
        title: "Two decks in play",
        changes: [
            ["new", "Tables now use two decks, one with gold backs and one with purple, the way a real table does. Poker tables swap decks every hand, and blackjack and baccarat swap when the shoe is reshuffled."],
            ["fixed", "A card that was in the last hand no longer slides across the table face up when it is dealt again."],
            ["improved", "Pai Gow Poker: moving a card up to your Low hand no longer rearranges your other cards. They re-sort when a card comes back down."],
            ["improved", "Pai Gow Poker: the Fortune Bonus pay table spells out Straight Flush and Royal Match in full."],
        ],
    },
    {
        version: "4.0.4",
        date: "2026-10-09",
        title: "Pai Gow Ace-high reveal",
        changes: [
            ["improved", "Pai Gow Poker: on a dealer Ace-high you still turn over your own cards. Once all seven are up, the hand finishes."],
        ],
    },
    {
        version: "4.0.3",
        date: "2026-10-09",
        title: "Pai Gow dealer fixes",
        changes: [
            ["fixed", "Pai Gow Poker: the dealer now keeps a straight or flush together instead of breaking it up to play high cards in the Low hand."],
            ["improved", "Pai Gow Poker: when the dealer has Ace-high, the main bet pushes. Turn over your cards and the hand finishes by itself, with your hand set for you."],
            ["improved", "Pai Gow Poker: the table now reads \"Dealer Ace High Pushes\"."],
        ],
    },
    {
        version: "4.0.2",
        date: "2026-10-09",
        title: "Pai Gow hand names",
        changes: [
            ["improved", "Pai Gow Poker: your hand names now read High then Low, the same order as the dealer's."],
        ],
    },
    {
        version: "4.0.1",
        date: "2026-10-09",
        title: "Card backs",
        changes: [
            ["fixed", "Face-down cards now fill their outline, with no gap around the card back."],
        ],
    },
    {
        version: "4.0.0",
        date: "2026-10-09",
        title: "A new look, and links to every page",
        changes: [
            ["improved", "A cleaner look across the whole site: flat colors, squared-off buttons and one plain typeface, with no glows or gradients."],
            ["improved", "Home, Settings, Feedback and What's New are now near-black with red buttons, and the menu bar matches on every page."],
            ["improved", "Text is larger and easier to read, and labels are no longer in small capital letters."],
            ["improved", "Playing cards have a bigger number in the corner, and payouts in the pay tables stand out in bold gold."],
            ["improved", "Each table's rules pop-up now matches the color of its felt."],
            ["new", "Every table and page has its own link, so you can bookmark a game or send it to a friend."],
            ["new", "Your browser's back and forward buttons now move between pages."],
            ["improved", "Refreshing keeps you on the page you were on."],
            ["improved", "Your seat is held: leave a table in the middle of a hand and the hand is still there when you come back."],
        ],
    },
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
