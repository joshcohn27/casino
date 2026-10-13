# Cohn Casino

A browser casino simulator: table games with one shared bankroll that carries from table to table. No real money, no accounts, no ads. Everything is saved in the browser.

Live at [casino.joshbcohn.com](https://casino.joshbcohn.com).

## Games

| Group | Games |
|---|---|
| Blackjack | Classic Blackjack, Free Bet Blackjack, Double Down Madness, Side Bet Blackjack |
| Poker | Ultimate Texas Hold'em, Pai Gow Poker, Three Card Poker, Mississippi Stud, I Luv Suits, DJ Wild, Casino War, Video Poker (Jacks or Better, Bonus Poker, Deuces Wild) |
| Tables | Roulette, Baccarat |
| Free chips | Card Ladder: four right calls in a row wins $1,000 |

Every table can be played from the keyboard, shows a running session read-out (hands, average bet, net), and keeps your seat if you leave mid-hand and come back.

## Stack

React 19, TypeScript, Tailwind 4, Vite 7, motion, react-router. Deployed on Vercel.

## Run it

```
npm install
npm run dev        start the dev server
npm run build      type check and build for production
npm run lint       run ESLint
npm run preview    serve the production build locally
```

Type check on its own:

```
npx tsc -p tsconfig.app.json --noEmit
```

## Where things live

```
src/
  main.tsx, App.tsx, index.css   entry point and the one stylesheet
  app/          Casino.tsx (menu, routes, Home), games.ts (the game list), changelog.ts
  pages/        Settings, Feedback, WhatsNew, NotFound
  games/
    blackjack/    Blackjack, FreeBetBlackjack, DoubleDownMadness, SideBetBlackjack
    poker/        UltimateTexasHoldem, PaiGow, ThreeCardPoker, MississippiStud,
                  ILuvSuits, DJWild, CasinoWar
    video-poker/  VideoPoker, VideoPokerBonus, VideoPokerDeuces
    table/        Roulette, Baccarat
    minigames/    CardLadder
  shared/
    components/   TableShell, Card, BetSpot, ChipTray, ActionBar, SlideBtn, HandRow,
                  BlackjackHand, SessionBadge
    state/        bankroll and session providers, settings, progressive meter
    lib/          cards, deck, hand sorting, money, keyboard shortcuts
public/           card backs, suit art, favicon
```

A table's pure rules (payouts, hand ranking, house way) sit in a `...Logic.ts` file beside the table, so they can be checked without a browser. Anything two tables share goes in `shared/`.

## How the site is put together

- **One list of games.** `src/app/games.ts` is the only place a game is registered. The routes, the menu, the phone menu and the Home page cards are all built from it.
- **Real URLs.** Each page has its own address. `vercel.json` sends every path to `index.html`.
- **Shared bankroll.** The balance lives above the router in `shared/state`, so it is the same at every table and survives a refresh.
- **Held seats.** A table you have opened stays mounted but hidden when you leave it, so a hand in progress is still there when you return.
- **Nothing shifts.** Results, suggestions, chips and buttons appear in space that is already reserved for them. Dealing or settling a hand must not move anything else on the screen.
- **One stylesheet.** Layout is Tailwind classes on the elements. `src/index.css` holds the color tokens, the font, and the screen size rules.

## Adding a game

1. Create `src/games/<group>/GameName.tsx` with a default export that takes `{ bankroll, setBankroll }`.
2. Put its rules and payouts in `GameNameLogic.ts` beside it.
3. Add one entry to `GAMES` in `src/app/games.ts`.
4. Add its default bets to `src/shared/state/settings.ts` and its name to the Feedback form.

`CLAUDE.md` has the full conventions: the action bar pattern, card sizes and deal timing, keyboard shortcut attributes, and felt colors.

## Versions

`src/app/changelog.ts` is the source of truth for the version and the What's New page. A change that players will notice gets a new entry at the top and a matching version in `package.json`. Major changes how the whole site looks or plays, minor adds something, patch is fixes and polish.

## Rules sources

Game rules and pay tables follow published casino rules where they exist, mostly as documented by Wizard of Odds. Each table's rules popup (the `i` button) lists what that table plays by.
