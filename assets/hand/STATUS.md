# Mechanic's hand status

Statuses as for the machine (ADR 0013): `placeholder`, `blocked`, `modelled`, `textured`, `approved`. Only the owner sets `approved`. Updated 2026-10-11 by plan 0008.

| Object | Status | Triangles | Matched against | What still differs |
| --- | --- | --- | --- | --- |
| `mechanic_hand` | textured | 3,992 of 4,000 | `match/hand-open-*`, `match/hand-grip-*` (two rounds), and in the game mid-pull | Reads as a hand and grips convincingly, but it is smoother than a real hand: no knuckle wrinkles, tendons or veins in the shape, and the fingers are evenly round. The sleeve is a tube with ring folds, not draped cloth. The grip is one shape, the same for every part, so on small parts like the spark plug the fingers close around air. |

## How it is made

`tools/blender/hand.py -- build`: a joint skeleton at adult proportions (about 190 mm long, palm about 85 mm wide, middle finger about 80 mm) turned into a body with Blender's Skin and Subdivision modifiers, decimated to budget, with nails and a rolled work-shirt sleeve. The grip is one morph target, `grip`: each finger joint rotates smoothly about its own axis. The texture bakes dark brown skin with lighter palms, darker creases and engine grease on the fingertips and palm, through the same baker as the machine (`texture.py`). Compressed: 157.7 KB of 400 KB.

## Rounds

1. The fingers came out mannequin-thin (subdivision shrinks a skin body by about a quarter), the thumb stuck up from the palm, and the light laterite dust from the machine's wear washed the dark skin out to tan.
2. Radii scaled up by 1.3, the thumb moved low and forward along the index side, no dust on skin, a looser sleeve with folds. In the game's light the skin reads dark brown.

## References

`assets/hand/reference/` (git-ignored, reference only): a public-domain photo of a mechanic's greasy hands at work (US DVIDS), used for where grease gathers. Proportions are standard adult hand measurements. Better references would be photos of a Lagos mechanic's hands, open and gripping; the owner's own photos would be best.

## Next step if it is not believable enough

ADR 0015 allows an outside tool with the owner's written approval: for example the MakeHuman add-on for Blender, whose generated characters are CC0, which would give a sculpted, rigged hand.
