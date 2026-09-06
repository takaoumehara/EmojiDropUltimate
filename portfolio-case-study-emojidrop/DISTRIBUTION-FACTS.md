# DISTRIBUTION FACTS — EmojiDrop Ultimate (verified only, 2026-09-06)

Every line is traceable to a path in this repo; nothing is estimated. Name used is the repo's own.
No test was executed in this session — dated claims say when they were measured.

## One sentence
A phone shooter whose scroll direction changes with every stage, where sixteen ships unlock by
playing and a test fails if any of the later ones is stronger. (`README.md`, `src/config.js`)

## The one strongest claim
"Later characters are not stronger" is not a promise here, it is a failing test: one `powerScore`
folds punch, rate, aim, width, range, pierce and speed into a single number, all sixteen sit
within ±1%, and a second test fails if the first half of the unlock ladder averages more than 4%
from the second half. (`docs/balance.md` §3, measured 2026-08-19)

## Three moments for a 20-second video
1. **The turn.** A stage ends and the world rotates 90° — background, enemies, music and boss all
   change with it. This is the core idea and the only one a still image cannot carry. (`src/config.js` STAGES)
2. **The line.** Two phones, two ships, a tether strung between them that cuts whatever crosses it —
   impossible with one player, by construction. (`src/tether.js`, `test/tether.test.js`)
3. **The locked card.** A character card showing "N more stages" under a header stating that all
   sixteen are equally strong and differ only in quirk. (commit `41627b4` #5)

## Audience
Recruiters and studios judging whether one person can ship a complete interactive product; anyone
asking whether "built with agents" means "unverified". The game is for phones, two players side by side.

## What makes it different from a generic shmup
- **Direction changes per stage** (⬆️➡️⬇️⬅️) — background, enemies, music and boss change with it.
- **A progression ladder that is provably flat.** Sixteen ships, unlock one per stage cleared,
  all sixteen by the 13th, none stronger than the three you start with.
- **The boss endgame draws from six cards** (revive / split / flee / eat a dropped bell / nothing at
  all / the world's direction flips mid-fight). The last two draws are excluded, the history is on
  the device, and leftover bells change the draw. (`docs/product-idea.md`)
- **A co-op mechanic that cannot exist solo** — the tether, written after a child said two players
  felt no different from one.
- **Three AI systems inside the product**: weather rewrites the rules via Open-Meteo (no key), a
  director reads your accuracy and adjusts spawns, the boss learns where you stand. Gemini
  generates whole stages, falling back to on-device procedural generation with no key.

## Tech in one line
One folder of ES modules — no build step, no framework, no CDN, zero dependencies (no
`package.json`); Canvas 2D, Web Audio synthesised on the fly, WebRTC DataChannel for co-op with
host authority at ~15Hz, a self-written QR encoder, and a PWA that starts with the network off.

## Honest caveats (say these out loud)
- **No public URL is verified.** `vercel.json` exists, but no deployed URL appears anywhere in the
  repository, and `creativityiseverywhere.com/playable.html` still reads "No public URL yet"
  (2026-08-19). Do not publish a guessed URL.
- **3–4 players need a relay server that is not running.** Code and tests are done and four browser
  windows on one machine stay in sync, but `index.html:12` (`coop-relay`) is empty, so the public
  build is two players. A money decision (~$2–7/month), not a code one. (`docs/status.md`, `costs.md`)
- **TURN is best-effort.** Direct connections use free public TURN by default and can fail on
  strict NAT (mobile network to mobile network). Own TURN credentials are supported via env vars.
- **Never run on a real phone.** Layout was verified across 11 viewports in a headless browser,
  not on an actual iPhone or Android. (`docs/status.md`)
- **Nobody outside the household has played it.** The readiness doc scores "proof that it is fun"
  at 45/100 and gives the reason as two children saying so unprompted. (`docs/store-readiness.md`)
- **The README is still wrong about its own game** — it says six characters; `src/config.js` has
  sixteen. Worth fixing before linking anyone to the repo.

## GitHub visibility
Remote is `github.com/takaoumehara/EmojiDropUltimate` (`git remote -v`). **Whether it is public or
private was not verified from this environment** — check before linking.

## Status
Prototype. Solo and two-player complete in code and under test; 50 commits, 2026-07-28 → 2026-08-22.
Documented runs: 192 passing (2026-07-29), 201 passing (2026-08-01). Not re-run on 2026-09-06.

## Five candidate LinkedIn first lines (English, ≤25 words, each tied to a fact)
1. A test in this repo fails if the characters you unlock later are stronger than the three you
   started with. (20 words — `docs/balance.md` §3-3)
2. One character was quietly playing a different game: `pierce: 1` meant never despawns, so one
   shot deleted an entire column. (20 — `docs/balance.md` §4-1)
3. I photographed 13 screens across 11 viewports. Only the phone held upright was fine. On a
   1920px window the ship was 2% wide. (23 — commit `720c684`)
4. The whole game runs with no screen attached: five game-minutes in 0.29 seconds. Building that
   harness found two bugs the tests never would. (23 — `docs/multiplayer.md`, 2026-07-29)
5. No build step, no framework, no CDN, zero dependencies — and it still starts with the network
   off. (18 — no `package.json`, verified 2026-09-06)
