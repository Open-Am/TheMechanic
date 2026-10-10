# Generator reference pack

Oct 10, 2026 · @Ifeanyi

## Status

This pack is enough to start modelling and to build the game logic. It is not enough to publish without a mechanic's check.

- **Confirmed from sources:** the specs, that each part below is sold as a separate spare, the 50:1 fuel mix, and that the alternator is brushless and capacitor-regulated.
- **Working draft:** the removal order, where each part sits, and the fault list. These come from how small two-stroke generators are generally built, not from a manual for this model.
- **Not found:** an exploded diagram or service manual for the ET950, a ready-made 3D model, and the capacitor's rating.

Part and fault IDs here match the Claude Code prompt file. Change an ID in one and change it in the other.

## The machine at a glance

The target is the Yamaha ET950 design, the pattern behind the Tiger TG950 and similar small "I better pass my neighbour" generators. Spare-part listings treat ET950, ET650 and TG950 parts as interchangeable. Figures below are from [Yamaha's spec sheet for its current model in this class, the ET-1](https://global.yamaha-motor.com/business/pp/generator/lineup/220v-50hz/0-1/et-1/), unless noted.

| Item | Value |
| --- | --- |
| Engine | Two-stroke, reed valve, forced air-cooled, 63 cm³ |
| Starting | Recoil (pull cord) |
| Fuel | Petrol premixed with two-stroke oil at 50:1, per [a clone's manual](https://pdf.lowes.com/productdocuments/fedc453f-036d-4ee8-b22b-1aa701eb26a2/67077687.pdf) |
| Fuel tank | 4.0 L (clones list 4.2 L) |
| Alternator | Brushless, single phase, capacitor voltage regulation |
| AC output | 220 V, 50 Hz, 0.65 kVA rated, 0.78 kVA maximum |
| DC output | 12 V, 8 A |
| Protection | Circuit breaker |
| Size (L × W × H) | 367 × 312 × 375 mm |
| Dry weight | 19 kg |
| Run time per tank | About 6 hours |

Model at real scale using the size above. The piston bore is listed as 45 mm by [one parts seller](https://dlastore.com/piston-kit-for-yamaha-et600-et650-et800-et900-et901-et950-7n21163100a0.html) and 44 mm by [another](https://cutsmart.co.za/parts-accessories/mospare/piston-rings-44mmod-1-5mm-thick-details); it only matters once the engine internals are modelled.

## Parts list

Sixteen parts, twelve of them in the first version of the game. The frame and engine block stay fixed as the base everything else comes off.

| ID | Part | What it does | First version | Reference photos |
| --- | --- | --- | --- | --- |
| fuel\_cap | Fuel cap | Seals and vents the tank | No | [listing](https://www.ebay.de/itm/222499078569) |
| fuel\_tank | Fuel tank | Holds the petrol and oil mix; sits on top | Yes | [listing](https://www.ebay.com/itm/335381567007) |
| fuel\_tap | Fuel tap | On/off valve under the tank, with a strainer that catches dirt | Yes | [listing](https://cutsmart.co.za/parts-accessories/mospare/fuel-tap-fits-yamaha-et950-details) |
| fuel\_hose | Fuel hose | Carries fuel from the tap to the carburetor | Yes | None found yet |
| air\_filter\_cover | Air filter cover | Holds the filter element in place | Yes | None found yet |
| air\_filter | Air filter | Keeps dust out of the engine | Yes | None found yet |
| carburetor | Carburetor | Mixes fuel and air; holds the float bowl, main jet and choke | Yes | [12 photos](https://www.ebay.de/itm/197354501978), [second listing](https://www.manomano.co.uk/p/two-stroke-carburetor-for-yamaha-et950-et650-generator-engine-parts-96361722) |
| reed\_valve | Reed valve | One-way flap between the carburetor and the crankcase | No | None found yet |
| plug\_cap | Spark plug cap | Carries high voltage from the coil to the plug | Yes | None found yet |
| spark\_plug | Spark plug | Ignites the mixture | Yes | None found yet |
| ignition\_coil | Ignition coil | Makes the high voltage for the spark | No | [listing](https://www.ebay.de/itm/187399065519), [second listing](https://cutsmart.co.za/parts-accessories/mospare/high-voltage-set-details) |
| recoil\_starter | Recoil starter | Pull cord, pulley, spring and pawl that spin the engine | Yes | [listing](https://www.newegg.com/p/144-007F-00783), [cover](https://cutsmart.co.za/parts-accessories/mospare/recoil-starter-complete-yamaha-details) |
| muffler | Muffler | Quiets the exhaust; collects carbon on a two-stroke | Yes | [listing](https://www.newegg.com/p/144-007F-006J7) |
| alternator\_cover | Alternator end cover | Covers the electrical end of the machine | Yes | [repair write-up, similar generator](https://www.bentasker.co.uk/documentation/vehicles/386-performance-power-1kva-generator-has-no-output) |
| capacitor | Capacitor | Starts the alternator's voltage and holds it steady | Yes | [same write-up](https://www.bentasker.co.uk/documentation/vehicles/386-performance-power-1kva-generator-has-no-output) |
| control\_panel | Control panel | Socket, circuit breaker, engine switch, DC terminals | No | [Yamaha product page](https://global.yamaha-motor.com/business/pp/generator/lineup/220v-50hz/0-1/et-1/) |

Engine-deep parts come later: [flywheel](https://www.fridayparts.com/et950-950-gasoline-generator-aluminum-plastic-flywheel), cylinder, [piston and rings](https://dlastore.com/piston-kit-for-yamaha-et600-et650-et800-et900-et901-et950-7n21163100a0.html), crankshaft, stator and rotor.

## Removal order

Each part can come off only after the parts in the second column are off. This whole table is a working draft; the teardown videos below or a mechanic should confirm it.

| Part | Must come off first | To confirm |
| --- | --- | --- |
| fuel\_hose | Nothing | Tap turned off first |
| fuel\_tap | fuel\_hose | Whether the tap sits on the tank or on the frame |
| fuel\_tank | fuel\_tap | Game simplification; on the real machine the tap may come away with the tank |
| air\_filter\_cover | Nothing | Clips or screws |
| air\_filter | air\_filter\_cover |  |
| carburetor | air\_filter, fuel\_hose | Whether the filter housing also has to come off |
| plug\_cap | Nothing | Whether the tank blocks access to the plug |
| spark\_plug | plug\_cap | Needs a plug spanner |
| recoil\_starter | Nothing | Number of bolts |
| muffler | Nothing | Whether a heat guard comes off first |
| alternator\_cover | Nothing |  |
| capacitor | alternator\_cover | Where it is mounted |

For the four parts held back from the first version: fuel\_cap and control\_panel need nothing removed, reed\_valve needs the carburetor off, and ignition\_coil needs the recoil\_starter off.

## Fault list

Eight faults, six in the first version. Each fault has exactly one bad part, and inspecting that part shows the clue. The customer lines are placeholders for you to rewrite.

| ID | Customer says | What you find on inspection | Bad part | Fix | First version |
| --- | --- | --- | --- | --- | --- |
| fouled\_plug | "E no gree start at all." | Plug tip is black and oily | spark\_plug | Clean or replace the plug | Yes |
| clogged\_jet | "E go start, then e go off." | Dried fuel gum in the float bowl and main jet | carburetor | Clean the bowl and jet | Yes |
| blocked\_fuel\_tap | "E work small, then e quench like say fuel finish." | Strainer packed with dirt; hardly any fuel reaches the hose | fuel\_tap | Clean the strainer | Yes |
| dead\_capacitor | "Gen dey work but light no dey come." | Engine runs normally; capacitor is swollen or dead | capacitor | Replace with the same rating | Yes |
| choked\_muffler | "E no get power again; small load dey quench am." | Exhaust outlet caked with carbon | muffler | Clear the carbon or replace | Yes |
| dirty\_air\_filter | "E dey smoke well well, e dey drink fuel." | Filter element clogged with dust and oil | air\_filter | Wash or replace the element | Yes |
| bad\_ignition\_coil | "I don change plug, e still no start." | New plug fitted, still no spark | ignition\_coil | Replace the coil | No |
| broken\_recoil | "The rope don cut." | Rope snapped, or will not wind back | recoil\_starter | Fit a new rope or spring | No |

The mechanisms are standard for this kind of machine. Oil and carbon deposits [foul plugs and block exhausts on two-strokes](https://blog.amsoil.com/fix-hard-starting-two-stroke-engines/), old fuel [gums up carburetors](https://www.repairclinic.com/RepairHelp/How-To-Fix-A-Generator/471---/Generator-Won-T-Start), and a failed capacitor [leaves a running generator with only a few volts](https://www.partselect.com/Repair/Generator/No-or-Low-Voltage/). Which faults are most common on Lagos streets is the mechanic's call.

One idea for later is a round with no bad part at all: the customer mixed the fuel wrong or added water.

## Reference photos and videos

Per-part photo links are in the parts table. These cover the whole machine and the gaps.

- **Whole machine:** the [Yamaha product page](https://global.yamaha-motor.com/business/pp/generator/lineup/220v-50hz/0-1/et-1/) for the outside, and [a clone's user manual](https://manuals.plus/asin/B00HXY1HEY) for a labelled view with dimensions.
- **Teardown order:** search YouTube for "Restoration Old Generator YAMAHA ET950 Engine 2-Stroke Made in Japan". It is a two-part restoration, and part 1 runs about 28 minutes. I found the titles but not direct links.
- **Capacitor location:** [this repair write-up](https://www.bentasker.co.uk/documentation/vehicles/386-performance-power-1kva-generator-has-no-output) shows a 12 µF capacitor behind the end cover of a similar 1 kVA generator. The ET950's own rating is unconfirmed.
- **Still missing:** air filter and cover, reed valve, spark plug and cap, fuel hose. Search "ET950" or "TG950" plus the part name on a spares site.

Seller listings expire, so save the photos into the project's reference folder as you find them. Use them as modelling reference only; the game's textures should be your own.

## Questions for the mechanic

Thirty minutes with a roadside mechanic and one of these generators settles everything marked as draft above.

- [ ] Is the removal order right? Which parts come off in a different order?
- [ ] Is the fuel tap on the tank or on the frame?
- [ ] Can you reach the spark plug without taking the tank off?
- [ ] Which spark plug does it take?
- [ ] Where is the capacitor, and what is its rating?
- [ ] Is the cylinder head separate from the cylinder?
- [ ] Which five faults do you see most on this generator? What is missing from the list?
- [ ] For each fault, what does the customer usually say, and what do you check first?
- [ ] What do customers do that causes the faults: bad fuel mix, water, overloading?
- [ ] Which tool do you use for each part?
- [ ] Can we photograph each part as it comes off?
