# Actual appliance-photo evaluation

This is a small, deliberately difficult **local smoke evaluation**, not an accuracy benchmark, authenticity detector, or validation of every appliance category. The actual pinned CLIP and later SigLIP models performed inference; test doubles and invented scores were not used to judge photo recognition. See [SCAN-EVALUATION.md](SCAN-EVALUATION.md) for the separate actual Tesseract/nameplate evaluation.

**Historical fridge follow-up:** the user-reported red retro refrigerator image exposed both a category-description failure and an overly narrow photograph description. The final section documents the repaired descriptions and a complete 18-image actual-model replay. Earlier matrices below are historical before this follow-up.

**Current architecture supersedes the earlier style gate:** category suggestions are provisional; image style is advisory; actual pixel quality supports blank/low-detail abstention; visually ambiguous families ask the user. The 58-image CLIP section preserves the unsuccessful frozen classifier results; the latest 60-image SigLIP section records a measured model upgrade and distinguishes review policy from model accuracy.

## Method and evidence

- Transformers.js 4.3.1, `Xenova/clip-vit-base-patch32`, revision `d15189d7028b43f1d3e65039190477f6af591c2a`, q8, native CPU. The existing cached model was reused; no package/API/account was added.
- Input auto-orientation and proportional resize to maximum 512 pixels through installed sharp, then the model's preprocessing. This approximates the worker's 512px preparation, but native CPU/sharp and browser WASM/canvas are different paths. These scores do **not** certify physical-phone camera behavior or exact browser parity.
- The first repair retained the original 19 category descriptions: 10 appliance classes plus 9 unsupported classes. The later user-fridge follow-up changes one generic fridge description; category count stays 19. Scores are relative to the provided descriptions, not probabilities of correct identity.
- A separate six-description image-content comparison was added after actual failures. It uses the same loaded CLIP model and existing conservative acceptance rule: appliance photo/product-image candidate ranks first, relative score ≥ 0.40, lead ≥ 0.15. Category acceptance still independently requires its existing 0.40 / 0.15 rule. Neither threshold was tuned against this tiny set.
- Evaluate → identify failures → test a broader-negative experiment → reject that inadequate repair → evaluate a separate content comparison → replay the same fixtures. The same-fixture replay is regression evidence, **not a held-out benchmark**. Candidate selection was informed by observed failures.
- Raw images, scripts and complete scores are local QA artifacts in `/private/tmp/housemates-photo-eval/`. Third-party images are not bundled in the application, uploaded to an inference API, or added to Git. A small recorded-score fixture supports deterministic regression tests; those tests replay outputs and do not rerun the model.

## Findings and repair

The unguarded classifier accepted text-only appliance names: `AIR CONDITIONER`→Chill0.981737, `DISHWASHER`→Bubbles0.831608, and `EV CHARGER`→Evie0.861616. A tiger photo with a misleading `REFRIGERATOR` caption produced Misty0.407993. Plain footer text produced Misty0.426741. Increasing a single category threshold would not solve these failures: the fake AC text scored higher than genuine dishwasher/fan photos.

Adding one generic blank/text negative to the category list reduced some weak false suggestions but left text-only AC at 0.978198, dishwasher at 0.822774 and EV at 0.735154. That experiment was **not shipped**. The category count remains 19.

The separate image-content check abstains on text, cartoons, screenshots, blank images and ambiguous photo content before allowing a category suggestion. A clear real appliance may still be rejected; this is an intentional conservative tradeoff with a manual path. The check cannot establish that a photo is original, current, owned by the user, connected to the app, or physically real. Plausible edited/generated product photos and photos of screens can still fool it. Nameplate OCR remains a separate explicit operation: rejecting a label as an appliance photograph must not prevent reading that label for manual specification review.

## Sources and acquisition limits

