# More faults for small 2-stroke portable generators (ET950 and clones)

Research for the "Open Am" roadside mechanic game. Scope: Yamaha ET950 and clones (Tiger TG950, Elepaq, Sumec), 63 cc two-stroke, recoil start, 50:1 premix, magneto/CDI ignition, float carburettor, capacitor-excited alternator.

## Method and limits (read first)

- Sources were web search results (summaries and page excerpts). I did not open most pages in full, so details are as reported by the search snippet.
- **Not found:** an ET950 service manual, any clone service manual, any YouTube video description, and any Nigerian or Ghanaian repair post that describes a specific generator fault. The Lagos evidence is limited to news reporting on contaminated petrol (affects cars, not generators) and directory listings for repair shops.
- Most generator-specific sources are forum posts, parts-seller blogs, or US/Honda/Champion/Generac material. Where a source is about a Briggs, Tecumseh, lawnmower, boat outboard or automotive part, I say so. Applying it to an ET950 clone is an inference and is marked.
- Frequency ratings ("common / occasional / rare") are my estimate unless a source states a rate. None of the sources gave a rate, so every rating below is an estimate and should be treated as unverified.
- Where a fault duplicates or is a cause of an existing game fault, that is stated.

## Summary table

| # | id | Short name | Customer's words | Part(s) | Overlap with existing fault | Frequency (estimate) | Loop fit |
|---|----|-----------|------------------|---------|-----------------------------|----------------------|----------|
| 1 | water_in_fuel | Water in petrol | "Starts then dies, puffs white smoke" | Fuel tank, bowl | none (cause) | common | Medium: drain/refill action |
| 2 | contaminated_petrol | Bad / adulterated petrol | "I bought fuel from the station, now it won't run" | Tank, carburettor | overlaps 1 and clogged_jet | common (Lagos news) | Low: not a part fault |
| 3 | wrong_oil_mix | Wrong premix ratio | "Smokes, plug is black and wet" | Tank (mix), plug | cause of fouled_plug | common | Medium: remix action |
| 4 | fuel_cap_vent_blocked | Blocked fuel cap vent | "Runs five minutes, dies, starts again after I open the cap" | Fuel cap | none | occasional | High |
| 5 | fuel_filter_or_pickup_blocked | Blocked fuel filter / tank pickup | "Dies after 10 to 20 minutes, slow restart" | Fuel hose, in-line filter, tank screen | overlaps blocked_fuel_tap | occasional | High |
| 6 | float_stuck_or_needle_leak | Float stuck / needle not seating | "Smells of petrol, black smoke, floods, drips after stopping" | Carburettor float bowl | distinct from clogged_jet | common | High |
| 7 | choke_stuck | Choke stuck or misadjusted | "Runs rich, hard to start when warm" | Carburettor choke | overlaps 6 | occasional (unverified) | Medium |
| 8 | governor_hunting | Governor linkage binding / weak spring | "Surges, lights flicker, speed hunts" | Carburettor linkage, governor spring | none | occasional | Medium: adjust action |
| 9 | recoil_rope_or_spring | Recoil rope or spring | "Cord won't retract / snaps / hard to pull" | Recoil starter | none | common | High |
| 10 | ignition_coil_or_magneto | Weak or no spark (coil / magneto) | "Won't start, spark is weak" | Plug cap, plug, new: coil/CDI and flywheel | overlaps fouled_plug (test) | occasional | Medium: needs spark test |
| 11 | kill_wire_shorted | Kill wire shorted to frame | "Won't start, switch seems fine" | Kill switch wire, plug cap | overlaps 10 | occasional | Medium |
| 12 | low_oil_sensor_stuck | Low-oil shutoff sensor | "Full oil but it won't start" | Oil sensor (new part) | none | occasional (unverified for ET950) | Low: may not exist on ET950 |
| 13 | reed_valve_leak | Reed valve damaged / leaking | "Hard to start, runs rough, lean-feeling" | Reed block, carburettor gasket | overlaps 6 (symptoms) | occasional | Low: needs leak test |
| 14 | crank_seal_leak | Crankcase seal leak | "Starts cold, not hot" | Crankcase seals, flywheel | overlaps 13 | occasional | Low: needs engine split |
| 15 | weak_capacitor_low_output | Weak capacitor (runs, low voltage) | "Runs but lights are dim, only about 25 V" | Capacitor | variant of dead_capacitor | occasional | High with a test action |
| 16 | overload_breaker_trip_avr | Overload trip / AVR fault | "Trips when I run the fridge" | Breaker, AVR (clones only), output | none | common (estimate) | Low: needs measurement |
| 17 | overheating_dirty_fins | Overheating from dirty fins / shroud | "Dies after running, hot to touch" | Cylinder fins, shroud, fan | overlaps dirty_air_filter (airflow) | common (dusty sites) | Medium: needs shroud removal |
| 18 | brushes_slip_rings_worn | Worn brushes / slip rings | "Power dies, no voltage" | Brushes, slip rings (clones with brushes only) | overlaps dead_capacitor | rare (estimate) | Low |
| 19 | worn_rings_low_compression | Worn rings / scored cylinder | "Hard to kick, loses power" | Piston rings, cylinder | none | occasional | Low: teardown |

