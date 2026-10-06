# Art credits

Everything in `public/art/` is free art, licensed for redistribution in a public repository.
Only the files the app actually uses are included. No trademarked franchise art is used.

## Kenney (CC0 1.0, public domain)

Created and distributed by Kenney, <https://www.kenney.nl>.
Licence: Creative Commons Zero, <https://creativecommons.org/publicdomain/zero/1.0/>.
Attribution is not required, but we're happy to give it.

| File in `public/art/kenney/` | Source pack | Original file | Changes |
| --- | --- | --- | --- |
| `ship-speedera.png`, `ship-speederb.png`, `ship-speederd.png`, `ship-racer.png`, `ship-miner.png`, `ship-cargoa.png` | [Space Kit 2.0](https://kenney.nl/assets/space-kit) | `Isometric/craft_*_NE.png` | cropped, scaled to 112 px max, palette-quantised |
| `station-hangar.png`, `station-dome.png`, `station-dish.png` | [Space Kit 2.0](https://kenney.nl/assets/space-kit) | `Isometric/hangar_largeA_NE.png`, `hangar_roundGlass_NE.png`, `satelliteDish_large_NE.png` | cropped, scaled, palette-quantised |
| `station-console.png`, `station-display.png` | [Space Station Kit 1.0](https://kenney.nl/assets/space-station-kit) | `Previews/computer-system.png`, `Previews/display-wall-wide.png` | cropped |
| `panel-notched.svg` | [UI Pack: Sci-fi 2.0](https://kenney.nl/assets/ui-pack-sci-fi) | `Vector/Extra/panel_glass_notches.svg` | recoloured to the HUD cyan palette |

Where they're used: ships are the unit sprites on the map, in the roster and in the list view
(one per agent, picked from its id). Stations mark repositories on the map, and appear in the
empty and offline notices. The notched panel is the frame on the help overlay.

## game-icons.net (CC BY 3.0)

Icons from <https://game-icons.net>, licensed under Creative Commons Attribution 3.0,
<https://creativecommons.org/licenses/by/3.0/>.
Changes to every icon: removed the black background square and renamed the file. The app tints
them with CSS masks.

| File in `public/art/game-icons/` | Original icon | Author |
| --- | --- | --- |
| `alert.svg` | [Hazard sign](https://game-icons.net/1x1/lorc/hazard-sign.html) | Lorc |
| `branch.svg` | [Branch arrow](https://game-icons.net/1x1/lorc/branch-arrow.html) | Lorc |
| `launch.svg` | [Rocket](https://game-icons.net/1x1/lorc/rocket.html) | Lorc |
| `map.svg` | [Orbital](https://game-icons.net/1x1/lorc/orbital.html) | Lorc |
| `pending.svg` | [Hourglass](https://game-icons.net/1x1/lorc/hourglass.html) | Lorc |
| `recall.svg` | [Return arrow](https://game-icons.net/1x1/lorc/return-arrow.html) | Lorc |
| `refresh.svg` | [Cycle](https://game-icons.net/1x1/lorc/cycle.html) | Lorc |
| `running.svg` | [Radar sweep](https://game-icons.net/1x1/lorc/radar-sweep.html) | Lorc |
| `search.svg` | [Magnifying glass](https://game-icons.net/1x1/lorc/magnifying-glass.html) | Lorc |
| `approve.svg` | [Check mark](https://game-icons.net/1x1/delapouite/check-mark.html) | Delapouite |
| `archive.svg` | [Chest](https://game-icons.net/1x1/delapouite/chest.html) | Delapouite |
| `followup.svg` | [Chat bubble](https://game-icons.net/1x1/delapouite/chat-bubble.html) | Delapouite |
| `list.svg` | [Checklist](https://game-icons.net/1x1/delapouite/checklist.html) | Delapouite |
| `pr.svg` | [Split arrows](https://game-icons.net/1x1/delapouite/split-arrows.html) | Delapouite |
| `repo.svg` | [Database](https://game-icons.net/1x1/delapouite/database.html) | Delapouite |
| `stop.svg` | [Stop sign](https://game-icons.net/1x1/delapouite/stop-sign.html) | Delapouite |
| `success.svg` | [Confirmed](https://game-icons.net/1x1/delapouite/confirmed.html) | Delapouite |
| `help.svg` | [Help](https://game-icons.net/1x1/sbed/help.html) | Sbed |
| `pause.svg` | [Pause button](https://game-icons.net/1x1/guard13007/pause-button.html) | Guard13007 |

Authors: Lorc (<https://lorcblog.blogspot.com>), Delapouite (<https://delapouite.com>),
Sbed (<https://opengameart.org/content/95-game-icons>), Guard13007 (<https://guard13007.com>).

## Not included

- **Engvee's free isometric drone pack.** Its licence lets you use and modify it in your own
  projects, but it doesn't clearly allow redistributing the source files in a public repo, so it
  isn't shipped here.
