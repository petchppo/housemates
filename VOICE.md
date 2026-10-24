# Appliance calls and approved simulation

Open `/demo/home` after building a household. **Talk to your team** links to the interactive conversation. Select Evie, Bubbles or Chill, type a request, or open an optional browser voice call.

## Interaction

- Try `Find a cheaper plan`, `Find a lower-carbon plan`, `Make a balanced plan`, `Evie charged by 7 AM`, or `Bubbles finished by 10 PM`. Whole-hour deadlines and operating windows use the existing deterministic parser. Unsupported requests receive guidance; this is not a general-purpose LLM.
- **Call → Listen** explicitly requests microphone access. Recognition produces an editable draft. **Send reviewed transcript** submits it to the same command engine as text. Opening a call never starts capture. **Read new replies aloud** is optional and off by default.
- Every proposed schedule shows computed original/proposed cost, modeled emissions, timing and constraints. Only **Approve & run simulation** starts execution. Typed or spoken approval cannot bypass that button. Infeasible and stale proposals cannot run.
- Approval starts a separate simulated clock at 18:00. One simulated hour takes five seconds while the page is visible. Appliance start/completion messages and accrued energy, cost and carbon follow the approved schedule. Pause/resume or explicitly fast-forward simulated tasks for a demonstration.
- The preview slider never advances execution. Completed simulated results are reported only after the approved tasks finish. They are not measured savings or real appliance activity.
- An approved run stays fixed until **Start a new simulated day**. Updated constraints require a fresh proposal and approval. Chill can report its illustrative cooling activity but is never optimized.

## Architecture and persistence

`src/domain/demo-commands.ts` exposes pure, typed request, approve, reject, advance, pause, reset, serialize and restore functions. It reuses the conversation parser, scheduler, price/carbon profiles and simulation ledger. Context fingerprints bind proposals to the household, weather, prices and constraints. Proposal IDs remain monotonic across invalidation/reset so an old approval cannot authorize a different proposal.

`use-demo-commands.ts` owns the timer, conversation and storage adapter. `appliance-chat.tsx` renders computed proposals and explicit controls. `use-appliance-voice.ts` adapts native browser speech APIs, handles stale callbacks and releases audio resources on hang-up, selection changes, hidden pages and unmount. No speech SDK, API key or additional package is needed.

`housemates-demo-execution-v1` stores validated approved inputs and simulated progress on this browser. Restoration recomputes the schedule; unfinished runs restore paused. Profile changes invalidate incompatible saved runs. Audio, chat history and transcripts are not persisted. Storage failures leave a usable session-only experience with an explanation. Existing household memory uses a separate key.

## Voice boundaries

Browser speech recognition is not universally available and microphone permission is required. Typed input remains usable when recognition is unavailable or denied. The browser may send audio to its speech service. Reply synthesis prefers an available local voice, but the browser may use a remote service for text. This is disclosed before listening; do not promise offline voice or on-device processing.

References: [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition), [SpeechRecognition.stop](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/stop), [SpeechSynthesisVoice.localService](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice/localService).

There is no telephone/iMessage connection, physical device command or background automation. A future device adapter must distinguish accepted commands from device-confirmed completion. A future LLM can propose structured requests but must retain the same validation and explicit approval gate.

Automated tests exercise actual hook/component sources with mocked browser speech, clocks and storage. Physical microphone recognition and audible synthesis remain environment-dependent and have not been verified with a real recording.
