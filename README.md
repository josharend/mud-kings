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

Every track is a narrow, winding single-lane circuit — like the real arcade
machine, not a wide loop around one island. A season runs all eight, one per
race:

1. **DUST BOWL** — a 4-pass zigzag with a mud shortcut cutting straight
   across the middle, skipping a whole leg of the lap if you commit to it.
2. **THE HOURGLASS** — a tight vertical weave with a mud "waist" pinch in
   the dead center.
3. **SPLASHDOWN** — the same weave with water crossing two of the passes. *(winter)*
4. **HAIRPIN HAVOC** — the narrowest track in the game, five passes packed
   into a dense zigzag.
5. **THE COLOSSEUM** — the widest, grandest sweep; a big mogul field and a pond.
6. **SIDEWINDER** — a mirrored vertical weave, snaking the other way. *(night)*
7. **THE GAUNTLET** — an L-shaped run packed with four hazards back to back.
8. **THE HOOK** — a rectangular loop with a hook-shaped dip curling in
   right before the finish. *(night)*

Later seasons re-run the eight as mirrored "II" variants with extra scattered
hazards (and a "TURBO" tag from season 3 on).

Races cycle through **day**, **night** (floodlights + headlights), and
**winter** themes. In winter, water hazards freeze into ice — it barely slows
you, it just stops gripping.

## Graphics

The track surface is one continuous painted dirt shape, not a grid of repeated
tiles — mud and water blend into it with soft edges, and a candy-striped tube
rail hugs the actual carved corridor around every curve, just like the real
cabinet's track art. Moguls are big raised mounds with a real highlight and
drop-shadow, not flat bumps.

Every truck is prerendered pixel art with 7-tone rounded-metal shading, chrome
bumpers and roll bars, knobby tread with lug-nut hubs, side mirrors, a light
bar, and a sponsor number decal on the tailgate — each chassis adds its own
silhouette (JACKRABBIT's spoiler, BULLDOG's bull bar, MUDCAT's snorkel). The
stadium has a canopy roofline around the whole perimeter, a crowd of tiny
people (not just colored dots), richer dirt/mud/grass/water texture, and
mogul bumps with a proper highlight-and-shadow pop. Collisions throw sparks
and a flash ring on hard hits; dust, mud, and mogul-landing particles are soft
growing puffs instead of squares. The whole screen runs through a CRT pass —
scanlines plus a vignette — for that real arcade-cabinet look.

## Architecture (plain globals, load order matters)

`js/util.js` (math, seeded RNG, 3×5 bitmap font) → `js/sprites.js` (procedural
pixel-art trucks prerendered in 16 rotations × 4 colors × 3 chassis, flames,
pickups) → `js/tracks.js` (tile-grid track builder + themed stadium renderer;
each track is a centerline polyline carved into a corridor via `_carvePath`,
with the centerline doubling as the AI waypoint list) → `js/audio.js`
(all-procedural WebAudio SFX) → `js/music.js` (chiptune engine: title/race/shop
loops scheduled ahead of the AudioContext clock; race theme shifts up an octave
on the final lap) → `js/game.js` (physics, AI, race flow, HUD) → `js/shop.js`
→ `js/main.js` (input, fixed-step loop with timer fallback for hidden tabs).

Debug/test hooks on `window.DBG`: `state()`, `tick(n)`, `draw()`, `shot()`,
`press(code)`, `autopilot()`, `give(amount)`, `setRace(n)`.
