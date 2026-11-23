# Assets

| Folder | What goes in it | Loaded by the game? |
|---|---|---|
| `cats/mallow/`, `cats/mischko/` | Normal sprites: `<cat>_<pose>.png` (idle, sitting, jump, falling, landing, hit, walking_1–4). All face right. | yes |
| `cats/<cat>/halloween/` | Costume sprites `<cat>_<pose>_halloween.png`, resized for the game | yes |
| `menu/` | Menu backgrounds and logos: `bg.jpg`, `bg_<event>.jpg`, `logo.png`, `logo_<event>.png` | yes |
| `secret/` | Secret pictures (web-sized) | yes, when unlocked |
| `music/` | Songs, lowercase with underscores: `halloween_1.mp3` … | yes |
| `sfx/` | Short sound effects | yes |
| `source/` | Originals: sprite sheets, full-size PNGs, full-size pictures. Kept for re-exporting. | no |

**Adding new files:** drop them anywhere in `assets/` with the event suffix (e.g. `mallow_jump_christmas.png`, `main_bg_christmas.png`, `Christmas1.mp3`) and tell Claude. They get resized/compressed into the right folder, and the originals move to `source/`.
