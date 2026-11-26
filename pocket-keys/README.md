# Pocket Keys

An on-screen piano that runs in your web browser. No install, no server, no build step.

## How to run it

1. Put these three files in the same folder: `index.html`, `style.css`, `app.js`.
2. Double-click `index.html`. It opens in your browser.
3. Click a key (or press `A`) to start the sound.

It works in Chrome, Edge, Firefox and Safari. The fonts load from the internet; with no
internet it still works, just with your computer's normal fonts.

## What each file does

| File | What it is |
|---|---|
| `index.html` | The page's structure: the screen, buttons, keyboard area and text. |
| `style.css` | How it looks: colors, fonts, sizes, light and dark mode. |
| `app.js` | How it works: making sounds, the keyboard, chord names, MIDI messages, recording and the songs. |

## Where to find things in `app.js`

Search the file for these headings (lines starting with `// ----------`):

- **Audio**: sets up the browser's sound engine (the Web Audio API, a built-in browser feature for making sound).
- `SOUNDS`: the six instruments. Each is built from simple waves (`sine`, `triangle`, `sawtooth`, `square`)
  plus an envelope: `a` = attack (how fast it starts), `decay`, `sustainLvl` (how loud while held), `r` = release (fade-out time).
- **Note state**: what happens when a key goes down (`noteOn`) or up (`noteOff`).
- **Keyboard UI**: draws the keys and handles mouse, touch and computer-keyboard presses.
- **Screen + chord names**: works out chord names like "C major".
- **MIDI log**: builds the MIDI messages shown on the page.
- **Record / play**: the Record and Play back buttons.
- **Songs**: the three songs.

## Writing your own song

Songs live in `SONGS` in `app.js`. A tune is written as `NOTE/beats`, for example:

```
E4/1 G4/1 C5/1.5 G4/0.5
```

means E4 for 1 beat, G4 for 1 beat, C5 for 1.5 beats, G4 for half a beat. `r/1` is one beat of silence.
Each bar is 4 beats, so the numbers in one bar should add up to 4.
Available notes are in `NOTE` (C4 to C5); add more there if you need them (C4 = 60, each key up adds 1).

Each section lists its `parts` (players). Every part has a `role` (`chords`, `melody` or `bass`),
a `snd` (`piano`, `organ`, `synth`, `pad`, `bass`, `bell`) and a `vel` (loudness, 1–127).
Copy the `parade` song, change the notes and sounds, save, and refresh the browser.
