# Cenote

A flooded cave lit by one hole in the roof, seen from under the water, in three.js. Shafts of sunlight come down through the trees around the opening and fan out into the deep blue. Touch the surface above and your ripples bend the light.

**Open: https://aiimpl.github.io/cenote/** (Look up / Look down at the bottom)

Nothing is pre-rendered and there are no image files: the water, the cave, the trees around the hole and the light are all computed in the browser.

## How it is built

| | |
|---|---|
| Shafts of light | Each pixel steps along its view ray through the water. At every step it asks where the sunlight reaching that point came in at the surface (straight back up along the refracted sun) and whether that spot is in the sun: under the hole, and not shaded by the canopy or the hanging vines. Light scattered towards the camera is added up with a forward-peaked phase function, so the shafts blaze when you look up into them |
| The flicker in the shafts | A light map of the sunlit patch of water, made the same way as the net of light on a sea floor: a fine grid of the surface, each point refracting the sun and moving to where it lands; the light is as bright as each little triangle shrank. The shafts sample it along the light, and deeper water reads a blurrier level of it |
| The surface | Calm cave water with a faint ripple, rings from water dripping off the vines, and rings from your finger. Seen from below, the daylight only shows through a round window; outside it the surface is a dark mirror |
| Water | Red is absorbed first and blue last, with a little scattering and fine particles that sparkle inside the shafts |
| The cave | A mound of fallen roof under the hole on a limestone floor, rock walls, and the dark roof around the opening |
| Post | Bloom at 1/4 size, ACES tone mapping, vignette and grain. The film is drawn at 3x and scaled down |

- `web/src/shaders.js`: the hole and canopy, the surface, the light map, the ray march and the post
- `web/src/main.js`: the passes, the five shots of the film, the page
- `tools/`: frames for the video (`render.py`), the mp4 (`encode.sh`), a row of stills (`sheet.sh`), a page check at desktop and phone size (`check_page.py`)

```sh
make serve          # http://127.0.0.1:8814/
make setup          # Python + Playwright for the video and the check
make preview        # a rough 30 fps version of the film
make film video     # build/cenote.mp4 (1080x1350, 60 fps)
make check          # pyflakes, then the page at desktop and phone size
```

## License

MIT (`LICENSE`). three.js is MIT, see `web/vendor/three/LICENSE`.
