# Moment Finder — Build Plan

> Hand this file to Claude Code (VS Code) as the project brief. Start with **Phase 0** and do not skip it — several later decisions depend on what Phase 0 measures.

---

## 0. What we are building

A local web app that takes a **video (URL or upload)**, finds the **best moments**, and exports them as **ready-to-post clips** for TikTok, YouTube (Shorts + 16:9), Instagram Reels, X and LinkedIn — each clip with **word-level timestamps, transcript, captions and a reason why it was picked.**

Content types supported: **Podcasts/talking, Football, Cricket** (plus an **Auto** detect mode).

Two ways to use it, on the same screen:
1. **Auto highlights** (checkbox, **ON by default**) — press Run, get the top N moments of the whole video.
2. **Ask box** (optional) — the user types what they want ("every wicket", "when they talk about money", "the funniest part"); results appear in a separate **"Your ask"** tab.

---

## 1. Decisions already made (do not re-litigate)

| Area | Decision |
|---|---|
| AI provider | **OpenRouter only** — one key (`OPENROUTER_API_KEY`, read from environment, never committed, never logged). |
| Speech-to-text (ASR) | Dropdown populated **live** from OpenRouter's transcription models. **Default: `nvidia/nemotron-3.5-transcribe`** (seen on OpenRouter at $0.000017/s ≈ **$0.06 per audio hour**). Keep `elevenlabs/scribe-v2` etc. selectable. |
| Moment-selection LLM | Dropdown from OpenRouter. Default: a Claude model (see §11). Must also allow Qwen / DeepSeek / others for comparison. |
| Vision model (VLM) | **Optional** "second opinion" layer, dropdown with **Off** default for podcasts, **On** for sports. Only ever looks at **shortlisted candidates**, never the whole video frame-by-frame. Added in Phase 4.5. |
| Trackers (local) | Dropdown: **YuNet (faces, default)**, **MediaPipe (faces)**, **YOLOX (people + ball, for sports)**. |
| Licenses | Only permissive (Apache/MIT/BSD). **Do NOT use Ultralytics YOLO (AGPL-3.0).** Do not use InsightFace pretrained models (non-commercial). |
| Video plumbing | FFmpeg + OpenCV + yt-dlp. |
| Output presets | Platform presets in one editable settings file (see §7). X default = **1:1, 1080×1080**. |
| Build order | Podcast first, then football, then cricket, then VLM. |

---

## 2. Tech stack

**Runs locally (free):**

| Kind | Items |
|---|---|
| System | Python 3.11+, FFmpeg, Node.js (LTS) |
| Backend | FastAPI, uvicorn, pydantic, SQLite (via SQLModel or plain sqlite3) |
| Jobs | One background worker process to start (simple queue table in SQLite or `concurrent.futures`); Celery/Redis only if needed later |
| Video / audio | `yt-dlp`, `opencv-python`, `ffmpeg` (subprocess), `librosa`, `scenedetect` |
| Detectors | YuNet (`cv2.FaceDetectorYN`, model from `opencv/opencv_zoo` → `models/face_detection_yunet`), `mediapipe`, YOLOX via `onnxruntime` (ONNX export from `Megvii-BaseDetection/YOLOX`) |
| OCR | `paddleocr` (Apache-2.0) — fallback `pytesseract` |
| Smoothing | One-Euro filter (implement ~30 lines) or moving average |
| Backup aligner | Only if Phase 0 shows an ASR returns no word timestamps: Qwen3-ForcedAligner-0.6B (11 languages, ≤5 min per call) or NeMo Forced Aligner |
| Frontend | React + Vite + TypeScript |

**Through OpenRouter (paid per use):** ASR, LLM, (later) VLM.

---

## 3. Project structure

