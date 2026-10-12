# Visual references for the ET950 / TG950

Gathered on 2026-10-10 by a research agent, for the Phase 3 modelling (ADR 0013, `docs/design/modelling-brief.md`). 83 files, about 19 MB, are saved under `assets/gen950/reference/`, which git ignores. Everything here is third-party and for modelling reference only: never textures, never shipped, never republished (ADR 0013).

Video timestamps marked "approx" were read off low-resolution storyboard frames, one every 10 seconds, so they are good to about ±10 s. The agent could not watch or hear the videos.

## Summary

Found:

- No genuine Yamaha exploded diagram or service manual could be downloaded. The best substitute is the numbered exploded view of a clone of the same engine and body (PowerSmart PS50, 63 cc, 85 parts).
- A second clone manual (GG950) with line drawings of the machine, fuel tap, choke, switch, recoil, air filter and plug service.
- Whole-machine photos of the Tiger TG950 and look-alikes from Nigerian listings, and the official Yamaha ET-1 image.
- Per-part photos, many with measurements, for most of the 12 parts.
- Teardown and repair videos of a genuine Yamaha ET950 and of Tiger TG950s, with approximate timestamps.
- Wear references from Lagos listings.

Biggest gaps:

- No Yamaha parts catalogue with pictures (two scanned copies exist on Scribd and PDFCoffee but could not be fetched).
- No photo of the air filter foam or of a stand-alone air filter cover.
- No photo of a carbon-caked exhaust outlet or a fuel-stained machine up close.
- No genuine Yamaha spark plug model; only clone F-series plugs.
- Several sites blocked downloading (eBay, Newegg galleries, manuals.plus, PDFCoffee and others); those are links only.

## What the references change for the model

These are the points a modeller needs first. Where they touch the game's content they are listed in `docs/open-questions.md`, not acted on.

- **Colour.** The machine is blue and black, not red: a royal blue tank (Yamaha) or brighter blue (Tiger) over a black body and black recoil cover, black rubber feet. The red tank in the Phase 2 placeholders is wrong.
- **No tube frame.** The base is the die-cast aluminium crankcase and alternator housing with its feet, four rubber mounts, and a pressed-steel and plastic body shell under the overhanging tank. `base_frame` should model that, not a tube frame. The modelling brief's material row for a powder-coated frame tube does not apply.
- **The tank is the lid.** The fuel tank is one shallow blue shell, about 330 × 279 × 127 mm, carrying the handle and filler cap, held by screws, lifting off whole.
- **Layout.** Facing the control panel: recoil starter cover and pull handle on the right; the round alternator end on the left; cylinder head, spark plug and muffler with its slotted heat shield on the back.
- **Markings.** Yamaha: white decal band with "YAMAHA ET-1" lettering. Tiger: white decal with red "TIGER" and "TG 950 GENERATOR". Per ADR 0013 and the modelling brief, the model uses plain panels or our own markings, not these.

## Exploded diagrams and manuals

Saved in `diagrams/`.

