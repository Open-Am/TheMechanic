# Sound shortlist for plan 0013 (CC0 only)

Compiled 2026-10-11 for `docs/plans/0013-sound-and-vibration.md` step 3 and ADR 0018.

How the licences were checked. Each candidate came from a Freesound search with the `license:"Creative Commons 0"` filter. I then fetched every sound's own page. All the pages listed below link their licence to `creativecommons.org/publicdomain/zero/1.0/` (CC0 1.0). As a control, I fetched a known CC-BY page (InspectorJ, sound 339822). It links to `licenses/by/4.0/`, which shows that this check tells the licences apart. One search hit is left out because its page would not load, so its licence could not be confirmed: Stefan021 "Chainsaw - Pull to Start and Run.wav", 431742. Durations come from the sound pages. Nothing was downloaded, so I have not listened to any of these. The "why it fits" notes are based on titles and descriptions. The owner needs to listen before picking.

Targets from the plan: `turn` is about 0.1 s (two clicks in 0.25 s); the gives, `land` and `seat` are short one-shots; `cord` is trimmed to 0.6 s (`CORD_SECONDS`); `fail` is a short cough and splutter; `start` is about 2.5 s. The whole set is mono Ogg Opus, about 60 KB in all.

## turn: a thread or ratchet click for each turn

| URL | Title | Author | Licence | Duration | Why it fits / trim |
| --- | --- | --- | --- | --- | --- |
| https://freesound.org/people/mickyman5000/sounds/340529/ | Ratchet_Single_Click.wav | mickyman5000 | CC0 1.0 | 0.59 s | One ratchet click from a tools pack. Trim to the transient, about 60–100 ms. |
| https://freesound.org/people/CallFlan/sounds/495238/ | Single_Ratchet-05.wav | CallFlan | CC0 1.0 | 1.06 s | One click of a ratchet wrench (other takes are in the same pack). Cut out one click and fade the tail. |
| https://freesound.org/people/Anthousai/sounds/399011/ | wrench 02.wav | Anthousai | CC0 1.0 | 0.63 s | A socket wrench twisted quickly once (Tascam DR-40, close). Take the first tooth click. |
| https://freesound.org/people/AlaskaRobotics/sounds/551497/ | ratchet socket wrench tool | AlaskaRobotics | CC0 1.0 | 1.27 s | Three quick ratchet turns (Zoom H5). Cut one turn's click. |

## give-unbolt: a bolt cracking loose

This is the weakest moment. I found no CC0 recording of a seized bolt actually breaking loose. These are the closest stand-ins.

| URL | Title | Author | Licence | Duration | Why it fits / trim |
| --- | --- | --- | --- | --- | --- |
| https://freesound.org/people/Flares.fr/sounds/524264/ | Torque wrench | Flares.fr | CC0 1.0 | 9.54 s | A torque wrench in a garage (Zoom H1). A torque wrench's break-over "clack" is the nearest thing to a bolt cracking. Cut one clack, about 150 ms. |
| https://freesound.org/people/Crinkem/sounds/481788/ | Metalic groan.wav | Crinkem | CC0 1.0 | 0.91 s | A short metal groan (a door handle). Could pass for a stuck thread letting go. Trim to about 0.3 s, or layer it under a wrench click. |
| https://freesound.org/people/Loinnats/sounds/616628/ | Socket wrench.wav | Loinnats | CC0 1.0 | 1.06 s | A socket wrench swinging back. A heavier metal clack than the turn click. Take the loudest hit. |

## give-unclip: a plastic snap

| URL | Title | Author | Licence | Duration | Why it fits / trim |
| --- | --- | --- | --- | --- | --- |
| https://freesound.org/people/slappy13/sounds/151778/ | Clip In.wav | slappy13 | CC0 1.0 | 1.00 s | A plastic buckle clip snapping (EQ'd, light room IR). Clean and short. Trim to about 0.2 s. |
| https://freesound.org/people/redpanda69/sounds/686167/ | Plastic snap | redpanda69 | CC0 1.0 | 1.27 s | Plastic snapping on plastic, slightly warped. Close to a cover clip letting go. Trim to the snap. |
| https://freesound.org/people/timtimmerson58/sounds/869580/ | Plastic break | timtimmerson58 | CC0 1.0 | 0.38 s | Plastic twisted and snapped, loud. It may sound too much like breaking, so use it only if the other two are too soft. |