```
moment-finder/
  CLAUDE.md                 # short rules for the coding agent (see §12)
  README.md
  .env.example              # OPENROUTER_API_KEY=
  config/
    platforms.yaml          # output presets (§7) — editable, no code changes needed
    sports.yaml             # clip windows, thresholds per sport
  backend/
    app.py                  # FastAPI entry
    api/                    # routes: jobs, models, clips, settings
    core/                   # db, job queue, storage paths, logging
    providers/
      openrouter.py         # list models, transcribe, chat, vision — retries, timeouts, cost logging
      aligner.py            # backup word-timestamp aligner (only if needed)
    pipeline/
      ingest.py             # yt-dlp / upload, ffprobe, audio extraction, chunking
      transcribe.py         # call ASR, normalise to Transcript schema, stitch chunks
      detect_type.py        # Auto → podcast | football | cricket
      moments_podcast.py
      moments_sports.py     # shared sports signals + fusion
      football.py
      cricket.py
      ask.py                # user question → moments
      vision_check.py       # Phase 4.5
      snap.py               # snap cuts to sentence/silence boundaries
      track.py              # run chosen tracker, smoothing, crop paths
      render.py             # ffmpeg cut/crop/scale per platform
      captions.py           # ASS (animated word-by-word) + SRT
      export.py             # mp4/srt/json/thumbnail/zip
    trackers/
      base.py  yunet.py  mediapipe_tracker.py  yolox_tracker.py
  frontend/                 # React app
  scripts/
    phase0_asr_probe.py     # §5
    phase0_llm_probe.py
  samples/                  # test videos — gitignored
  data/                     # job outputs — gitignored
  tests/
```

---

## 4. Core data formats (use these exact shapes)

**Transcript** (every ASR output is normalised into this):
```json
{
  "language": "en",
  "duration": 3612.4,
  "asr_model": "nvidia/nemotron-3.5-transcribe",
  "timestamps_source": "asr | aligner",
  "words": [
    {"i": 0, "w": "Welcome", "start": 0.42, "end": 0.81, "speaker": "spk0"}
  ],
  "sentences": [
    {"i": 0, "start_word": 0, "end_word": 11, "start": 0.42, "end": 4.10, "speaker": "spk0", "text": "Welcome back to the show ..."}
  ]
}
```

**Moment** (output of every moment finder):
```json
{
  "id": "m_03",
  "source": "auto | ask",
  "mode": "podcast | football | cricket",
  "start": 761.2, "end": 798.9,
  "start_word": 2210, "end_word": 2301,
  "title": "Six over long-on",
  "hook": "He's gone big... that's out of the ground!",
  "reason": "crowd peak + commentary + score 145/3 → 151/3",
  "score": 92,
  "event": "six | four | wicket | goal | save | card | penalty | story | hot_take | funny | ...",
  "signals": {"audio": 0.91, "ocr": "145/3→151/3", "llm": 0.88, "vision": null}
}
```

**Clip output (per moment, per platform):** `clipNN_<platform>.mp4`, `clipNN.srt`, `clipNN.ass`, `clipNN.json` (Moment + the words inside it), `clipNN.jpg` (thumbnail).

---

## 5. Phase 0 — Verify assumptions (1–2 days) ⚠️ do this first

Nothing below is built until these are answered and written to `docs/phase0-results.md`.

1. **List transcription models** from OpenRouter (`/api/v1/models` filtered to transcription output) and save the list.
2. **ASR probe** (`scripts/phase0_asr_probe.py`): send the same 2-minute clip (one podcast, one football commentary, one cricket commentary) to each candidate model (at least Nemotron 3.5 Transcribe, ElevenLabs Scribe v2, and one OpenAI/AssemblyAI model if listed). Record per model:
   - Does the response include **word-level timestamps**? Speaker labels? Exact JSON shape.
   - Latency, cost reported in the response, and a quick accuracy eyeball.
   - Max file size / duration accepted; behaviour above 1 hour.
3. **Provider pinning**: confirm whether OpenRouter's provider routing options (`provider.only`, `allow_fallbacks: false`, `sort: "price"`) work on the transcription endpoint. Log which provider served each request.
4. **LLM probe** (`scripts/phase0_llm_probe.py`): send one real 1-hour transcript to 3–4 LLMs (Claude Opus/Sonnet/Haiku, one Qwen, one DeepSeek). Record: valid JSON rate, cost, latency, and a human 1–5 rating of clip quality.
5. **VLM probe**: does OpenRouter accept image input (and video input) for the vision models we'd use? Cost per image.

**Decision gates from Phase 0:**
- If default ASR returns **no word timestamps** → implement `providers/aligner.py` and mark `timestamps_source: "aligner"`.
- Pick default LLM by quality-per-dollar from the probe.