1. **PowerSmart PS50 manual**, 1000 W two-stroke clone, with exploded view and 85-item parts list. https://images.homedepot-static.com/catalog/pdfImages/d7/d787e2cc-a276-41ca-8fa3-169455b02ffd.pdf. Saved as `powersmart-ps50-1000w-2stroke-manual-homedepot.pdf` and `powersmart-ps50-exploded-view-items-1-85-rotated.png`. Shows tank (73) with tap (74), handle (78) and cap (77); panel moulding (71) with a capacitor (81) beside it; carburetor (69) with intake gaskets and reed valve (64, 65); cylinder (44), head cover (37), cylinder cap (42); muffler (15) and gasket (14); recoil (53); flywheel (52); ignition coil (56); rotor and stator (16, 17); crankcase halves (19, 50); rear cover (9); breaker (5); DC socket (8); rubber mounts (59, 62). Same design as the ET950, not guaranteed identical.
2. **GG950 / GG1000 clone manual.** https://pdf.lowes.com/productdocuments/fedc453f-036d-4ee8-b22b-1aa701eb26a2/67077687.pdf. Saved as `gg950-clone-manual-lowes.pdf` plus page images (`gg950-manual-img01…`, `img06`, `img07`, `img12` here; `img04`, `img10`, `img14`, `img15` in the part folders). Shows the outline, the fuel tap under the tank with ON/OFF lever, a sliding choke on the panel, a rocker switch, the recoil handle on the right-hand cover, the foam air filter, and a strainer inside the tank.
3. **Yamaha ET-1 product page**, the only official Yamaha page found. https://global.yamaha-motor.com/business/pp/generator/lineup/220v-50hz/0-1/et-1/. Image saved as `whole/yamaha-et1-official.jpg` (400 × 380).
4. **Leads not opened:** ET650/ET950 parts catalogue scans at https://pdfcoffee.com/yamaha-et650-pdf-free.html and https://www.scribd.com/doc/281888564/7CE2-ET950-desbloqueado; a text-only clone catalogue at https://www.scribd.com/document/922375069/Gasoline-Generator-ET950-Parts-Catalog; genuine parts by number at https://www.cmsnl.com/yamaha-generator_model16639/ (carburetor 7CE-E4101-00, https://www.cmsnl.com/products/carburetor-assy-1_7cee410100/); a printed workshop manual at https://www.ebay.com.au/itm/177425138879. Ignore https://archive.org/details/yamaha-portable-engine-generator-owners-manual, which is a 1982 EF-series manual.

## Whole machine

Saved in `whole/`.

| File | Shows | Source |
| --- | --- | --- |
| `yamaha-et1-official.jpg` | Yamaha ET-1, front-right and front-left, two decal variants | https://global.yamaha-motor.com/business/pp/generator/lineup/220v-50hz/0-1/img/ET-1.jpg |
| `tg950-williamdoshi-listing.jpg` | Clean 3/4 front-right view of a Tiger TG950, 700 × 700 | https://williamdoshi.com/tiger-gasoline-generator-tg950.html |
| `tiger-tg950-new-in-shop-jiji-ojo-lagos.webp` | Shop display, front-right | https://jiji.ng/ojo/power-equipments/tiger-tg950-portable-generator-compact-reliable-easy-to-use-86tdsTBwgCE9lvgf8tt3ml0L.html |
| `tiger-tg950-front-panel-used-jiji-ikorodu-lagos.webp` | Used TG950, front panel | https://jiji.ng/ikorodu/power-equipments/tiger-generator-xtQqhVt3tZD2JKu9ljjanTNR.html |
| `sodifer-950-yellow-front-panel-jiji-ikeja.webp` | Clearest front panel: socket, label, breaker, rocker switch, choke, lower door, recoil handle | https://jiji.ng/ikeja/power-equipments/so-di-fer-2-0hp-i-pass-my-neighbor-generator-5P9Kr9sgqSM9U9uHgyTFwlTm.html |
| `tg950-recoil-cover-side-label-worn-jiji-enugu.webp` | Right side, recoil vents, rating label, rusty bolts | https://jiji.ng/enugu-north/power-equipments/tiger-tg-950-small-petrol-generator-portable-and-reliable-to-use-ASVoJri1U9FfqB4gQhOmUQSv.html |
| `tiger-small-used-top-view-tank-handle-cap-jiji-nsukka.webp` | Top view, tank, handle, cap | https://jiji.ng/nsukka/power-equipments/tiger-generator-isWYjTeIrZxzhFLdtJjZS8bq.html |
| `tiger-tg1550-blue-front-left-jiji-ojo.webp` | Panel close-up, warning plate, reset button, lower door | https://jiji.ng/ojo/power-equipments/petrol-generator-pU01S1ho5r7eAPLuaIeWv0Gn.html |
| `tiger-tg1580-…`, `tiger-tg1400-…` | "Ti987" Tiger clones common in Nigeria | https://jiji.ng/ajah/power-equipments/tiger-generator-petrol-gvPD5YNwn0Qskis4KQJ4KS0.html, https://jiji.ng/ifako-ijaiye/power-equipments/tiger-generator-1e7jkgswyqeRMzcP8vavMcvK.html, https://www.jumia.com.ng/tiger-potable-power-generator-419773438.html |
| `tg950-blue-black-with-alternator-cover-yt-OmTg7tmU4JQ.jpg`, `tiger-tg950-front-recoil-handle-yt-URNx5eZkKr4.jpg` | Video thumbnails, alternator side and front-right | YouTube, see Videos |
| `tiger-tg1550-carton-line-drawing-jiji-awka.webp`, `tg1580-carton-line-drawing-jiji-wuse.webp` | Carton line drawings, useful as outlines | Jiji |

