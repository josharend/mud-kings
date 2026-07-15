# MUD KINGS — Stadium Off-Road Championship

An original tribute to the golden age of single-screen stadium off-road arcade
racers (1989 vintage). All code, art, sounds, names, and tracks are original —
the gameplay formula is the homage. Renders in real 3D via Three.js.

## Run it

Any static server works; no build step, no npm:

    python -m http.server 8653 --directory mud-kings

or use the `mud-kings` entry in `Games/.claude/launch.json`. Three.js loads
from a CDN at runtime — if that's blocked (offline, firewall) the game
detects it and automatically falls back to the original flat top-down 2D
renderer, so it still plays either way.

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

The race world is real 3D, rendered with Three.js/WebGL: a directional sun
light with cast shadows, a candy-striped barrier rail that's actual raised
geometry hugging every curve, moguls as real raised mounds you can see cast a
shadow, and low-poly toy-truck models (body, cab, roll bar, chrome bumpers,
knobby tires with lug-nut hubs, a chassis-specific spoiler/bull-bar/snorkel)
that rotate and pitch in full 3D instead of swapping between flat sprite
frames. The ground itself reuses the game's richly painted 2D dirt/mud/grass/
water texture as a 3D-mapped surface, so none of that detail was lost moving
into 3D. Night tracks get real point lights at the four tower positions
instead of a flat gradient hack.

The 2D canvas still handles every menu, the HUD, and lightweight particle FX
(dust, sparks, impact flashes) as a transparent overlay on top of the WebGL
canvas — and it's still the full renderer if 3D isn't available. The whole
screen runs through a CRT pass on top of everything — scanlines plus a
vignette — for that arcade-cabinet look.

## Architecture (plain globals, load order matters)

`js/util.js` (math, seeded RNG, 3×5 bitmap font) → `js/sprites.js` (2D
fallback pixel-art trucks, 16 rotations × 4 colors × 3 chassis, flames,
pickups — also the source of truth for team palettes/chassis stats that the
3D renderer reads) → `js/tracks.js` (tile-grid track builder + themed 2D
stadium renderer, still used both as the 2D fallback AND as the ground
texture for the 3D scene; each track is a centerline polyline carved into a
corridor via `_carvePath`, with the centerline doubling as the AI waypoint
list) → `js/render3d.js` (Three.js scene/camera/lighting, track/truck/pickup
3D geometry, and the physics→3D sync — reads `GAME.G` state, never writes it)
→ `js/audio.js` (all-procedural WebAudio SFX) → `js/music.js` (chiptune
engine) → `js/game.js` (physics, AI, race flow, HUD, and the 3D/2D render
dispatch) → `js/shop.js` → `js/main.js` (input, fixed-step loop, boots R3
before GAME so the first race build has 3D ready).

Debug/test hooks on `window.DBG`: `state()`, `tick(n)`, `draw()`, `shot()`
(composites the WebGL canvas + 2D overlay into one PNG), `press(code)`,
`autopilot()`, `give(amount)`, `setRace(n)`.