---

## 6. Pipeline (all phases)

```
1 Ingest → 2 Transcribe → 3 Detect type → 4 Find moments (Auto + Ask)
→ [4.5 Vision check] → 5 Snap cuts → 6 Track & crop → 7 Captions → 8 Render & export
```

### 6.1 Ingest
- URL → `yt-dlp` (best ≤1080p mp4). Upload → save as-is.
- `ffprobe` for duration, fps, resolution.
- Extract audio: 16 kHz mono (WAV/FLAC) for ASR + analysis.
- If > ~55 min, split into 55-min chunks with 5 s overlap; stitch words back and drop duplicates in the overlap.

### 6.2 Transcribe
- Call selected ASR via `providers/openrouter.py`. Normalise to **Transcript** schema. Build `sentences` from punctuation + pauses > 0.6 s + speaker change.
- Cache by (file hash, model) so re-runs don't re-pay.

### 6.3 Detect type (Auto)
- Keyword scoring on transcript (wicket, over, LBW, boundary / goal, offside, penalty, keeper) + optional 3-frame VLM check later. User override always wins.

### 6.4 Moments — Podcast
- Window the transcript (~5 min windows, 30 s overlap), send sentences **with sentence IDs** (not every word timestamp) to the LLM.
- Prompt asks for candidates with: start/end **sentence IDs**, title, hook line, reason, score 0–100, category. Use strict JSON (structured output / JSON schema); validate with pydantic; retry once on invalid JSON.
- Criteria: strong first line (hook), self-contained, complete thought/payoff, emotion/surprise/humour, quotable, 15–60 s (UI-configurable).
- Merge overlapping candidates, dedupe, rank, keep top N.

### 6.5 Moments — Sports (shared)
Compute per-second signals, normalise each to 0–1, fuse into an **excitement curve**:

| Signal | Implementation |
|---|---|
| Audio excitement | RMS loudness + spectral flux (librosa), z-scored vs rolling 2-min baseline |
| Commentary | LLM over commentary transcript windows → event candidates with timestamps |
| Scoreboard | OCR every 1–2 s inside a user-drawn **scoreboard box** (saved per source/channel) |
| Replays / cuts | PySceneDetect cut density + replay transition heuristics |
| Motion | OpenCV optical-flow magnitude on downscaled frames (2–5 fps) |

Peaks of the fused curve → candidates → LLM names & describes each.

**UI requirement:** on first sports run, show a sample frame and let the user **drag a box around the scoreboard**.

### 6.6 Football rules (`football.py`, thresholds in `config/sports.yaml`)
- Score change on OCR → **goal**. Broadcasters update late → search **backwards up to ~60 s** for the strongest audio/commentary peak; that peak is the goal moment.
- Other events from audio peaks + commentary: big chance, save, penalty, red/yellow card, VAR.
- Default window: **−15 s / +10 s** around the peak.

### 6.7 Cricket rules (`cricket.py`)
- Parse scoreboard `runs/wickets` (e.g. `145/3`) and overs (e.g. `18.4`).
  - wickets +1 → **wicket**; runs +4 in one ball → **four**; +6 → **six** (ignore extras where detectable).
  - Scoreboard updates *after* the ball → clip starts **~8–10 s before** the change (bowler run-up), ends **~10–15 s after** (celebration / first replay).
- From commentary/LLM: catches, run-outs, DRS reviews, milestones (50, 100, five-for).

### 6.8 Ask mode (`ask.py`)
- Input: user question + transcript (podcast) or **event list + commentary** (sports).
- LLM returns matching moments (same Moment schema, `source: "ask"`) with reasons; shown in **"Your ask"** tab.
- If the question is visual ("when the keeper dives") and VLM is enabled → sparse frame sampling (1 frame / 2–3 s), VLM flags regions, then look closer. If VLM is off → tell the user plainly that visual questions need the Vision check.

### 6.9 Vision check (Phase 4.5, `vision_check.py`)
- For each shortlisted candidate (≈30), send 6–8 frames to the selected VLM: confirm/reject the event, add a description, choose best thumbnail frame.
- Hard cap on images per job (configurable) to bound cost.