Colours: Yamaha has a royal blue tank (pink-red primer underneath, seen in a restoration video), a black body and recoil cover, a white decal band and black feet. Tiger has a brighter blue lid with a white decal. Older units have a silver metal filler cap, newer clones a blue plastic one. The alternator end casting is raw silver aluminium with a green-yellow earth wire. The panel and lower door are black plastic.

## Per part

Sizes come from seller photos and are approximate. Files are in the folder named after the part.

**fuel_hose.** Plain black rubber, about 6 mm bore, 200 to 250 mm, in a quarter curve, wire or spring clips, from the tap barb to the brass nipple on the carburetor. `et950-fuel-hose-black-with-wire-clip-amazon.jpg`. https://www.amazon.com/dp/B00ZZOYJP8, https://www.amazon.com/dp/B01M8GVLGN.

**fuel_tap.** Cast silver body, flat lever stamped ON/OFF on two screws, side hose barb, threaded stem with hex nut, white plastic strainer tube inside the tank. 65 to 77 mm long. Two head sizes exist. Screwed into the underside of the tank. Six files including caliper and in-hand photos. https://www.amazon.com/dp/B0G3B3DQZ7, https://www.amazon.com/dp/B0H6FLFNRV.

**fuel_tank.** Pressed sheet steel, gloss blue, about 330 × 279 mm in plan and 127 mm deep, flange foot 324 mm. Underside: two side flanges with bolt holes, two domes at the back, a boss for the tap at one corner. Top: round filler neck and cap, black handle on two or three bolts. Five files. https://www.amazon.com/dp/B0HLKTQ2W1.

**air_filter_cover.** No stand-alone photo. Best candidate is the lower front door of the panel moulding: black textured plastic, a recessed grip on the right, one round and two small holes on the left. The GG950 manual shows that compartment opened to reach the filter. That this door is the filter cover is an inference. `et950-lower-front-cover-door-3-holes-and-grip-aliexpress.webp` (watermarked). https://www.aliexpress.com/item/1005013366067460.html.

**air_filter.** A rectangular foam block with a notch, sliding out of a compartment beside a rectangular air inlet. Only the manual drawing: `gg950-manual-img15-air-filter-foam-element-and-compartment.jpg`.

**carburetor.** Aluminium body, round steel float bowl (plated or bare) on one central bolt with a brass drain screw, bent brass fuel nipple, zinc-plated linkage bracket, two brass adjusting screws with springs, flat two-hole flange with holes about 37 mm apart and a 16 mm bore. Seven files. https://www.amazon.com/dp/B00ZZOYJP8, https://www.amazon.com/dp/B01M8GVLGN, https://www.amazon.com/dp/B0FLCS6X1F.

**plug_cap.** One-piece black rubber right-angle boot moulded onto a black HT lead about 35 cm long, running to a small coil block marked "SH 950". Five files. https://www.amazon.com/dp/B0BTZYJM3L, https://www.amazon.com/dp/B07D57D3TM, https://www.amazon.com/dp/B0D5ZJ3LGS.

**spark_plug.** Standard 14 mm plug, about 80 mm long, 18 mm reach, short white insulator, nickel body with hex and crush washer, bent side electrode, gap 0.7 to 0.8 mm. Clone kits show F7TC. Three files. https://www.amazon.com/dp/B0BTZYJM3L.

**recoil_starter.** One large black pressed-steel cover, a rounded wedge about 290 mm long and 200 mm high, with a round reel housing and a ring of radial slot vents about 180 mm across, three or four bolt ears, black T-handle on a short cord leaving at the front right. Inside: cream plastic reel 83 mm across, flat coil spring, tan pawl, silver cup. Eleven files with measurements. https://www.amazon.com/dp/B07HK95R7R, https://www.amazon.com/dp/B0CP5ZB7MP, https://www.amazon.com/dp/B0HMFJFHT9, https://www.amazon.com/dp/B0HKS234PV.