Overlap with existing faults: `clogged_jet` (stale fuel is its usual cause), `fouled_plug` (wrong premix and misfiring both foul plugs), `dirty_air_filter` (airflow), `blocked_fuel_tap` (filter and pickup faults overlap), `dead_capacitor` (weak capacitor is a milder variant), `choked_muffler` (already covers exhaust carbon, so it is not repeated here).

---

## Fault sections

### 1. water_in_fuel: Water in petrol
- **Symptoms:** sputters, won't start, white smoke or steam from exhaust, runs then stops.
- **Parts:** fuel tank, fuel hose, float bowl (water settles there and in the tank).
- **Diagnosis:** look for separation in a sample of fuel in a clear jar (water sits at the bottom). Check the tank and bowl for water.
- **Fix:** drain tank and bowl completely, refill with fresh dry fuel, clean the bowl if residue is present.
- **Frequency:** common (general sources). Lagos-specific rate: not verified.
- **Loop fit:** medium. The fix is a drain action, not a part swap. The game would need a "drain" step on the tank or bowl.
- **Sources:** https://auroragenerators.com/blog/podcast/portable-generator-will-not-start/
- **Confidence:** medium (general engine source, not a 2-stroke or ET950 manual).

### 2. contaminated_petrol: Bad or adulterated petrol
- **Symptoms:** customer says the fuel is new but it won't run. Other symptoms overlap with water and varnish (sputter, no start, black smoke, bowl gummed).
- **Parts:** tank, carburettor jets and bowl, possibly fuel filter.
- **Diagnosis:** smell and colour of fuel, check for a dry tank that was refilled from a bad drum; drain and compare.
- **Fix:** drain tank and bowl, refill from a different source, clean the carburettor.
- **Frequency:** common in Lagos per news reporting, but the reporting is about vehicles and does not name generators.
- **Loop fit:** low. This is a consumable problem, not a part fault. Better as a cause that makes clogged_jet or water_in_fuel appear.
- **Sources:** https://gazettengr.com/special-nnpcs-contaminated-fuel-imports-leave-trail-of-destroyed-livelihoods-across-lagos/ (news only; reports fuel damage to a car fuel pump). Generator-specific symptoms: **not verified**.
- **Confidence:** low for generator symptoms; high that adulterated petrol is reported in Lagos.

### 3. wrong_oil_mix: Premix too rich or too lean
- **Symptoms:** smoke (blue or white), black wet plug, misfire, poor power. Too lean: overheating and seizing risk.
- **Parts:** fuel tank (mix is in the tank), spark plug.
- **Diagnosis:** check the mix written on the can or the mix ratio the customer used; plug colour.
- **Fix:** drain tank, remix at the manual's ratio (the 50:1 in the game), replace or clean the plug.
- **Frequency:** common (general sources). The 50:1 ratio is the game's own assumption; I did not verify it against an ET950 manual.
- **Loop fit:** medium. Overlaps `fouled_plug`. Could be a cause of fouled_plug rather than a separate part fault.
- **Sources:** https://vpracingfuels.com/blogs/tech-articles-1/my-2-stroke-engine-is-running-rough-could-it-be-the-oil ; https://marineengine.com/boat-forum/threads/fouled-plugs-due-to-incorrect-oil-mixture.464700/
- **Confidence:** medium. The first is a fuel-company article, so it is promotional in part.

