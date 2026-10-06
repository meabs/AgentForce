# Sound effect credits

All clips in this folder come from [Pixabay Sound Effects](https://pixabay.com/sound-effects/) and are used under the [Pixabay Content License](https://pixabay.com/service/license-summary/). The license does not require attribution, but the creators deserve credit, so here they are.

Every clip was trimmed, faded, levelled and re-encoded (mono MP3) with ffmpeg for use in Agent Fleet Command. Only generic sci-fi sounds were chosen: nothing here is titled, tagged or designed as a recreation of any film or game franchise sound.

| File | Used for | Original title | Creator | Pixabay page |
|---|---|---|---|---|
| `select.mp3` | Selecting a unit | Sci-Fi System Blip | [SoundShelfStudio](https://pixabay.com/users/soundshelfstudio-46480698/) | https://pixabay.com/sound-effects/film-special-effects-sci-fi-system-blip-525671/ |
| `ack.mp3` | Command acknowledged | Confirm-SFX | [DRAGON-STUDIO](https://pixabay.com/users/dragon-studio-38165424/) | https://pixabay.com/sound-effects/technology-confirm-sfx-570441/ |
| `launch.mp3` | Summon / launch (warp in) | Teleport Whoosh | [humordome](https://pixabay.com/users/humordome-44873699/) | https://pixabay.com/sound-effects/teleport-whoosh-453276/ |
| `complete.mp3` | A unit finishes | Level Complete | [Universfield](https://pixabay.com/users/universfield-28281460/) | https://pixabay.com/sound-effects/film-special-effects-level-complete-143022/ |
| `alert.mp3` | A unit is blocked or errors | 03 - Alarms & Beeps - Urgency Is Key A | [Snoops_Audio](https://pixabay.com/users/snoops_audio-50133752/) | https://pixabay.com/sound-effects/film-special-effects-03-alarms-amp-beeps-urgency-is-key-a-343795/ |
| `ambient.mp3` | Optional bridge hum loop (off by default) | Spaceship hum low frequency | [AudioPapkin](https://pixabay.com/users/audiopapkin-14728698/) | https://pixabay.com/sound-effects/film-special-effects-spaceship-hum-low-frequency-296518/ |

Edits made:

- `select.mp3`: first 0.55 s of the blip, faded tail.
- `ack.mp3`: full clip, levelled.
- `launch.mp3`: first 1.75 s, 0.4 s fade out.
- `complete.mp3`: first 1.9 s, 0.3 s fade out.
- `alert.mp3`: first two alarm pulses (about 1.55 s).
- `ambient.mp3`: 24 s seamless loop cut from the middle of the original (equal-power crossfade at the seam), padded by 0.5 s either side so the player can loop between 0.5 s and 24.5 s.

Voice lines are not recordings: they are spoken live by the browser's SpeechSynthesis engine.