**muffler.** Black matt steel box about 162 × 156 mm with raised ribs, angled inlet pipe with a two-slot flange (about 49 mm), a tab, an outlet at one corner with a mesh spark guard and clamp. A flat black heat shield with rows of rounded slots sits over it, bolted with it to the cylinder. Used ones rust orange-brown with black burn marks. Five files. https://www.amazon.com/dp/B0HL84DPK7.

**alternator_cover.** Raw silver die-cast aluminium. A shallow round end plate with a cross of four slots and a green-yellow earth wire at its top, in a square-ish rim that carries the feet. Inside: a deep cup with spokes and a bearing boss. Four files. https://www.amazon.com/dp/B0H8SYWFL8, https://jiji.ng/amuwo-odofin/power-equipments/tiger-generator-1-5-kva-100-copper-coin-5XZ5UboDlSqgwboc7qhDtDct.html, https://jiji.ng/ejigbo/power-equipments/original-tiger-generator-100-copper-coil-czPHYTBCw151yHEpMq2kMM0L.html.

**capacitor.** One listing shows a black rectangular CBB61 box, 24 µF 350 VAC, 58 × 40 × 28 mm, two spade terminals and a mounting stud (variants 10 to 25 µF). A Nigerian video shows a round cream cylinder instead. Two files. https://www.amazon.com/dp/B0FVGK5S1J. The 12 µF figure in the reference pack comes from a four-stroke generator and should not be used.

**base (frame, engine, alternator housing, panel).** No tube frame. Die-cast crankcase and alternator housing with feet, rubber mounts, a pressed-steel and plastic body. Raw aluminium cylinder with horizontal fins, studs and nuts to the crankcase, a square exhaust flange with two studs, a plastic or tin shroud over the head with a cut-out for the plug. The panel is one black plastic moulding with socket, breaker, switch, sliding choke and the lower door. Files in `engine_block/` and `control_panel/`; `frame/` is empty.

## Videos

| URL | Title | What it shows |
| --- | --- | --- |
| https://www.youtube.com/watch?v=6B6SuOBrzSQ | Restoration Old Generator YAMAHA ET950 #1 (28:06) | Genuine ET950. Approx: 2:10 tank lid lifted; 2:20–3:10 engine bay; 3:20–4:00 recoil cover off; 4:10–5:20 head and cylinder; 11:10–12:20 carburetor; 15:50 plug; 18:30–19:20 muffler with slotted shield; 19:30–20:40 tank repaint. |
| https://www.youtube.com/watch?v=xWBlBdYYExo | Restoration … #2 (17:03) | Reassembly. Approx 5:50 muffler and shield; 6:40–8:10 panel wiring with a covered box that may be the capacitor; 14:30 test run. |
| https://www.youtube.com/watch?v=OmTg7tmU4JQ | TG950 servicing, Benco Institute (26:56) | Approx 2:40–3:40 tank lid screws out and lifts off whole; 8:20–9:50 muffler off the cylinder with carbon on the port. |
| https://www.youtube.com/watch?v=Of2ahzbLMQA | How to service small Tiger generator, OT Gen Solution (24:20) | Nigerian. Approx 2:30–3:20 plug removed with the tank still on; 4:20–5:40 cylinder off. |
| https://www.youtube.com/watch?v=-zx06P-KMEM | No or low voltage, Benco (7:44) | Approx 2:35–4:05 tank lid lifted, a round cream capacitor pulled from the wiring and tested. |
| https://www.youtube.com/watch?v=twzVBlYlsLk | Fix recoil starter TG950, Benco (10:51) | Recoil spring. |
| https://www.youtube.com/watch?v=URNx5eZkKr4 | TG950 starter rope does not return, Benco (6:57) | Recoil. |
| https://www.youtube.com/watch?v=LKtGcXR2btU | The Yamaha ET950 Challenge (24:35) | ET950 in 0:00–5:11. |
| https://www.youtube.com/watch?v=qqOMMispZOg | Restoration of an abandoned ET950 (38:37) | Thumbnail only, heavy wear. |