### 4. fuel_cap_vent_blocked: Blocked fuel cap vent
- **Symptoms:** runs for a few minutes, dies, starts again after the fuel cap is loosened.
- **Parts:** fuel cap (vent hole).
- **Diagnosis:** run the engine until it dies, then loosen or open the cap. If it recovers, the vent is blocked.
- **Fix:** clear the vent (pin or compressed air), or replace the cap.
- **Frequency:** occasional (estimate). Sources describe it but give no rate.
- **Loop fit:** high. The cap is an external part, and the test is simple. Fits as a removable part before the tank.
- **Sources:** https://www.airforums.com/threads/generator-shutdown.1254661/ ; https://bobistheoilguy.com/forums/threads/igen2500-generator-engine-not-running-with-fuel-cap-installed.335564/latest
- **Confidence:** medium (Honda and Generac forum evidence; not ET950 specific).

### 5. fuel_filter_or_pickup_blocked: Blocked fuel filter or tank pickup screen
- **Symptoms:** runs well for 10 to 20 minutes then dies, restarts after a rest, hard to start.
- **Parts:** fuel hose, in-line fuel filter (new part, not in game), tank pickup screen or sediment bowl screen.
- **Diagnosis:** remove the hose at the carburettor and see if fuel flows freely into a bucket. Check the filter and the tank screen.
- **Fix:** clean or replace the filter, clean the tank screen, check the shut-off.
- **Frequency:** occasional (estimate).
- **Loop fit:** high. A new "fuel filter" part sits between the hose and the tap. Note the overlap with `blocked_fuel_tap`: the tap is the valve, and this is the filter or pickup. They must be distinct.
- **Sources:** https://community.goodsam.com/discussions/motorhomesforum-board/onan-generator-shuts-down/574267/replies/574269 ; https://www.tractorbynet.com/forums/threads/fuel-starvation-problem.38468 (tractor forum, applied by analogy)
- **Confidence:** medium. The Good Sam post is a single anecdote, and the timing ("10 to 20 minutes") is that poster's report.

### 6. float_stuck_or_needle_leak: Float stuck or needle not seating
- **Symptoms:** floods, black smoke, fuel smell, fuel drips after stopping, hard to start (flooding), rough running.
- **Parts:** carburettor float bowl, float, needle and seat.
- **Diagnosis:** remove the bowl and check the float is free to move and the needle seats. Check for debris on the needle.
- **Fix:** clean the bowl and passages, free the float, replace the needle and seat if worn.
- **Frequency:** common (general sources; small-engine forums report it often).
- **Loop fit:** high. The carburettor is already a removable part. The bowl can be a sub-check, distinct from `clogged_jet`.
- **Sources:** https://help.championpowerequipment.com/article/cnmjygx9u4-fixing-a-flooding-carburetor ; https://forums.yesterdaystractors.com/threads/governor-searching.570545/ is unrelated, so do not cite it here. The float-stuck cases come from the Champion article and forum threads that I did not open in full.
- **Confidence:** medium-high on the cause, medium on frequency.

### 7. choke_stuck: Choke stuck or misadjusted
- **Symptoms:** rich running, black smoke, hard to start when warm, runs fine on choke.
- **Parts:** carburettor choke plate and linkage, choke cable.
- **Diagnosis:** check the choke opens and closes fully.
- **Fix:** free the choke linkage, replace the cable if worn.
- **Frequency:** occasional (estimate, unverified).
- **Loop fit:** medium. Overlaps with fault 6.
- **Sources:** A search result listed "stuck-open choke" as a rich-running cause. I did not open the source page, so no URL is reliable here. Treat as **unverified**.
- **Confidence:** low.

### 8. governor_hunting: Governor linkage binding or weak governor spring
- **Symptoms:** surges, speed hunts up and down, lights flicker, output varies.
- **Parts:** carburettor throttle linkage, governor spring, governor arm.
- **Diagnosis:** check linkage for free movement and binding. Check spring tension. A forum moderator says a lean mixture is more common than a governor fault, so check the mixture too.
- **Fix:** clean and lubricate pivots, replace spring, adjust linkage.
- **Frequency:** occasional (estimate).
- **Loop fit:** medium. Needs an adjust action, not just a swap.
- **Sources:** https://forums.yesterdaystractors.com/threads/governor-searching.570545/ ; https://outdoorking-forum.com.au/forum/ubbthreads.php/topics/45901.html ; https://techfaultfix.com/standby-generators/ge/generator-engine-hunts-or-surges-up-and-down-in-speed (GE generator, not ET950)
- **Confidence:** medium.

