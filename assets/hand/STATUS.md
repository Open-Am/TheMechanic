# Mechanic's hand status

Statuses as for the machine (ADR 0013): `placeholder`, `blocked`, `modelled`, `textured`, `approved`. Only the owner sets `approved`. Updated 2026-10-11 by plan 0009.

| Object | Status | Triangles | Matched against | What still differs |
| --- | --- | --- | --- | --- |
| `mechanic_hand` | textured | 3,912 of 4,000 | `match/` renders of the open, gripping and pinching hand from three sides (five rounds, see below), and in the game: mid-pull, pinching the capacitor, and holding the base during a turn | Real proportions and anatomy now: knuckles, the thenar pad, tendons on the back of the hand and the wrist come from MakeHuman's sculpted body. Still differs: the skin has no wrinkles at the knuckles or finger joints and no veins (MakeHuman's base mesh is smooth and its own skin images are not used, ADR 0016); the grease is light; the sleeve is a clean tube with soft folds, a little too blue and too even for a working shirt; the cut end of the forearm inside the sleeve can show as a dark ring from some angles. |

## How it is made

`tools/blender/hand.py -- build` (`-- preview <dir>` renders the poses without baking, for tuning):

1. MPFB makes an adult Nigerian man in his thirties with a working build: male, age about 35, muscle 0.72, average weight, African ethnicity, thicker fingers and a stronger forearm.
2. MakeHuman's own skeleton poses the right hand three ways. The fingers are set by angle; the thumb is solved each time by a search that brings its tip to a target on the index finger: beside the index knuckle (open), over the index finger's middle bone (grip), pad to pad with the index tip (pinch).
3. The right hand and forearm, up to 155 mm from the wrist, are cut out of the body with MakeHuman's topology, so all three poses share the same vertices and become the `grip` and `pinch` morph targets over the open hand.
4. MPFB 2.0.18's `.R` hand comes out of the frame as a left hand, so the frame mirrors it; the build checks the thumb is on the left and the nails on top and fails otherwise.
5. A rolled work-shirt sleeve, one open tube with a turned-back cuff and soft folds, 550 mm long so its far end runs off the screen, hides the cut.
6. Skin, nails and sleeve are baked by `texture.py` into one 1024 px set. Compressed: 137.6 KB of 400 KB.

The grip point (the origin) is the centre of a circle fitted through the gripping fingers' joints. The pinch point, where the thumb and index tips meet, is stored on the node as `pinch_point`.

## Rounds

1. First body: the palm faced sideways (the palm direction was taken from the nails, which gave mostly the finger's length), the thumb never reached the index finger, and the sleeve was a solid cylinder with a flat end.
2. Palm direction from the knuckle line, fingers closed together, an open rolled sleeve. The open hand was still flat and spread like MakeHuman's rest pose.
3. Relaxed curl and closed spread for the open hand, a tighter grip. The thumb solver settled in its first dip and the pinch thumb stopped 36 mm short.
4. A coarse search before the fine one: the thumb meets the index tip. The renders then showed the thumb on the right of a palm-down hand: MakeHuman's `.R` hand had come out as a left hand. Mirrored, with a check in the build.
5. In the game, holding the base during a turn showed the sleeve's open end at the bottom of the screen: the sleeve now runs 550 mm.

## References

`assets/hand/reference/` (git-ignored, reference only): a public-domain photo of a mechanic's greasy hands at work (US DVIDS). MakeHuman supplies anatomy and proportions. Photos of a Lagos mechanic's hands, open, gripping and pinching, would still be the best check, and the owner's own would be best of all.