## give-pull: a rubber pop

| URL | Title | Author | Licence | Duration | Why it fits / trim |
| --- | --- | --- | --- | --- | --- |
| https://freesound.org/people/CrudeWax/sounds/702880/ | Bottle rubber cap pop | CrudeWax | CC0 1.0 | 0.56 s | A rubber cap pulled off a bottle. The closest match to a hose or plug cap popping off. Little trimming needed. |
| https://freesound.org/people/cbakos/sounds/200375/ | Spray paint Cap Off.wav | cbakos | CC0 1.0 | 1.88 s | A spray-can cap pulled off. A dry plastic pop. Trim to the pop, about 0.2 s. |
| https://freesound.org/people/Firecat_the_potato_YT/sounds/549793/ | Taking Lid Off.wav | Firecat_the_potato_YT | CC0 1.0 | 1.99 s | A soda lid coming off. Use only the pop and avoid the fizz, about 0.15 s. Third choice. |

## give-scrape: a metal scrape (`slide`, `lift`)

| URL | Title | Author | Licence | Duration | Why it fits / trim |
| --- | --- | --- | --- | --- | --- |
| https://freesound.org/people/qubodup/sounds/743259/ | Short Rusty Metal Scrape | qubodup | CC0 1.0 | 0.16 s | A short rusty scrape on cast iron, already trimmed. Fits as-is. (The sibling sound 743258, "Short Rusty Metal Scrape 2", is also CC0.) |
| https://freesound.org/people/TheWandermiles/sounds/673329/ | Metallic Scrape Slide | TheWandermiles | CC0 1.0 | 1.73 s | A metal object sliding or scraping. Trim to about 0.3–0.4 s with a fade-out. Good for the tank lifting off. |
| https://freesound.org/people/WasabiWielder/sounds/323369/ | Metal Slide 2 | WasabiWielder | CC0 1.0 | 0.89 s | A metal tube sliding on a table (Zoom Q4). Trim the start. |
| https://freesound.org/people/blaukreuz/sounds/459648/ | slide_small_2.wav | blaukreuz | CC0 1.0 | 1.52 s | A small metal part sliding back, studio condenser, very clean. Lighter in tone, which suits the air filter. |

## land: a light metal or plastic clunk on the tray

| URL | Title | Author | Licence | Duration | Why it fits / trim |
| --- | --- | --- | --- | --- | --- |
| https://freesound.org/people/Jetrod/sounds/362506/ | clonk1.aiff | Jetrod | CC0 1.0 | 0.40 s | A metallic clank, already short. Fits a part dropped in a tin tray. |
| https://freesound.org/people/suspensiondigital/sounds/389705/ | Box with Metal Latches Hit 2.wav | suspensiondigital | CC0 1.0 | 0.44 s | A box with metal latches being hit. Mixed plastic and metal, so it works for every part. |
| https://freesound.org/people/Reitanna/sounds/264148/ | drop metal thing.wav | Reitanna | CC0 1.0 | 0.46 s | A small metal object dropped on a desk. It may be too light and tinkly for the tank or muffler. |
| https://freesound.org/people/Lemato/sounds/697091/ | hollow plastic box, dropped (2) | Lemato | CC0 1.0 | 0.35 s | A hollow plastic box dropped (Zoom H1n). Use this if a plastic clunk is wanted. |

## seat: a click or thunk as a part seats

| URL | Title | Author | Licence | Duration | Why it fits / trim |
| --- | --- | --- | --- | --- | --- |
| https://freesound.org/people/xkeril/sounds/815493/ | Mechanical switch (latch) 02 | xkeril | CC0 1.0 | 1.80 s | A door-latch toggle, a solid mechanical click. The author says it was recorded on an iPhone, so check for noise. Trim to about 0.2 s. |
| https://freesound.org/people/sqeeeek/sounds/381854/ | suitcase_click_open_sqeeeek.wav | sqeeeek | CC0 1.0 | 0.63 s | A suitcase latch click ("double mono"). A crisp seat click. |
| https://freesound.org/people/IanStarGem/sounds/278205/ | Switch Flip #1 | IanStarGem | CC0 1.0 | 0.98 s | A weatherproof outlet cover snapping shut (H4n). A plastic-metal thunk. |

## cord: rope pulled through the starter (trim to 0.6 s)