| Fixture | Source / attribution | Role |
|---|---|---|
| `bubbles.jpg` | Carlos Paes, [Dishwasher open for loading](https://commons.wikimedia.org/wiki/File:Dishwasher_open_for_loading.jpg), Commons free-use record | Real dishwasher |
| `spin.jpg` | Fanti Salms, [Front Load Washing Machine](https://commons.wikimedia.org/wiki/File:Front_Load_Washing_Machine.jpg), CC BY-SA 3.0 | Real washer, difficult room/angle |
| `breeze.jpg` | Garonzi Stefania, [Electric fan](https://commons.wikimedia.org/wiki/File:Electric_fan.jpg), CC BY-SA 4.0 | Real fan with outdoor background |
| `ember.jpg` | Steven Pavlov, [Rheem Electric Water Heater 40 gal](https://commons.wikimedia.org/wiki/File:Rheem_Electric_Water_Heater_40_gal.jpg), CC BY-SA 4.0 | Real tank, difficult lighting/orientation |
| `evie.jpg` | Tiia Monto, [Electric vehicle charger](https://commons.wikimedia.org/wiki/File:Electric_vehicle_charger.jpg), CC BY-SA 3.0 | Real charger |
| `frost.jpg` | [Open refrigerator with food at night](https://commons.wikimedia.org/wiki/File:Open_refrigerator_with_food_at_night.jpg) | Real refrigerator, dark room |
| `microwave.jpg` | Baran Ivo, [Microwave oven2](https://commons.wikimedia.org/wiki/File:Microwave_oven2.jpg), public domain | Unsupported real appliance |
| `tiger.jpg` | [Transformers.js documentation tiger](https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/tiger.jpg) | Unrelated real animal |
| Generated PNGs | Original simple SVG→PNG QA fixtures: white/black blank, cartoon washer, text-only names and misleading caption over the tiger fixture | Clearly synthetic negatives; not genuine appliance photos |

Commons throttled four further category-photo requests (dryer, dehumidifier, robot vacuum, AC) with HTTP 429. An official LG product image returned 403; an additional Flickr washer returned 429. These attempts are not successful tests. No further downloads were attempted after a single cooldown/retry. Those four categories remain untested on real photos in this set. No third-party image is a shipping asset.

Primary model references: [CLIP model card and limitations](https://huggingface.co/openai/clip-vit-base-patch32), [Transformers.js pipeline API](https://huggingface.co/docs/transformers.js/api/pipelines). Neither documents this appliance-specific application as a verified classifier.

## Verification status

Four recorded-output regression tests pass, covering high-score text/caption false positives, retained genuine dishwasher suggestion, difficult-scene abstention, category/content independence, and malformed or missing content results. Scoped ESLint passes. Independent domain review accepted by the OCR specialist. Integrated browser evidence is owned by the lead; native-model results alone do not claim that browser path passed.

## Completed actual-model matrix

Scores below come from completed native-model calls; the content columns use the six-description comparison. All category and content results use the same pinned model, but independent candidate lists. “Manual” means no category is suggested.

| Fixture | Category-only result / top relative score | Physical-photo content score | Final suggestion |
|---|---|---:|---|
| `spin` | uncertain / 0.431430 | 0.654635 | Manual |
| `breeze` | breeze / 0.964347 | 0.257900 | Manual |
| `microwave` | unsupported / 0.372776 | 0.350020 | Manual |
| `bubbles` | bubbles / 0.955405 | 0.847081 | bubbles |
| `tiger` | unsupported / 0.955993 | 0.032809 | Manual |
| `blank-white` | unsupported / 0.458171 | 0.011467 | Manual |
| `text-only-fridge` | uncertain / 0.357045 | 0.129101 | Manual |
| `cartoon-washer` | unsupported / 0.636451 | 0.084851 | Manual |
| `blank-black` | unsupported / 0.156322 | 0.041756 | Manual |
| `tiger-fridge-caption` | misty / 0.407993 | 0.126731 | Manual |
| `ember` | uncertain / 0.439579 | 0.519695 | Manual |
| `text-only-footer` | misty / 0.426741 | 0.114830 | Manual |
| `text-only-dishwasher` | bubbles / 0.831608 | 0.123883 | Manual |
| `text-only-ac` | chill / 0.981737 | 0.203421 | Manual |
| `text-only-ev` | evie / 0.861616 | 0.111052 | Manual |

This completed set contains four supported appliance photographs (dishwasher, washer, fan and water heater), two unrelated/unsupported photographs, and nine synthetic negative variants. Only the clear dishwasher survives both conservative checks. The outdoor fan that category-only accepted does not pass the content gate; manual confirmation is a required part of the experience, not an error recovery after an asserted identity.

The EV and refrigerator photos were acquired after the gate descriptions were selected and were tested subsequently, using one native CPU thread to reduce host contention. Both passed without any further candidate or threshold adjustment. This two-photo follow-up is too small to establish generalization.

| Later photo | Category top score | Physical-photo content score | Final suggestion |
|---|---:|---:|---|
| `evie` | 0.917276 | 0.670728 | evie |
| `frost` | 0.912758 | 0.547692 | frost |

Across these 17 hand-picked images, the combined check suggests the correct category for the clear dishwasher, EV charger and refrigerator; it abstains on the real washer, fan and water heater, and issues no appliance suggestion for the 11 unsupported/unrelated/synthetic-negative examples. These are observed outcomes for this set, not a validated recognition accuracy or fake-photo-detection rate. Four supported categories still lack a real-photo test.

### Reproduction artifacts

- `comparison.json`: completed 19-category and rejected 20-category-negative experiment on 15 images.
- `gate-results.json`: completed independent 6-label content comparison on those 15 images.
- `final-results.json`: optional combined replay; stopped after eight completed repeats to avoid redundant model work under host contention. This partial file is not claimed as a complete 17-image replay.
- `heldout-results.json`: completed actual category+content calls on the later EV and refrigerator photographs.
- `tests/fixtures/applimon-photo-scores.json`: repository numeric outputs for 11 selected regressions; no downloaded photographs.
- `compare.cjs`, `gate.cjs`, `heldout-evaluation.cjs`: local runner scripts in the QA directory; native runs must have project dependencies and cached model available.

No model download means inference can start from this machine’s existing cache; this is not evidence that first-use downloads or all phone hardware work. No API key or MCP integration was required.

## User-reported retro fridge follow-up

The user supplied a 1318×1450 screenshot showing a large red retro fridge product image and an abstention. We inspected the screenshot and cropped only its 436×436 appliance-image region at (438,227) for local evaluation. This is a screenshot crop, not the original uploaded image, so compression and rendering can differ from the browser input. The crop and source screenshot were not added to the repository.

Actual original-model diagnosis: category scores incorrectly favored dishwasher 0.334416, refrigerator 0.199369 and countertop appliance 0.169640. The separate content comparison ranked photograph 0.545351 vs cartoon 0.409734, missing the existing 0.15 margin. Both layers abstained; changing only the content gate would not fix this example.

A bounded prompt investigation compared five generic fridge descriptions and three image-content descriptions. The selected first plausible descriptions use common synonyms and visible appliance features; no color, brand, model, fixture ID or output hardcode was added:

- Fridge: `a refrigerator or fridge with shelves for storing food and drinks`.
- Positive image content: `a photograph or realistic product image of a household appliance`.

This supports normal consumer product images as well as photographs, without presenting the classifier as an authenticity detector. The pinned model and 0.40 score/0.15 margin thresholds stay unchanged. The investigation and final replay use a native single CPU thread and `local_files_only:true`; a prior Hub-cache startup attempted a metadata request and failed with a proxy 403 before inference, so the completed replay loads the existing pinned local model directly with remote models disabled. No new model was downloaded.

### Complete final replay

All 17 previous examples plus the user crop were evaluated with both changed descriptions through actual model calls. This is a regression replay informed by the user’s failure, not a new held-out benchmark.

| Fixture | Category top score | Positive image-content score | Combined result |
|---|---:|---:|---|
| `spin` | 0.399059 | 0.623970 | Manual |
| `breeze` | 0.963636 | 0.144626 | Manual |
| `microwave` | 0.346823 | 0.586847 | Manual |
| `bubbles` | 0.951303 | 0.913770 | bubbles |
| `tiger` | 0.953877 | 0.022141 | Manual |
| `blank-white` | 0.493970 | 0.014713 | Manual |
| `text-only-fridge` | 0.468566 | 0.170111 | Manual |
| `cartoon-washer` | 0.661521 | 0.082427 | Manual |
| `blank-black` | 0.176507 | 0.043276 | Manual |
| `tiger-fridge-caption` | 0.398165 | 0.113861 | Manual |
| `ember` | 0.478460 | 0.511757 | Manual |
| `text-only-footer` | 0.401853 | 0.157345 | Manual |
| `text-only-dishwasher` | 0.832839 | 0.114541 | Manual |
| `text-only-ac` | 0.983706 | 0.153940 | Manual |
| `text-only-ev` | 0.820337 | 0.060883 | Manual |
| `evie` | 0.884814 | 0.625494 | evie |
| `frost` | 0.967865 | 0.774822 | frost |
| `user-retro-fridge` | 0.743974 | 0.746850 | frost |

The user’s product image now suggests Frost with category 0.743974 and image-content 0.746850. Existing clear dishwasher/EV/fridge suggestions are retained; all 11 unsupported, unrelated and synthetic negative examples remain manual. Difficult washer/fan/heater photographs still abstain. Five recorded-score regression tests cover the corrected user example, original strong text false positives, retained genuine suggestions, difficult images, category/content independence, and malformed/missing results.

Final raw evidence: `/private/tmp/housemates-photo-eval/product-image-review-results.json`; runner `product-image-review.cjs`; initial failure `user-retro-fridge-results.json`; prompt-probe stdout from `fridge-prompt-review.cjs`. The repository numeric fixture now contains all 18 final outputs. Physical-phone inference and the original upload have not been reproduced by these native CPU calls; integrated browser verification is separate.

## Broader frozen 58-image evaluation and current review policy

The actual Tesla and robot-vacuum originals exposed a systematic defect: the CLIP category pass suggested the robot correctly at 0.995265, but its marketing graphics were mistaken for cartoon styling by the content comparison. The Tesla also failed that broad style gate. Product styling is therefore no longer a reason to reject a category match. This does not convert the model into an authenticity detector.

### Architecture and fixed evidence rules

- Same pinned q8 CLIP, same local single-thread native CPU evaluation. No paid API, stronger model, extra OCR pass or network inference was added. Browser/photo and label-OCR flows remain separate.
- Category score/margin remain 0.40/0.15. Content results must be structurally valid, but cartoon, product-image and background-scene classifications are advisory.
- The worker derives actual RGB/RGBA pixel evidence from its ≤512px image. Alpha composites onto white. A 4096-bin histogram (four bits per RGB channel) supplies dominant-color fraction and color entropy. These are image-detail statistics, not OCR or authenticity evidence.
- Frozen pre-evaluation quality rules: dominant fraction ≥ 0.995 and entropy ≤ 0.08 bits means nearly uniform; fraction ≥ 0.94 and entropy ≤ 0.75 means very low detail. Either leaves the user with manual selection. A text-relative score ≥ 0.35 only contributes a text-specific reason when fraction ≥ 0.85 and entropy ≤ 1.25. No blanket 'cartoon is fake' rule remains.
- Every result carries mandatory review metadata. Vehicle results are only conditional setup: user must independently confirm EV/PHEV status before reviewing power, task energy and windows. A car photo cannot establish powertrain or charging specifications.
- After observing broad-set mistakes, laundry and tank-like matches now require explicit category choice: washer/dryer or water heater/dehumidifier. Unsupported lookalikes may be neither. This improves the recovery workflow; it does **not** mean the underlying model classified those images correctly.

### Corpus, freeze and original results

An independent agent sourced and visually reviewed 38 new images, at least 3 for each of 10 supported categories (31 supported total), 6 strict unsupported boundaries and 1 explicitly ambiguous washer/dryer scene. Web product photography/renders dominate; installed ACs, a desk fan, room backgrounds, marketing graphics and small low-resolution device images add variation. Byte and decoded-pixel hashes were checked for duplicate new images. Together with 20 earlier/user examples, the corpus has 58 images.

Splits were assigned before inference: 21 new development / 17 new holdout. The first 10-class run froze both descriptions and rules before any new inference:

- New manifest SHA256: `12f352b6e8e83adab53db77f0977f63436d6c9fc4c3fcbacf93c5b7da3b9d810`.
- Recognition+pixel-helper source SHA256: `740af707671f926c0f28fb405aef406d09d9c8c01b0c027983e8429bd9e8c11c`.
- Immutable runtime evidence: `recognition-freeze.json` and `results.json` under `/private/tmp/housemates-broad-scan-eval/`.

| Frozen evaluation slice | Correct provisional categories | Wrong provisional categories | Abstentions |
|---|---:|---:|---:|
| 31 new supported images |20 |3 |8 |
| 10 supported images within holdout |7 |2 |1 |
| 6 strict unsupported holdout boundaries |0 |1 false supported suggestion |5 |

The mixed washer/dryer scene returned Spin, one of its predeclared allowed categories; it is reported separately rather than counted as single-object accuracy. The complete 17-image first holdout comprised 7 correct supported results, 2 wrong supported results, 1 supported abstention, 1 unsupported false suggestion, 5 correct unsupported abstentions and 1 acceptable ambiguous scene.

**Observed failures remain failures:** development dryer `tumble-1`→washer 0.513575; holdout dryer `tumble-3`→washer 0.680951; holdout water heater `ember-3`→dehumidifier 0.723427; holdout kettle `kettle-1`→dehumidifier 0.511751. The attempted electric-vs-gasoline wording also misranked the user’s Tesla as a gasoline-related text match 0.733069. These relative scores were not reliable probabilities. No claim that all 31 appliances were recognized is justified.

### Corrective policy replay, not a fresh holdout

The source descriptions and raw scores above remain preserved. After seeing these errors, only the result interpretation was corrected: the generic vehicle comparison offers an explicit EV/PHEV question with no asserted appliance ID; charger-like suggestions still require independent confirmation, and the two ambiguous appliance families ask the user to choose. Frozen wording mentioning gasoline is retained temporarily as reproducible model-comparison text; the application expressly does not treat it as fuel-type identification. Future model/prompt changes need a new evaluation.

The exact 58 recorded model outputs and actual pixel metrics were replayed through the corrected interpreter in `corrected-policy-results.json`; this required no additional model run. That file retains `frozenOutcome` and adds `policyOutcome`. It is **post-evaluation regression evidence, not unbiased held-out accuracy**. The user’s robot now receives Rover, the retro-fridge crop Frost, and the Tesla an uncertain vehicle question with `applianceId:null`, an explicit Choose Evie option, and required EV/PHEV confirmation. The known gasoline-car boundary also gets the uncertain vehicle question, never a Suggested EV headline; it is not reported as a correctly identified EV and must not proceed unless the user can truthfully confirm plug-in capability.

The four observed false appliance assignments now request a category choice instead of asserting a character. This is a deliberate manual recovery limit. No model-number, powertrain, power, cycle-energy or connectivity verification is claimed.

### All new sourced examples

The source links identify the exact acquired image/page. Third-party photos remain temporary QA material, not shipping assets. Sources include manufacturers and retailers; a product image is not guaranteed to be a documentary photograph.

| ID | Expected | Split | Frozen model outcome | Current policy | Source |
|---|---|---|---|---|---|
| `evie-1` | evie | development | evie (correct-provisional) | conditional-vehicle-review | [source](https://techtron.co/products/techtron-evo-smart-ev-chargers) |
| `evie-2` | evie | development | evie (correct-provisional) | conditional-vehicle-review | [source](https://www.ev-chargerpoint.com/sale-39354543-smart-7-2kw-wall-mounted-ev-charging-station-wallbox.html) |
| `evie-3` | evie | holdout | evie (correct-provisional) | conditional-vehicle-review | [source](https://www.lowes.com/pd/Schneider-Electric-Level-2-30-Amp-Wall-Mounted-Electric-Car-Charger/3585682) |
| `bubbles-1` | bubbles | development | bubbles (correct-provisional) | correct-provisional | [source](https://geprofile.lat/es_MX/Mas-para-el-hogar/Lavavajillas/Lavavajillas-14-Servicios-Inoxidable-GE-Appliances---GLV1460FSS/p/GLV1460FSS) |
| `bubbles-2` | bubbles | development | bubbles (correct-provisional) | correct-provisional | [source](https://www.kolbe.de/Freestanding-Dishwasher-DW615FS) |
| `bubbles-3` | bubbles | holdout | bubbles (correct-provisional) | correct-provisional | [source](https://mabeglobal.com/es_CL/Mas-para-el-hogar/Lavavajillas/Lavavajillas-de-Empotre-14-Servicios-Inoxidable-GE-Appliances---GLV14FSITSS0/p/GLV14FSITSS0) |
| `chill-1` | chill | development | chill (correct-provisional) | correct-provisional | [source](https://www.atisacool.com/%E0%B8%A3%E0%B8%B2%E0%B8%A2%E0%B8%A5%E0%B8%B0%E0%B9%80%E0%B8%AD%E0%B8%B5%E0%B8%A2%E0%B8%94/Wall_Und__Und_Type_Und__Und__Und__Und_%28%E0%B9%81%E0%B8%AD%E0%B8%A3%E0%B9%8C%E0%B8%95%E0%B8%B4%E0%B8%94%E0%B8%9C%E0%B8%99%E0%B8%B1%E0%B8%87%29) |
| `chill-2` | chill | development | manual (abstained) | manual-category-choice | [source](https://myhartono.com/en/air-conditioner-en-4/) |
| `spin-1` | spin | development | spin (correct-provisional) | manual-category-choice | [source](https://www.tradeindia.com/products/lg-super-quality-front-loading-8-kg-fully-automatic-washing-machine-7498076.html) |
| `spin-2` | spin | development | spin (correct-provisional) | manual-category-choice | [source](https://inzoneuae.com/product/geepas-front-load-washing-machine-gwmf71200lcj-7kg-capacity) |
| `spin-3` | spin | holdout | spin (correct-provisional) | manual-category-choice | [source](https://www.tarragona.cat/neteja-i-medi-ambient/gestio-de-residus-i-deixalleries/deixalleries/deixalleria-fixa-1/deixalleria-fixa) |
| `tumble-1` | tumble | development | spin (wrong-provisional) | manual-category-choice | [source](https://www.lyreco.ie/en/product/12.939.527/indesit-i1d80wuk-tumble-dryer-freestanding-front-load-8kg-c-white) |
| `tumble-2` | tumble | development | manual (abstained) | manual-category-choice | [source](https://www.gillmans.co.uk/laundry/tumble-dryers/condenser/18362/7kg-load-condenser-tumble-dryer-in-white) |
| `tumble-3` | tumble | holdout | spin (wrong-provisional) | manual-category-choice | [source](https://www.hotpoint.co.uk/) |
| `ember-1` | ember | development | manual (abstained) | manual-category-choice | [source](https://products.geappliances.com/appliance/gea-specs/GE38S06AAG/featureguide) |
| `ember-2` | ember | development | manual (abstained) | manual-category-choice | [source](https://www.fwwebb.com/product/American-Standard-Water-Heaters/Water-Heater/ENS50T-6/1035030) |
| `ember-3` | ember | holdout | misty (wrong-provisional) | manual-category-choice | [source](https://www.homedepot.com/p/Rheem-Performance-30-Gal-Short-6-Year-4500-4500-Watt-Elements-Electric-Tank-Water-Heater-XE30S06ST45U1/205810630) |
| `misty-1` | misty | development | manual (abstained) | unsupported | [source](https://www.buyitdirect.ie/p/electriq-12-litre-dehumidifier-for-up-to-3-bed-house-cd12p) |
| `misty-2` | misty | development | manual (abstained) | manual-category-choice | [source](https://www.euronics.it/elettrodomestici/trattamento-aria/deumidificatori/hisense---deumidificatore-12l-d12hw-bianco/252000019.html) |
| `misty-3` | misty | holdout | manual (abstained) | manual-category-choice | [source](https://donaghybros.co.uk/igenix-ig9830-30-litre-per-day-dehumidifier-white.html) |
| `rover-1` | rover | development | rover (correct-provisional) | correct-provisional | [source](https://www.roboticky-vysavac.cz/irobot-roomba-695) |
| `rover-2` | rover | development | rover (correct-provisional) | correct-provisional | [source](https://business.currys.co.uk/catalogue/domestic-appliances/floorcare/vacuum-cleaners/irobot-roomba-606-robot-vacuum-cleaner-black/N247285W) |
| `rover-3` | rover | holdout | rover (correct-provisional) | correct-provisional | [source](https://homesellquick.com/irobot-roomba-650-docking/) |
| `frost-1` | frost | development | frost (correct-provisional) | correct-provisional | [source](https://qrs.in/) |
| `frost-2` | frost | development | manual (abstained) | manual-category-choice | [source](https://storage.googleapis.com/dfevzgdamvqwve/types-of-fridges-and-freezers.html) |
| `frost-3` | frost | holdout | frost (correct-provisional) | correct-provisional | [source](https://www.distributorsappliancesale.com/) |
| `breeze-1` | breeze | development | breeze (correct-provisional) | correct-provisional | [source](https://fr.made-in-china.com/co_hkyatuo/product_Factory-manufacture-Ghana-Africa-10-12-16-Inch-Pedestal-Standing-Air-Cooler-Stand-Pedestal-Fan-with-Best-Price_uorignnsng.html) |
| `breeze-2` | breeze | development | breeze (correct-provisional) | correct-provisional | [source](https://fr.made-in-china.com/co_jinling-electric/product_High-Quality-Home-Household-Electric-Round-Base-Stand-Fan_ysgeuiyeyg.html) |
| `microwave-1` | unsupported | holdout | manual (abstained) | unsupported | [source](https://www.tesco.com/groceries/en-GB/products/326154912) |
| `toaster-1` | unsupported | holdout | manual (abstained) | unsupported | [source](https://www.rusta.com/sv-se/hem-och-inredning/hushallsapparater/brodrostar/brodrost-800950-w-2-skivor-t23) |
| `kettle-1` | unsupported | holdout | misty (wrong-provisional) | manual-category-choice | [source](https://agarolifestyle.com/collections/electric-kettle) |
| `television-1` | unsupported | holdout | manual (abstained) | unsupported | [source](https://ie.webuy.com/product-detail/?id=SLCDGEN25B) |
| `laptop-1` | unsupported | holdout | manual (abstained) | unsupported | [source](https://rightech.ma/pc-portable-accent-w5000-i5-b2.html) |
| `car-1` | unsupported | holdout | manual (abstained) | manual-category-choice | [source](https://tr.made-in-china.com/co_anhuizhongwei/product_to-Yota-Corolla-2023-Model-1-2t-Elite-Edition-New-Car-New-Gasoline-Car-for-Sale-From-China_ysrinuesug.html) |
| `background-1` | mixed washer/dryer | holdout | spin (correct-provisional) | manual-category-choice | [source](https://www.lloydmanagement.com/spring-creek-townhomes/photogallery) |
| `chill-background-2` | chill | development | chill (correct-provisional) | correct-provisional | [source](https://commons.wikimedia.org/wiki/File%3AMITSUBISHI_HEAVY_INDUSTRIES_AIR_CONDITIONER_INDOOR_UNIT_SRK285CENF_W_%282%29.jpg) |
| `chill-background-3` | chill | holdout | chill (correct-provisional) | correct-provisional | [source](https://commons.wikimedia.org/wiki/File%3APanasonic_AIR_CONDITIONER_OUTDOOR_UNIT_%26_MITSUBISHI_ELECTRIC_WINDOW_TYPE_AIR_CONDITIONER_OUTDOOR_UNIT.jpg) |
| `breeze-3-desk` | breeze | holdout | breeze (correct-provisional) | correct-provisional | [source](https://www.ifixit.com/Device/Vornado_133_Compact_Air_Circulator) |

### Verification and practical limits

Eight actual-source regression tests pass for pixel statistics/invalid buffers, measured low-detail images, all three user examples, advisory styling, unsupported recovery, explicit family choices, conditional vehicle review, and malformed/missing outputs. The repository score fixture includes the 58 actual comparisons and actual pixel metrics; no photos. Source review of the worker/capture confirmed the metrics are computed from the decoded image, returned with both comparisons, checked before use, and subject to existing cancellation/stale-result guards.

These tests validate the decisions made from stored outputs, not fresh model accuracy. The photo corpus is small, hand-picked and mostly web imagery; no broad smartphone-camera benchmark, lighting benchmark or hardware certification was performed. Manual confirmation is still required and known class confusions remain. Internet acquisition failures and unused candidates are documented in the independently prepared acquisition files, not silently counted as tested.

Independent review caught a misleading intermediate headline for the known gasoline-car image. The final vehicle recovery is **uncertain**, with no asserted appliance ID and only an explicit EV/PHEV question plus a manual Evie option. It is not counted as successful EV recognition. Regression coverage uses both the actual Tesla and the gasoline-car fixture to prevent that headline regression.


## Current catalog model: actual SigLIP comparison and review policy

The catalog now uses `Xenova/siglip-base-patch16-224`, revision `4649052661e53c7000355844105f8a1792088239`, q8 ONNX (210,977,441 bytes; SHA256 `9171eb00c38b9ec82f924877356d008b79e3285dbac7cd10965827bee30c9a99`). Both passes explicitly use the evaluated hypothesis template `This is a photo of {}.`. The legacy three-appliance recognizer retains its original CLIP model. The successful local CPU run used one inference thread and RAM-only model loading; earlier attempts failed before inference and contribute no accuracy evidence. Browser WASM uses the same pinned weights and prompts, but its physical-phone parity/performance is not certified by the native run.

The same 58 images were evaluated, plus two genuinely new, visually reviewed and frozen Commons photos. SigLIP's **raw highest-ranked category** improved from CLIP's 25/31 to 30/31 on the new supported appliance photos; the remaining error is `spin-2`, a washer ranked as dryer. The six unsupported boundaries were correctly ranked as unsupported descriptions 6/6 versus CLIP's 5/6, counting the gasoline description by its actual meaning rather than falsely declaring an EV. Across all original58, raw evaluation counted 50/58 acceptable categories versus CLIP42/58. These are observed regression-corpus comparisons, not representative accuracy claims: the 58 cases and prompt descriptions were already known, and text/cartoon/caption cases still expose raw-model errors.

The two new cases were [an open Bosch top-loading washer](https://commons.wikimedia.org/wiki/File:Open_top-loading_washing_machine.jpg) and [a Miele heat-pump dryer](https://commons.wikimedia.org/wiki/File:Heat_Pump_Clothes_Dryer.jpg). Both raw highest-ranked categories were correct. The washer's raw score was only0.005964 and the dryer0.094042; both still request an explicit laundry-family choice. Acquisition requested ten photos but eight requests returned429; only the two downloaded and actually viewed cases count. Their manifest was frozen before outputs (`b69977c302b34c23b1e78854a27ada5c94acf46b5c7dfa2be635cc19eced5657`) and canonical pixel hashes were distinct from all58 prior images. No CLIP inference was run on these two, so no fresh-case model comparison is claimed.

### Independent sigmoid outputs need a different adapter

SigLIP returns independent sigmoid values, not CLIP's normalized candidate distribution. The pure adapter validates every expected label exactly once and all scores finite in[0,1], then converts odds to conditional relative weights: `softmax(log(p) - log1p(-p))`. Exact zero contributes no mass; all-zero arrays fail closed; exact-one entries share saturated mass. Raw scores and rank are retained, input is not mutated, and stable log-space computation avoids overflow. Neither raw nor normalized weights are calibrated identity probabilities.

The raw top-score floor0.01, relative top0.40 and lead0.15 were frozen before this adapter's author inspected SigLIP outputs, while the native model run was already in progress. The adapter freeze SHA256 is `52ac369efbc591f37097485df3dc0b11e66a51c1d3461e4bdf8c6b6941f73e06`; it must not be described as preceding all inference. Weak raw evidence cannot become a suggested identity just because normalization gives one candidate a high relative weight. Actual `frost-2`, `frost-3` and the user's Tesla therefore offer explicit manual choices instead of asserted matches. The Tesla remains an EV/PHEV setup question; no drivetrain was visually verified.

Pixel-detail checks, mandatory review, laundry/thermal-family choice, vehicle confirmation and advisory image styling remain. A **post-hoc** failure repair addresses the tiger photo with a misleading refrigerator caption: its category rawFrost0.012352 passes the raw floor, while the separate content comparison strongly favors animal/person/outdoor content (raw0.087 versus appliance-image0.00158). When that content class has raw strength≥0.01, relative weight≥0.40 and lead≥0.15, the result asks the user to review the main subject instead of asserting an appliance. This rule is generic and cannot prove authenticity; drawings, product renders, screenshots and outdoor backgrounds alone are not blanket vetoes. The user's robot and retro refrigerator still receive provisional Rover/Frost, installed outdoor AC examples remain reviewable, and the Tesla keeps manual EV recovery.

### Current replay outcome and verification

The actual60-score replay yields **21 provisional suggestions, 30 explicit manual-review results and 9 unsupported results**. No wrong appliance is asserted on this observed set. This is a post-hoc policy regression result, not zero-error model accuracy: ambiguous families deliberately ask users, raw classifier errors remain, and the contradiction repair was informed by an observed negative. All suggestions require confirmation and separate specification review. Plausible fake product imagery cannot be authenticated by this pipeline.

Raw60 scores and pixel metrics are preserved separately in `tests/fixtures/applimon-siglip-scores.json`; historical58 CLIP outputs remain unchanged. Fourteen new tests cover independent sigmoid normalization, raw weakness, logit invariance, exact endpoints/subnormal values, malformed/incomplete/duplicate labels, stable immutable ranking, actual user photos/outdoor AC, misleading captions, blank/text inputs, unsupported boundaries, family choices and pinned prompt/model identity. These fourteen plus the eight historical photo-policy regressions passed against actual source; scoped ESLint passed. The tests replay stored scores and do not pretend to rerun model inference. Combined app gates and browser acceptance remain the lead's responsibility.