Not reviewed: https://www.youtube.com/watch?v=tIyQfSBeFeo (carburetor rebuild), https://www.youtube.com/watch?v=pO6qMQkXuDY (ignition coil), https://www.youtube.com/watch?v=mu99NCt5Flg ("Tiger" embossed on a genuine tank), https://www.youtube.com/watch?v=IJZAS8QrUZk, https://www.youtube.com/watch?v=hpeGOuBJ8lA, https://www.youtube.com/watch?v=FArehMDziSc, https://www.youtube.com/watch?v=M28Gfva2kqE, https://www.youtube.com/watch?v=K-WC_wzrXLI, https://www.youtube.com/watch?v=7lsardooPZE, https://www.youtube.com/watch?v=wdu6pmKV_O0.

## Wear and Lagos context

Saved in `wear/`:

- `tiger-tg950-used-rusted-muffler-shield-dirty-jiji-ipaja-lagos.webp`: chipped blue paint and rust at the tank edge, dull scratched cap, dusty oily plug shroud, heat shield rusted orange-brown with burn marks, rusted bolts. https://jiji.ng/ayobo-ipaja/power-equipments/tiger-generator-45dkbTSpSIR6yuyDma7IKKSK.html
- `tiger-tg950-used-dust-oil-grime-jiji-ikorodu-lagos.webp`: general grime.
- `yamaha-et950-before-after-…-yt-….jpg`: the same ET950 caked in mud and grease, then cleaned.
- `yamaha-et950-abandoned-overgrown-…`, `yamaha-clone-rusted-red-cover-…`: heavy rust, beyond the "working machine" look in the modelling brief.
- `lagos-barbershop-use-gen-scene-jumia-ng-possibly-ai-generated.jpg`: mood only; it looks AI-generated.

The machine is sold as "I pass my neighbour", from about ₦30,000 used to ₦150,000 new on Jiji. Background: https://nigerianqueries.com/tiger-generator-prices-in-nigeria/, https://leadership.ng/things-remembered-the-waning-fortune-of-i-pass-my-neighbour-generator/.

## The mechanic's hand (plan 0008)

Saved in `assets/hand/reference/` (git-ignored).

- `mechanic-dirty-hands-at-work-1-dvids-pd.jpg`: a mechanic showing greasy hands, public domain (US DVIDS, via Wikimedia Commons, "Soldier in Focus, Mechanic gets dirty on the job"). Used for where grease gathers: fingertips, palm creases, along the fingers.
- `hand-dorsal-anatomical-commons-ccbysa4.jpg`: turned out to be a line drawing; of little use.

Proportions come from standard adult hand measurements. Photos of a Lagos mechanic's hands, open and gripping, would be the right reference.

Since plan 0009 the hand's shape and proportions come from MakeHuman's CC0 base body (MPFB 2.0.18, ADR 0016), made as an adult Nigerian man with a working build; sources and licences are in `assets/hand/LICENCE.md`. The photos above are still used for the grease. Photos of a Lagos mechanic's hands, open, gripping and pinching, remain the best check.

## The customers (plan 0015)

Local copies in `assets/customers/reference/` (git-ignored, reference only). Every one shows identifiable people: used for clothing, colour and build only, never for a face, never as a texture (ADR 0013, ADR 0015). Gathered 2026-10-11 from Wikimedia Commons; file pages are `https://commons.wikimedia.org/wiki/File:<name>`. Seven downloads were cut short by network timeouts and are missing the bottom of the image, marked "partial".

