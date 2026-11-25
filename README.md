# Duskfall

Duskfall is a compact, original first-person browser shooter built for iPhone Safari. Clear eight hostiles, collect supplies and reach the extraction gate. The 3D view uses a Canvas raycaster; the artwork and sound are generated in the browser. There are no packages to install or external assets to load.

## Play

Open `index.html` through a static web server, or use the GitHub Pages URL once the repository is published. Landscape orientation gives the widest view on iPhone.

| Device | Controls |
| --- | --- |
| iPhone | Left stick moves and strafes; right stick turns and looks up or down; hold **FIRE** to shoot; tap **RLD** to reload; tap **II** to pause. |
| Desktop | **WASD** moves; mouse looks; click or **Space** shoots; **R** reloads; **P** or **Esc** pauses. Arrow keys also move and turn. |

The extraction gate unlocks after every hostile is defeated. The minimap marks the player, hostiles and gate.

## Run locally

From this directory:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000` in a browser. On an iPhone, use a deployed HTTPS link such as GitHub Pages.

## Publish with GitHub Pages

Push this directory to the root of a GitHub repository. In that repository, select **Settings → Pages → Deploy from a branch**, then select **main** and **/(root)**. GitHub will show the public play URL when deployment completes. The empty `.nojekyll` file ensures the static files are served as-is.

## Files

- `index.html` and `styles.css`: interface and touch controls
- `game.js`: raycaster, level, enemy behaviour and gameplay
- `audio.js`: synthesised sound effects

No Doom code, artwork, sounds or trademarks are included.