### 6.10 Snap cuts (`snap.py`)
- Move start/end to nearest sentence boundary or silence (> 300 ms) within ±1.5 s. Never cut mid-word. Enforce min/max length.

### 6.11 Track & crop (`track.py`)
- Sample frames at ~5 fps with OpenCV; run selected tracker.
- **Podcast:** target = face of the active speaker. v1 heuristic: speaker label + largest/most central face; hold on speaker changes with a short ease. (Voice-to-face matching is a later improvement.)
- **Sports:** target = ball (YOLOX "sports ball"); if lost, centroid of player cluster. If crop would drop important action → **fit-with-blurred-background** fallback.
- Smooth target path (One-Euro), clamp to frame, interpolate to full fps.
- Compute tracking **once per moment**; every platform preset re-uses it.

### 6.12 Captions (`captions.py`)
- ASS with word-by-word highlight (karaoke style) + plain SRT.
- Caption position/size/style **per platform** from `platforms.yaml` (safe zones). Burn-in is a checkbox.

### 6.13 Render & export
- FFmpeg: cut → crop path (or blurred-bg) → scale to preset → burn captions (optional) → H.264/AAC mp4.
- Per-platform length check against preset max; warn + offer trim.
- "Download all" → zip.

---

## 7. Output presets (`config/platforms.yaml`)

| Preset | Aspect | Size | Notes |
|---|---|---|---|
| tiktok | 9:16 | 1080×1920 | captions clear of bottom & right UI |
| youtube_shorts | 9:16 | 1080×1920 | respect Shorts max length |
| instagram_reels | 9:16 | 1080×1920 | |
| youtube | 16:9 | 1920×1080 | **no crop**, original framing |
| x | **1:1 (default)** | 1080×1080 | alt: 4:5 1080×1350, 16:9, 9:16 |
| linkedin | 1:1 (default) | 1080×1080 | alt: 16:9, 9:16 |
| feed_4x5 | 4:5 | 1080×1350 | max feed height (X/LinkedIn/IG/FB) |
| custom | any of 9:16, 1:1, 4:5, 16:9 | | |

Each preset: `aspect, width, height, max_seconds, caption_safe_zone {top,bottom,left,right}, caption_style`. Values for max length and safe zones **must be checked against each platform's current official specs before launch** — keep them editable.

---

## 8. UI spec (React)

**Input panel**
- URL field / file upload
- Dropdowns: Content type (Auto/Podcast/Football/Cricket), ASR model (live from OpenRouter), LLM (live), Vision check (Off / models), Tracker (YuNet/MediaPipe/YOLOX)
- **Export for** checkboxes: TikTok, YouTube Shorts, Instagram Reels, YouTube 16:9, X, LinkedIn, Feed 4:5, Custom
- ☑ **Find best moments automatically** (default ON)
- **Ask** textarea (optional)
- Number of clips, min/max clip length, burn-in captions checkbox
- **Run** button + estimated cost shown before running (ASR minutes × price + LLM estimate)

**Progress panel:** stage list with ticks (Downloading → Transcribing → Finding moments → Tracking → Rendering), live log line, cancel button.

**Results**
- Tabs: **Auto highlights** | **Your ask**; sub-tabs or filter per platform.
- Each clip card: video player, rank, score, time range, title, hook, **reason**, signals.
- **Transcript under the player with word highlighting as it plays; click a word to seek.**
- Trim start/end (±0.5 s nudges, or drag on a mini timeline) → **Re-render** (re-uses tracking).
- Download MP4 / SRT / JSON per clip; **Download all (ZIP)**.

**Settings page:** OpenRouter key status (present/missing — never display the key), default models, preset editor (reads/writes `platforms.yaml`), saved scoreboard boxes.

**API (FastAPI)**
```
GET  /api/models?type=transcription|text|vision
POST /api/jobs                 (url|upload + options) → job_id
GET  /api/jobs/{id}            status, stage, progress, cost so far
GET  /api/jobs/{id}/moments    ?source=auto|ask
POST /api/jobs/{id}/ask        new question on an existing transcript (no re-transcribe)
POST /api/clips/{id}/trim      {start, end} → re-render
GET  /api/clips/{id}/download?platform=tiktok&format=mp4|srt|json
GET  /api/jobs/{id}/zip
POST /api/scoreboard-box       {source_key, x, y, w, h}
```