| Local file | Commons file | Shows | Author | Licence |
| --- | --- | --- | --- | --- |
| `woman_market-1.jpg` (partial) | `Market_women_at_Ipata_market.jpg` | Ipata market, Ilorin. Seated women in matching green Ankara top, wrapper and head tie; a multicolour wax-print wrapper. Sturdy builds. | Ee nn yy | CC BY-SA 4.0 |
| `woman_market-2.jpg` (partial) | `A_fairly-used_clothes_seller_in_Lagos_Nigeria.jpg` | Lagos clothes seller, full body: a woman of about 50 in a matching blue-and-white print blouse, long wrapper and head tie. The closest to `woman_market`. | Oreoluwa Adetimehin | CC BY-SA 4.0 |
| `woman_market-3.jpg` (partial) | `A_snacks_seller_in_Lagos,_Nigeria.jpg` | Lagos snack stall: print blouse, long print skirt, sandals; a scarf head tie and slippers. | Oreoluwa Adetimehin | CC BY-SA 4.0 |
| `woman_market-4.jpg` | `Women_selling_in_the_market.jpg` | Market under umbrellas: a red print blouse; a standing woman in a dark head tie and apron. | Eboysmart61 | CC BY-SA 4.0 |
| `man_kaftan-1.jpg` | `OLD_MAN_PRAYING_IN_EID.jpg` | An older bearded man seated, plain white long kaftan over trousers, patterned fila cap. | Oluwalogbon2002 | CC BY 4.0 |
| `man_kaftan-2.jpg` | `A_Yoruba_and_Hausa_Man_in_traditional_attire.jpg` | Two young men standing: a plain brown long jalabia; a print top and trousers with a matching cap. | Pablowhite44 | CC BY-SA 4.0 |
| `man_kaftan-3.jpg` (partial) | `Hausa-_man.jpg` | Northern market: older men in blue-purple and brown kaftans with embroidered kufi caps. | AgnesAbah | CC0 |
| `man_young-1.jpg` | `Commercial_bike_rider_in_lagos_Nigeria.jpg` | Two young men on an okada: dark T-shirt, short-sleeved shirt, jeans, slim builds. | Olasunkanmiariyo | CC BY-SA 4.0 |
| `man_young-2.jpg` | `Kaduna_State_Football_02.jpg` | Young men in stadium stands (Kaduna): football jerseys, plain T-shirts, slim builds. | Anasskoko | CC BY-SA 4.0 |
| `man_young-3.jpg` (partial) | `An_okada_rider_with_two_passengers_in_lagos,_nigeria.jpg` | Okada with three young men in Lagos: striped jersey, print shirt, black T-shirt, jeans, slides. | Oreoluwa Adetimehin | CC BY-SA 4.0 |
| `street-1.jpg` (partial) | `A_fruits_seller_in_Lagos_Nigeria.jpg` | Lagos roadside fruit stall: people standing, a print dress, work clothes. | Oreoluwa Adetimehin | CC BY-SA 4.0 |
| `street-2.jpg` (partial) | `Bus_stop_in_Lagos.jpg` | Lagos bus stop with a danfo: men standing in white kaftans and caps, full body, small in frame. | Oritsetsemaye Jemide | CC BY-SA 4.0 |
| `street-3.jpg` | `A_food_seller,_seller_food_to_people_in_Lagos_Nigeria.jpg` | Food stall on a dirt road: casual T-shirts, jerseys, wrappers. | Oreoluwa Adetimehin | CC BY-SA 4.0 |

Gaps: no clean standing full-body photo of a woman of about 50 in an everyday wrapper, blouse and head tie; of a man of about 55 in a plain kaftan and cap; or of a young man in a T-shirt, jeans and slides. Photos the owner takes, or ones he chooses, would be the best check. The people's shape and proportions come from MakeHuman's CC0 base body; sources and licences are in `assets/customers/LICENCE.md`.

### The cap (round 8, 2026-10-12)

Gathered after the owner wrote "it is worse. the cap is too big for his head, search the web for humans with that kind of cap and fix the cap". Local copies in `assets/customers/reference/caps/` (git-ignored), from Wikimedia Commons, used only to measure the cap's shape and proportion against the head. The measurements are in `assets/customers/STATUS.md` round 8.