### 9. recoil_rope_or_spring: Recoil rope or spring failure
- **Symptoms:** rope won't retract, rope snaps, hard to pull, spring pops out.
- **Parts:** recoil starter (already in the game list), rope, recoil spring.
- **Diagnosis:** pull the rope out; see whether it retracts; open the housing to check the spring and pulley.
- **Fix:** if the rope only is worn, replace it. If the spring is broken or the housing cracked, replace the whole recoil assembly. Note: the spring can fly out and must be handled carefully.
- **Frequency:** common (general repair guides say this is among the most frequent starter faults; no rate given).
- **Loop fit:** high. The recoil starter is already a removable part. It can be a second type of fault on that part (rope vs spring).
- **Sources:** https://www.appliancepartspros.com/b/?p=13396 ; https://www.appliancepartspros.com/b/?p=13404 (recoil replacement)
- **Confidence:** medium-high on the mechanism; frequency is an estimate.

### 10. ignition_coil_or_magneto: Weak or no spark (coil or magneto)
- **Symptoms:** won't start, spark weak or none, sometimes intermittent.
- **Parts:** plug cap, spark plug, ignition coil or CDI module (new part), flywheel magneto and air gap (new part). The ET950 uses CDI, so the magneto is in the flywheel; I did not verify the layout for ET950.
- **Diagnosis:** spark tester (needs a set gap, about 13,000 V reference), crank at 250 RPM or more; check air gap against spec; check flywheel magnet strength.
- **Fix:** clean and re-gap the air gap, replace the coil or CDI.
- **Frequency:** occasional (estimate).
- **Loop fit:** medium. The plug cap and spark plug are already in the list. A spark test is a new action type (a test, not a swap).
- **Sources:** https://lawnmowerforum.com/threads/no-spark-from-ignition-kill-circuit-at-fault.56026/latest ; https://www.lawnmowerforum.com/threads/new-coil-issue.29717 ; https://www.sites.google.com/site/riversidelawnmowerrepair/home/how-does-lawn-mower-magneto-or-ignition-coil-work (magneto theory, not ET950)
- **Confidence:** medium. The air gap value varies between sources, so check the ET950 manual before using a number.

### 11. kill_wire_shorted: Kill wire shorted to frame
- **Symptoms:** won't start or won't run, though the coil tests fine.
- **Parts:** kill switch wire, the wire route, plug cap.
- **Diagnosis:** disconnect the kill wire at the engine end and try to start. If it starts, the wire is shorted to ground somewhere along its route. Check the wire where it passes near the shroud or frame.
- **Fix:** repair or replace the kill wire.
- **Frequency:** occasional (estimate).
- **Loop fit:** medium. Overlaps 10. Would need a wire-routing step.
- **Sources:** https://forums.iboats.com/goto/post?id=2688640 ; https://www.lawnmowerforum.com/threads/briggs-and-stratton-stray-coil-wire.46827/
- **Confidence:** low-medium. These are boat and lawnmower forum anecdotes.

### 12. low_oil_sensor_stuck: Low-oil shutoff sensor
- **Symptoms:** won't start even with full oil, or stops after running.
- **Parts:** oil sensor (new part), oil level.
- **Diagnosis:** check oil on the dipstick; disconnect the sensor temporarily.
- **Fix:** replace the sensor if faulty. Do not bypass it to run a low-oil engine.
- **Frequency:** occasional (estimate, unverified).
- **Loop fit:** low. The ET950 may not have a low-oil sensor; this is common on Honda, Champion and Generac units. **Not verified for ET950 or clones.**
- **Sources:** https://help.championpowerequipment.com/article/96wczuppst-temporarily-disconnect-the-generator-s-low-oil-shutoff-sensor
- **Confidence:** low for ET950 applicability.

