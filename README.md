# MUD KINGS — Stadium Off-Road Championship

An original tribute to the golden age of single-screen stadium off-road arcade
racers (1989 vintage). All code, art, sounds, names, and tracks are original —
the gameplay formula is the homage.

## Run it

Any static server works; no build, no dependencies:

    python -m http.server 8653 --directory mud-kings

or use the `mud-kings` entry in `Games/.claude/launch.json`.

## How to play

- **P1**: Arrow keys drive, **Space** fires a nitro.
- **P2** (optional): **WASD** drives, **Shift** fires a nitro.
- **Enter** confirms, **P**/**Esc** pauses, **M** mutes.
- Title screen: **1** = new 1-player season, **2** = new 2-player, **Enter** = continue save.

New seasons start at the truck-select screen — three chassis:
**MUDCAT** (balanced), **JACKRABBIT** (fast, loose), **BULLDOG** (grippy, slower).

Five laps per race against three AI trucks. Mud and water bog you down, mogul
fields launch you airborne (no steering in the air!), money bags are worth
$1,500, red canisters give a nitro bottle. Prize money by finishing place:
$12,000 / $8,000 / $5,500 / $3,500.

Races use **rubber-band catch-up**, arcade-style: the further you trail the
leader, the more your acceleration and top speed claw back (and the leader eases
off a hair). Every race stays a scrap to the last corner — watch for the
"TAKES THE LEAD!" swaps.

Between races, spend winnings at the **SPEED SHOP**: tires (grip + turning),
shocks (softer landings), engine (acceleration), gearbox (top speed), and nitro
three-packs — before the shop timer runs out. Eight races make a season; the AI
gets meaner every race, and meaner still every season. Progress autosaves after
each shop visit.

If you get stuck, sit still for a couple of seconds and the track crew will
lift you back onto the racing line.

## Tracks

A season runs all eight base tracks, one per race:

1. **DUST BOWL** — classic oval, mogul field up top, mud on the left.
2. **THE HOURGLASS** — crossover pinch through a water splash, head-on traffic.
3. **SPLASHDOWN** — lane-choice water hazards, mud corner. *(winter)*
4. **HAIRPIN HAVOC** — a wall spur forces a tight chicane; water on the exit.
5. **THE COLOSSEUM** — big fast oval around a central island; moguls and a pond.
6. **SIDEWINDER** — two offset islands make an S-weave. *(night)*
7. **THE GAUNTLET** — wide horizontal speedway, big mogul field. *(winter)*
8. **THE HOOK** — an L-shaped island; the loop wraps a hooked infield. *(night)*

Later seasons re-run the eight as mirrored "II" variants with extra scattered
hazards (and a "TURBO" tag from season 3 on).

Races cycle through **day**, **night** (floodlights + headlights), and
**winter** themes. In winter, water hazards freeze into ice — it barely slows
you, it just stops gripping.

## Architecture (plain globals, load order matters)

`js/util.js` (math, seeded RNG, 3×5 bitmap font) → `js/sprites.js` (procedural
pixel-art trucks prerendered in 16 rotations × 4 colors × 3 chassis, flames,
pickups) → `js/tracks.js` (tile-grid track builder + themed stadium renderer;
tracks defined as carve/stamp ops plus waypoint lists) → `js/audio.js`
(all-procedural WebAudio SFX) → `js/music.js` (chiptune engine: title/race/shop
loops scheduled ahead of the AudioContext clock; race theme shifts up an octave
on the final lap) → `js/game.js` (physics, AI, race flow, HUD) → `js/shop.js`
→ `js/main.js` (input, fixed-step loop with timer fallback for hidden tabs).

Debug/test hooks on `window.DBG`: `state()`, `tick(n)`, `draw()`, `shot()`,
`press(code)`, `autopilot()`, `give(amount)`, `setRace(n)`.