| Local file | Commons file | Shows | Author | Licence |
| --- | --- | --- | --- | --- |
| `cap-15.jpg` | `Muhammadu_Buhari,_President_of_the_Federal_Republic_of_Nigeria_(cropped).jpg` | An older man, front, in an embroidered hula with a white kaftan. The clearest front view. | Bayo Omoboriowo | CC BY-SA 4.0 |
| `cap-16.jpg` | `Mike_Pompeo_with_Muhammadu_Buhari_in_New_York_City_-_2018_(44974167761).jpg` | The same kind of cap with a long brown kaftan, seated, small in frame. | U.S. Department of State | Public domain |
| `cap-04.jpg` | `Sheikh_Tahir_Yakasai_during_a_Kano_Emirate_gathering.jpg` | Left half: a young man in Kano, front, in a tall embroidered zanna with a kaftan. | Sheikh Gwani Tahir Yakasai | CC BY 4.0 |
| `cap-05.jpg` | `A_Hausa_man_wearing_a_traditional_kaftan_and_holding_a_ceremonial_royal_staff,_symbolizing_Hausa_cultural_heritage_and_traditional_authority,_at_the_ABU_Zaria_Cultural_Carnival.jpg` | A man in a kaftan and embroidered cap, full body, front. | Halima Waziri | CC BY-SA 4.0 |
| `cap-09.jpg` | `Alhaji_Abubakar_Tafawa_Balewa.jpg` | An elder in white babban riga and a small embroidered cap, tilted back. | Unknown author | Public domain |
| `cap-10.jpg` | `Abubakar_Tafawa_Balewa_(1962).jpg` | The same man seated, a plain white rounded cap. | Abubakar | CC BY-SA 3.0 |
| `cap-06.jpg` | `Hausa_Traditional_Cap.jpg` | Caps for sale on stands: straight sides, flat or slightly domed crowns, a knob on some. | Dev ammar | CC BY-SA 4.0 |
| `cap-02.jpg` | `Traditional_cap_in_the_northan_Nigeria.jpg` | A cream cap with brown woven pattern, close up, the crown folded in. | Muhaishaq4 | CC BY-SA 4.0 |
| `cap-07.jpg` | `Hausa_Cap.jpg` | Caps for sale in Daura. | Gwanki | CC BY-SA 4.0 |
| `cap-11.jpg`, `cap-08.jpg` | `A_Yorùbá_man.jpg`, `Man_in_traditional_attire_standing.jpg` | Yoruba fila (soft, folded): a different cap, kept for contrast. | IamMKO; Zaynab05 | CC BY-SA 4.0 |

Downloaded and not used (no cap worn, or a turban): `cap-01`, `cap-03`, `cap-12`, `cap-14`, `cap-17` to `cap-19`.

### Footwear (round 9, 2026-10-12)

Gathered after the owner wrote "Also lets give everyone of them footware. The sandals on tunde's leg looks more like shadow". Local copies in `assets/customers/reference/feet/` (git-ignored).

| Local file | Commons file | Shows | Author | Licence |
| --- | --- | --- | --- | --- |
| `feet-01.jpg` | `Array_of_Rubber_Slippers,_Badagry.jpg` | A wall of rubber slides for sale in Badagry, Lagos State: dark soles, broad straps, many with white or red straps. For Tunde. | Amboluwaseun | CC BY-SA 4.0 |
| `feet-02.jpg` | `Rubber_Slippers.jpg` | Rubber and plastic slippers for sale at a Lagos market (Mile 12): flat soles, wide bands, black, red, patterned. For Mama Ngozi. | Zubaidabta12 | CC BY-SA 4.0 |
| `feet-03.jpg` | `Market_Lady,_Lekki,_Lagos.jpg` | Market women in Lekki, Lagos: a woman in a print dress wearing flat brown strap sandals. | Oritsetsemaye Jemide | CC BY-SA 4.0 |
| `feet-04.jpg` | `The_Market_women_at_Oshodi_Lagos.jpg` | Oshodi market from above: a man in a white kaftan and cap with dark closed shoes; women in slippers. | Agbebiyi Adekunle (Tadek Photography) | CC BY-SA 4.0 |
| `feet-06.jpg`, `feet-07.jpg` | `Choice_of_slippers_(2183385831).jpg`, `Babouches02.jpg` | Babouche slip-on mules (Morocco): the closed-toe, open-heel leather slipper shape worn with kaftans across West Africa too. For Alhaji Musa. | Lars Plougmann; Kattiel | CC BY-SA 2.0; CC BY-SA 4.0 |
| `feet-08.jpg` | `Abdullahi_Bayero,_Emir_of_Kano.jpg` | The Emir of Kano in ceremonial dress and slippers (ceremonial, not everyday). | E. H. Duckworth | Public domain |

Gap: no clear photo of an older Lagos man's everyday leather slippers under a kaftan; the mule shape is taken from the babouche photos and is a reading, not a match.