| URL | Title | Author | Licence | Duration | Why it fits / trim |
| --- | --- | --- | --- | --- | --- |
| https://freesound.org/people/kyles/sounds/450929/ | snowmobile lawnmower generator cord pull start | kyles | CC0 1.0 | 1.58 s | A real small-engine recoil cord pull; the author's title names generators. The best fit. Trim to the 0.6 s rope zip and fade before any engine catch. |
| https://freesound.org/people/piotrkier/sounds/700144/ | Lawnmower pulling cord 4 | piotrkier | CC0 1.0 | 0.92 s | A real lawnmower recoil pull, already nearly the right length. Trim to 0.6 s. |
| https://freesound.org/people/killianm97/sounds/554238/ | Cord String Pull 3.wav | killianm97 | CC0 1.0 | 0.38 s | A shower pull cord, not a starter. Use only as a fallback; it has no recoil whirr. |

## fail: a cough and splutter, no start

| URL | Title | Author | Licence | Duration | Why it fits / trim |
| --- | --- | --- | --- | --- | --- |
| https://freesound.org/people/kyles/sounds/450951/ | snowmobile won't start false starts lawnmower pull cord | kyles | CC0 1.0 | 22.06 s | Real recoil-start false starts, from the same recordist as the first `cord` pick, so the two should match. Cut one cough, about 0.6–1.0 s. |
| https://freesound.org/people/kyles/sounds/406892/ | water pump motor (or could be generator) sharp start stop close 1st one false start great choking catch Gaza 2016.wav | kyles | CC0 1.0 | 61.23 s | A small pump or generator engine, recorded close. The first attempt is a false start with a choking catch. Cut that cough, about 1 s. |
| https://freesound.org/people/Pagey1969/sounds/566048/ | mower with failed start.wav | Pagey1969 | CC0 1.0 | 61.18 s | A small mower that fails to start, then starts, runs and stops. Cut the failed attempt. It is probably a four-stroke. |
| https://freesound.org/people/pluralz/sounds/475816/ | MotorCycle_false_start_5 | pluralz | CC0 1.0 | 3.00 s | A motorcycle false start, made as a theatre sound effect ("badly needing repair"). Already short, but less like a generator. |

## start: a short burst of the engine running (about 2.5 s)

| URL | Title | Author | Licence | Duration | Why it fits / trim |
| --- | --- | --- | --- | --- | --- |
| https://freesound.org/people/damsur/sounds/443239/ | Chainsaw start | damsur | CC0 1.0 | 2.93 s | A real two-stroke chainsaw starting (Zoom H4n). Already about the right length. Trim any cord pull at the head and fade the end. |
| https://freesound.org/people/esperri/sounds/118971/ | Chainsaw Start.wav | esperri | CC0 1.0 | 2.82 s | A two-stroke chainsaw starting. Already about 2.5 s; fade-out only. |
| https://freesound.org/people/damsur/sounds/443240/ | Chainsaw start | damsur | CC0 1.0 | 4.95 s | Another take by the same recordist. Trim to the catch plus about 2 s of idle. |
| https://freesound.org/people/prpl.jlyfsh/sounds/625642/ | pull start engine chainsaw brushcutter | prpl.jlyfsh | CC0 1.0 | 10.01 s | A brush cutter (strimmer) pull start, a small two-stroke. Take the catch and about 2 s of run, and drop the pull. |

Also CC0 (page checked) but a weaker fit: https://freesound.org/people/Skybonator/sounds/709272/, "Honda Generator Start-Up." by Skybonator, 43.98 s. It is a real portable generator, but a Honda is most likely a four-stroke, so it sounds smoother than an ET950-type two-stroke.

## Gaps and notes

- Every moment has at least three candidates whose CC0 licence I confirmed on the sound's page.
- `give-unbolt` is a stand-in only. There is no CC0 recording of a bolt cracking loose. The owner or mechanic could record one: a spanner cracking a tight M6 bolt, which takes seconds to record.
- `cord`, `fail` and `start` are real small engines: a lawnmower or snowmobile recoil, a pump or generator, and chainsaws and a brush cutter. None is an ET950. They stay stand-ins until the owner records the real machine, as ADR 0018 expects.
- Some sources may be stereo, for example xkeril's and IanStarGem's (H4n). The Blender mixdown makes them mono anyway.