### 13. reed_valve_leak: Reed valve damaged or leaking
- **Symptoms:** hard to start, rough idle, lean-feeling, poor power at cruise.
- **Parts:** reed block between carburettor and crankcase, reed petals, reed stops, carburettor gasket.
- **Diagnosis:** pressure or soapy-water test on the crankcase; inspect reed petals for cracks or chips. Look for air leaks at the carburettor.
- **Fix:** replace reed petals or the reed block; replace the gasket.
- **Frequency:** occasional (estimate).
- **Loop fit:** low. Needs a leak test (a new action type), and the reed block is inside the crankcase path.
- **Sources:** https://www.marineengine.com/videos/dangar-marine/outboard-reed-valves.html (outboard video page, not reviewed) ; https://ecom.volcom.com/what-do-reed-valves-do-in-a-2-stroke-engine.html (low-quality page; do not rely on it)
- **Confidence:** low-medium. The sources are weak and mostly about outboards.

### 14. crank_seal_leak: Crankcase seal leak
- **Symptoms:** starts cold but not hot, hard to start, runs rough.
- **Parts:** crankcase seals (crank seals), flywheel (must come off to reach the seal), crankcase gasket.
- **Diagnosis:** leak-down or pressure test on the crankcase. Check carburettor mounting screws and crankcase screws first (a loose screw can mimic a seal leak).
- **Fix:** replace the seals; tighten screws.
- **Frequency:** occasional (estimate).
- **Loop fit:** low. The flywheel and crankcase must be taken apart, which is a new step, and needs a leak test.
- **Sources:** https://www.lawnmowerforum.com/goto/post?id=188864 ; https://forums.iboats.com/threads/2000-yamaha-9-9-2-stroke-wont-start.751711/ (outboard)
- **Confidence:** low-medium.

### 15. weak_capacitor_low_output: Weak capacitor (runs but low voltage)
- **Symptoms:** runs, but output is low (for example about 25 V instead of 220 to 240 V); lights dim.
- **Parts:** capacitor (the same part as dead_capacitor).
- **Diagnosis:** measure capacitance against the printed value (a source suggests about ±5 µF tolerance; check the label). A dead capacitor gives almost no output; a weak one gives partial output.
- **Fix:** replace the capacitor with the same value and voltage rating.
- **Frequency:** occasional (estimate). One TG950 forum case reports 25 V output, but that thread has no answer.
- **Loop fit:** high, as a variant of `dead_capacitor`. Adds a measurement (capacitance meter) to the diagnosis.
- **Sources:** https://www.edaboard.com/threads/chinese-tiger-generator.253670 (TG950 case, output about 25 V; the capacitor tested fine, which is an open question) ; https://www.appliancepartspros.com/b/?p=16964 (capacitor and low-output troubleshooting, generic)
- **Confidence:** medium on the mechanism; low on the ±5 µF figure (verify against a capacitor datasheet).

### 16. overload_breaker_trip_avr: Overload trip and AVR fault
- **Symptoms:** breaker trips when a load is switched on, voltage drops, voltage fluctuates.
- **Parts:** output breaker, AVR (automatic voltage regulator, only on clones that have one), output socket, wiring.
- **Diagnosis:** measure output with no load and with load; check the breaker with a meter on resistance (a closed breaker should be near 0 ohm). Check AVR for burn marks and loose connections.
- **Fix:** reduce load, remove the short, reset or replace the breaker, replace the AVR if it is at fault.
- **Frequency:** common (estimate for overloading in general; source gives no rate).
- **Loop fit:** low. Needs measurement and a load test. Also, the AVR may not exist on the ET950, so this may only apply to clones.
- **Sources:** https://anacorp.com/wp-content/docs/SDG/SDG400/SDG400%20Rev%203%200169~.pdf (manual for an unrelated SDG400 model; the principle applies) ; https://www.appliancepartspros.com/b/?p=13486
- **Confidence:** medium on the principle, low on the ET950 AVR presence.

### 17. overheating_dirty_fins: Overheating from dirty cooling fins or blocked shroud
- **Symptoms:** runs for a while then shuts down, hot to touch, power drops when hot.
- **Parts:** cylinder fins, cooling shroud, cooling fan, air intake (overlaps dirty_air_filter).
- **Diagnosis:** let it cool, check the fins for dust and debris, check the shroud and fan.
- **Fix:** clean the fins and shroud with compressed air or wash; check clearance around the unit.
- **Frequency:** common on dusty sites (estimate; sources report it often but give no rate).
- **Loop fit:** medium. Needs a shroud or fan removal step (a new part). Dust is a relevant Lagos cause, which the sources support in general terms.
- **Sources:** https://www.appliancepartspros.com/b/?p=13400 ; https://techfaultfix.com/standby-generators/duromax/generator-shuts-down-after-running-for-a-while-enclosure-feels-very-hot (DuroMax, not ET950)
- **Confidence:** medium.