---

## 9. Phases & acceptance criteria

| Phase | Deliverable | Done when |
|---|---|---|
| **0. Verify** (1–2 d) | Probe scripts + `docs/phase0-results.md` | All §5 questions answered with real responses saved |
| **1. Podcast CLI** (~1 wk) | `python -m moment_finder run <url>` → top N clips (16:9, no crop) with SRT + JSON | On 3 sample podcasts, ≥7/10 clips judged "postable"; no mid-word cuts |
| **2. UI** (1–2 wk) | Full UI §8 incl. Ask box, word-highlight transcript, trim, downloads, cost estimate | Same results as CLI; Ask returns relevant clips for 5 test questions |
| **3. Crop & presets** (~1 wk) | Tracker dropdown, 9:16/1:1/4:5, platform presets, safe-zone captions | Talking-head clips keep the speaker framed with no visible jitter |
| **4. Football** (1–2 wk) | Sports signals, scoreboard box, goal/save/card detection, YOLOX tracking, blurred-bg fallback | On 2 full matches: all goals found; ≤30% false highlights in top 10 |
| **5. Cricket** (1–2 wk) | Runs/wickets/overs parsing, four/six/wicket, cricket windows | On 2 matches: ≥90% of wickets & sixes found |
| **4.5 Vision check** | VLM confirm/reject + visual Ask | Measurably fewer false highlights vs Phase 4/5 at known extra cost |
| **6. Polish** | Auto type detection, caption styles, offline ASR fallback (faster-whisper), speed/cost tuning | — |

---

## 10. Risks / open items

- **ASR via OpenRouter may return plain text only** for some models → backup aligner (Phase 0 decides).
- **Scoreboards differ per broadcaster** → user-drawn box, saved per source.
- **Copyright:** clipping TV sports broadcasts for public reposting gets taken down fast. Intended for own/licensed/amateur footage. Show a short notice in the UI.
- **Speaker-to-face matching** is approximate in v1.
- **Platform specs change** → presets are config, verify before launch.
- **Cost control:** show estimate before Run; cap VLM images per job; cache transcripts and LLM results by content hash.

---

## 11. Which models

**For building the app (Claude Code in VS Code):** **Claude Opus 5.5** — best at multi-file, multi-step builds like this. Use high effort for Phase 0 design, pipeline and tracking code; normal effort is fine for UI boilerplate. If usage limits/cost matter, Claude Sonnet 5.5 handles routine tasks (UI components, tests, config) well.

**Inside the app (moment-selection LLM via OpenRouter):** default to **Claude Opus 5.5**, and make Phase 0's LLM probe decide whether a cheaper model holds quality:
- Anthropic list prices per 1M tokens (input/output): Opus 5.5 $4/$20, Sonnet 5.5 $2/$10, Haiku 5.5 $0.10/$0.50. OpenRouter usually passes these through — confirm on OpenRouter.
- A 1-hour podcast transcript sent as sentences is roughly 15–25K input tokens → a few cents to ~15¢ per video depending on model (reasoning tokens extra — measure in Phase 0).
- Also test one Qwen and one DeepSeek model in the probe.

---

## 12. Rules for the coding agent (put in `CLAUDE.md`)

- Read this plan first; work phase by phase; don't start a phase until the previous one's "Done when" passes.
- `OPENROUTER_API_KEY` from env only. Never print, log, or commit it. `.env` is gitignored.
- Every external call (OpenRouter) goes through `providers/openrouter.py` with timeout, retries with backoff, and cost logging per job.
- All model outputs that drive code are **schema-validated JSON** (pydantic); invalid → one retry → fail the stage with a clear message.
- No AGPL or non-commercial dependencies. Check the LICENSE of anything new before adding it.
- Keep thresholds and presets in `config/*.yaml`, not in code.
- Cache expensive steps (download, transcript, LLM results, tracking) by content hash.
- Samples and outputs (`samples/`, `data/`) are gitignored.
- Write small tests for: transcript normalisation, chunk stitching, snap-to-boundary, scoreboard parsing (cricket `145/3`, `18.4`; football `2-1`), preset sizing.
