# Scan evaluation: electrical specifications

## OCR evaluation — October 24, 2026

**Result:** actual local OCR was exercised on 16 images: three official specification-sheet page renders and thirteen generated labels. The Bosch sheet yielded its correct 2,400 W electrical rating; two dense table sheets needed manual entry. The exercise found and repaired standby-power and range-endpoint parsing errors. It also confirmed that OCR cannot authenticate a plausible fake label.

Category-photo recognition has a separate evaluation in [SCAN-PHOTO-EVALUATION.md](SCAN-PHOTO-EVALUATION.md). Neither evaluation is a population accuracy benchmark or physical-phone certification.

### Method and source truth

Downloaded source PDFs were rasterized from page 1 with macOS PDFKit at approximately 144 dpi (1190 × 1683). The actual rendered pages were visually inspected before evaluation. Generated fixtures use readable black text on white backgrounds, 1300 pixels wide. Every fixture was processed with the installed **Tesseract.js 7.0.0**, English language data and a real local worker; no OCR responses were mocked. The resulting text went through the actual `parseNameplateText` source, transpiled with TypeScript targeting ES2022. The first harness experiment used an unsuitable transpilation target; those empty-parser results were discarded and all cases rerun with the corrected harness before any reported result.

The actual before/after run artifacts, original PDFs, page PNGs, generated labels and raw OCR text are kept outside the repository at `/private/tmp/housemates-scan-eval/ocr`. Third-party pages are not application assets. No fixture was uploaded to an inference service. OCR confidence scores are not reported as confidence in a device's identity, electrical specification or authenticity.