### 18. brushes_slip_rings_worn: Worn brushes or dirty slip rings
- **Symptoms:** no voltage or low voltage, output dies, brush dust.
- **Parts:** brushes, slip rings (only on clones that use brushes; the ET950 is brushless).
- **Diagnosis:** look at brush length and slip ring surface; check whether brushes are present.
- **Fix:** replace brushes; clean or true slip rings.
- **Frequency:** rare for the ET950 (brushless); unknown for clones.
- **Loop fit:** low. Only applies to brushed clones, and the sources are automotive alternator advice.
- **Sources:** https://bobistheoilguy.com/forums/threads/brushes.203895/ (automotive alternator forum, applied by analogy)
- **Confidence:** low for generators.

### 19. worn_rings_low_compression: Worn piston rings or scored cylinder
- **Symptoms:** hard to kick over, loses power, may smoke (oil burn).
- **Parts:** piston rings, cylinder bore, piston.
- **Diagnosis:** compression test (a 2-stroke reading is not standard; check against manual). Oil test: add a teaspoon of oil at the plug hole and retest; a reading that rises suggests worn rings. Inspect the bore with a scope through the plug hole.
- **Fix:** replace rings or hone or replace the cylinder, which is a teardown.
- **Frequency:** occasional (estimate).
- **Loop fit:** low. Needs teardown and a test; not a roadside fix.
- **Sources:** https://forums.iboats.com/goto/post?id=1378561 ; the oil-test steps came from a low-quality search result that I did not verify.
- **Confidence:** low-medium on method, low on the compression numbers.

---

## Fits the game loop: ranking

The loop is: remove parts in order, find the bad one, fix it, reassemble. The best candidates fit that loop with a part swap or a clean. Candidates that need a test, a measurement or a teardown are lower.

### Top 6 to add first

1. **fuel_cap_vent_blocked (fault 4).** Cheapest to add: the cap is an external part, the test is simple (open the cap and see if it recovers), and it gives a distinct "runs then dies" symptom. It adds a new part (fuel cap) without new mechanics.
2. **fuel_filter_or_pickup_blocked (fault 5).** Gives a second "runs then dies after 10 to 20 minutes" fault, distinct from the tap. Needs one new part (in-line fuel filter) between the hose and the tap. It fits the existing fuel-hose and fuel-tap steps.
3. **float_stuck_or_needle_leak (fault 6).** Carburettor is already a removable part, so this fits with no new steps. It gives a different symptom from clogged_jet (flooding, black smoke, drip after stopping), so it makes the carburettor diagnosis richer.
4. **recoil_rope_or_spring (fault 9).** The recoil starter is already in the game list. Two sub-faults (rope vs spring) on one part is an easy addition, and the symptom ("won't retract, hard to pull") is common and easy for the customer to describe.
5. **weak_capacitor_low_output (fault 15).** A variant of dead_capacitor, so the loop already exists. It adds "runs but low voltage" as a symptom, which is a useful contrast with the dead case. It needs a capacitance test, which is the one new action; a simple "meter" step is enough.
6. **ignition_coil_or_magneto (fault 10).** Common enough, and the coil or CDI is an important part. It needs a new part (coil or CDI) and a spark-test action. Its main value is that it adds a second ignition fault next to fouled_plug, which teaches the player to test spark before blaming the carburettor.

Why not wrong_oil_mix or water_in_fuel (both common): both are fuel-tank faults that need a drain or remix action rather than a part swap, so they would be more work for the loop. They would fit well as causes of fouled_plug or clogged_jet, which is a cheaper way to add them.

Why not overload_breaker_trip_avr or overheating_dirty_fins: both are real and common in Lagos conditions, but they need a load test or a shroud removal the loop does not yet have.

## Open items

- No ET950 or clone service manual was found, so all ET950-specific details (air gap, ignition layout, CDI or AVR presence, low-oil sensor, cap design) need checking against an actual manual before use.
- No YouTube description or Nigerian or Ghanaian repair post was found that describes a specific generator fault. A targeted search of those sources is still open.
- Frequency ratings are estimates. No source gave a rate.