| Official source, inspected page 1 | Source truth relevant to this test | Actual post-repair candidates | Assessment |
| --- | --- | --- | --- |
| [Bosch SPI2HKS42E manufacturer specification sheet](https://media3.bosch-home.com/Documents/specsheet/en-SG/SPI2HKS42E.pdf) | Connection rating 2400 W; energy 76 kWh per 100 eco cycles | Power `[2400]` W; cycle energy `[]` | Correct power; correctly withholds period-qualified energy rather than presenting 76 kWh as one run. OCR garbled some surrounding prose but preserved the rating. |
| [Samsung WW11DB8B95GH manufacturer product fiche](https://images.samsung.com/is/content/samsung/p6/common/energylabel/common-energylabel-ww11db8b95ghu5-productfiche.pdf) | Eco-cycle energy 0,318 kWh, laid out in a separate table value cell; no operating electrical input on this page | Power `[]`; cycle energy `[]` | Conservative manual fallback. OCR retained the comma value but interleaved table columns. The parser does not guess column association or comma decimal meaning. |
| [Bosch SMV6ZCX49E supplier fiche in EU EPREL](https://eprel.ec.europa.eu/fiches/dishwashers2019/Fiche_250863_EN.pdf) | Eco-cycle energy 0,747 kWh in a separate cell; standby/delay values are not running power | Power `[]`; cycle energy `[]` | Conservative manual fallback; no invented operating rating. OCR retained the comma energy value, but the unit/value association is not safely recovered by this parser. |

Official-source figures above are label declarations for specific models/programmes, not measurements of the user's appliance. No model number lookup, branded identity confirmation or automatic consumption import is implemented.

### Generated adversarial fixtures and actual results

All cases below are **generated QA text**, not real nameplates. `[]` means no candidate was offered. Power is W and energy is kWh per modeled task.

| Fixture | Intended challenge | Before repair | Actual post-repair result |
| --- | --- | --- | --- |
| `clean-positive.png` | Explicit electrical 2000 W and per-cycle 0.70 kWh | `[2000]`, `[0.7]` | `[2000]`, `[0.7]` |
| `annual-stacked.png` | 120 kWh followed on another line by per annum; electrical 100 W | `[100]`, `[]` | `[100]`, `[]`; annual energy withheld |
| `bad-units.png` | Negative power, comma-formatted energy, volts/amps only | `[]`, `[]` | `[]`, `[]`; no voltage × current guess |
| `range.png` | 100-200 W and 0.5-1.2 kWh | `[]`, `[]` | `[]`, `[]` |
| `spaced-range.png` | 100 - 200 W and 0.5 - 1.2 kWh | **Incorrect `[200]`, `[1.2]`** | `[]`, `[]`; separated range endpoints rejected |
| `unit-bearing-range.png` | Units on both range endpoints, e.g. 100 W - 200 W | Peer source replay found incorrect first endpoints `[100]`, `[0.5]`; no pre-fix image run | Actual post-fix OCR: `[]`, `[]` |
| `standby-only.png` | Network standby 2 W, off-mode 1 W, delay start 4 W | **Incorrect `[2,1,4]`, `[]`** | `[]`, `[]`; non-operating ratings withheld |
| `standby.png` | Standby/off-mode plus rated input 2000 W | **Incorrect `[2,1,2000]`, `[]`** | `[2000]`, `[]`; keeps explicit active rating |
| `thermal.png` | Cooling output 3500 W adjacent to electrical input 1200 W | **Missed input: `[]`, `[]`** | `[1200]`, `[]`; thermal output still rejected |
| `unicode-negative.png` | Unicode minus on 500 W and 1.2 kWh | `[]`, `[]` on this OCR output | `[]`, `[]`; OCR normalized minus; direct Unicode text also covered by regression |
| `scientific.png` | Unsupported scientific notation plus explicit positive +500 W | `[500]`, `[]` | `[500]`, `[]`; no exponent fragments accepted |
| `unrelated.png` | Garden-club invitation without electrical data | `[]`, `[]` | `[]`, `[]` |
| `fake-plausible.png` | Fictional label with plausible 2000 W / 0.70 kWh values | `[2000]`, `[0.7]` | `[2000]`, `[0.7]`; **authenticity cannot be established** |

The fake-label result is a limitation, not a successful fraud detection. Even a visibly fictional label can contain syntactically valid specifications. The UI must keep values provisional until the user checks the real appliance or documentation. There is no authenticity classifier, cryptographic manufacturer verification or measured-power sensor.

### Repairs and regression evidence

`src/domain/nameplate.ts` now:

- Excludes standby, off-mode and delay-start wattage from operating-power candidates, including stacked labels.
- Preserves explicitly identified electrical input on its own line even when a neighboring line states cooling/heating output. Mixed input/output ratings on one ambiguous line still require manual entry.
- Rejects spaced ranges (including units on both endpoints) and separated negative signs, normalizes common Unicode dash/minus forms, and never selects only a range's final value.
- Retains existing annual/per-100-cycle/weight-qualified abstention, comma ambiguity checks, value bounds and no voltage/current inference.

After the initial repairs, the real OCR batch was rerun for all 15 initial fixtures. Independent review then found unit-bearing ranges could retain the first endpoint; the parser was repaired, regression coverage extended, and a sixteenth image exercised through actual OCR with no candidates returned. Final parser replay over the stored OCR text confirms the original 15 outcomes remain unchanged. Six catalog/parser tests and five actual-source specification-form tests passed (11 total), including new regressions for the discovered failures. ESLint and diff checks are recorded separately in the lead's integration log. Independent review and integrated application acceptance are tracked in [PROGRESS.md](PROGRESS.md); this report does not assert a final production gate has passed.

### What this does and does not establish

This is a small, deliberately selected robustness evaluation. It demonstrates real inference, useful candidates on one official electrical sheet, conservative failure on two table-heavy energy sheets, and targeted fixes for generated adversarial cases. Generated labels are clean and easy to read; downloaded PDF rasters avoid glare, curvature, dirt and perspective. No real-world nameplate photograph or physical phone camera was exercised here. Low light, damage, alternate languages, deceptive labels, table recovery and broader device coverage remain unverified. The public browser UI's worker lifecycle is covered by component tests; these local engine runs are not a cross-browser runtime benchmark.

Manual review is required permanently. A nameplate often supplies maximum electrical rating without per-cycle energy, so a confirmed rated-power estimate must remain explicitly labeled. Protected AC, refrigerator and water-heater policies still apply regardless of any recognized text. No OCR result approves a schedule, connects a device or controls hardware.
