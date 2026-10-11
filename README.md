# cwal-guides

The build-order guides on [cwal.gg/builds](https://cwal.gg/builds) live here, one
YAML file per guide in [`articles/`](articles). Anyone can add or improve one.

**Write one in the browser:** the [Build Order Builder](https://dxrsz.github.io/cwal-guides/)
lets you fill in a guide with a form, no YAML needed, and preview it as the full
guide, the cheat sheet, and the browse card, rendered by the same code cwal.gg
uses. The form writes the YAML for you; a YAML tab is there if you prefer typing. When it shows no
problems, click **Open a pull request on GitHub**.

## Contributing

1. Open the [Build Order Builder](https://dxrsz.github.io/cwal-guides/).
   Start from the blank template, or pick a published build to edit.
   Or drop a replay (`.rep`) anywhere on the page, or pick **New, from a replay…**:
   choose a player and their first 8 minutes become the starting steps.
2. Fill in the details and add steps in the **Visual** tab (or write YAML in the
   **YAML** tab; both edit the same file) until the panel under the editor says
   **Looks good**.
3. Click **Open a pull request on GitHub**. GitHub forks the repo for you and
   opens your file; click **Propose new file** (or **Propose changes**), then
   **Create pull request**.

The file name becomes the url: `articles/nyoken-2rax-academy.yaml` is
`cwal.gg/builds/nyoken-2rax-academy`. A check runs on every pull request and
fails with the same messages the builder shows.

Prefer working locally? `npm install`, then `npm run dev` serves the builder (the
first run downloads the replay engine, about 9 MB, from the
[build classifier's sandbox](https://dxrsz.github.io/cwal-build-classifier/)) with
your local `articles/` in the guide menu, and `npm run check` validates
every article.

## Article format

```yaml
title: Nyoken's 2-Rax Academy
matchup: TvZ # race v race: TvZ, PvT, ZvZ…
creator: Nyoken # who devised the build (optional)
submitter: Dex # who wrote it up (optional)
tagline: Marine-heavy 2-rax into fast vessels. # browse card line (optional)
objective: >-
  The overview at the top of the guide: what the build is for and how it
  wins. `>-` lets a long text wrap over several lines.
references: # optional
  - youtube: https://www.youtube.com/watch?v=qkY8kKXPK7g
  - replay: https://example.com/game.rep
    label: Download the replay # optional link text

steps:
  - section: Opener # starts a titled section (optional)
    at: 9 supply
    make: Supply Depot
    description: Sent at 8 supply, for the wall.

  - at: 11 supply
    make: Barracks

  - at: Barracks 100% # when that Barracks finishes
    make: 8 Marine
    notes: >-
      The deeper why. Hidden behind a "notes" toggle in the guide.
```

### Stages and choices

A guide can be written in **stages** instead of one `steps:` list. A stage is
either shared (everyone plays it) or a **choice**: a question the reader
answers, with a few options, each with its own steps. Paths split at a choice
and rejoin at the next shared stage. Keep choices to the big forks (what the
scout saw, what the opponent techs to); a guide is not a full decision tree.

```yaml
stages:
  - title: Opener
    steps:
      - at: 8 supply
        make: Pylon
  - title: Against the Zerg opener
    choose: What did your scout see?
    options:
      - id: pool-first # lowercase words joined by -
        label: 9 pool / overpool
        read: Lings arrive before the Nexus finishes # how you know (optional)
        steps:
          - at: Forge 100%
            make: 2 Photon Cannon
      - id: hatch-first
        label: 12 hatch
        steps:
          - at: 14 supply
            make: Nexus
  - title: Tech # shared again: the paths rejoin
    steps:
      - at: Nexus 100%
        make: Gateway
```

- The guide shows each choice as tabs under its stage title, and a bar at the
  top with every choice on the path. The cheat sheet shows the picked path.
- Options with the **same `id`** in two stages are one choice: picking it once
  carries through. Use that to keep a path split across several stages.
- A stage's title heads its steps, so the first step of a stage (or option)
  has no `section:`. Later steps can still start sub-sections.
- `Academy 100%` cues look back along the reader's path: within the option,
  then earlier stages (the option with the same id, else the first option).
- In the builder, **Split into stages** turns a guide's sections into stages;
  **Make this a choice** turns a stage into options.

### Step fields

| Field         | What it does                                                                                                                                                          |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `at`          | **Required.** When the step happens (see cues below).                                                                                                                 |
| `or`          | A second cue shown next to the first: `at: 23 supply` + `or: 3:15`.                                                                                                   |
| `make`        | What is built: `Barracks`, `8 Marine`, or a list `[Refinery, Academy]`.                                                                                               |
| `use`         | `true` when the step _uses_ the pictured thing instead of building it (scout with an SCV, move out with the army). Shown on the right, muted. Needs an `instruction`. |
| `instruction` | The action when it isn't a plain build: `Move out`, `Cut SCVs`.                                                                                                       |
| `description` | A short line under the step, always shown.                                                                                                                            |
| `notes`       | The longer reasoning, folded away behind a toggle.                                                                                                                    |
| `before`      | A note shown above the step.                                                                                                                                          |
| `section`     | Starts a new titled part of the timeline (`Opener`, `Follow-up`…).                                                                                                    |
| `id`          | Only needed for `@id` cues (below).                                                                                                                                   |
| `sources`     | Where the step comes from: replay numbers, or the moment in a video. Shown behind a **sources** toggle. See [Sources](#sources).                                      |

A step needs `make`, an `instruction`, or both.

### Cues (`at` and `or`)

| Write                            | Means                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| `11 supply` (or just `11`)       | at 11 supply                                                                                    |
| `3:15`                           | at 3:15 on the game clock                                                                       |
| `Academy 100%` or `Academy done` | when the Academy finishes. Any percentage works: `Factory 50%`.                                 |
| `next`                           | right after the previous step. Use sparingly; tying a step to something finishing reads better. |

A `100%` cue links to the most recent earlier step that builds that thing, and
the guide draws an arrow between them. To point at a different one, give that
step an `id` and add it to the cue: `at: Barracks 100% @rax1`.

### Sources

A step can say where it comes from, so a reader can check it. Each source is
the numbers from replays, or a link to the moment in a video (or a replay)
where it's shown or said:

```yaml
- at: Control Tower 100%
  make: Valkyrie
  sources:
    - replays: # what players actually did
        players: 69 # how many of the replays' players took this step
        at: 5:52 # median time it was started
        range: 5:43-6:00 # where the middle half fell
        supply: 46 # optional
        workers: 34 # optional
        note: First Valkyrie # optional
    - youtube: https://youtu.be/DTiVu7wNKkQ?t=398 # link at the moment; the guide shows "@ 6:38"
      label: 'FanTaSy: TvZ Lesson 5'
    - replay: https://cwal.gg/viewer?match=MM-…
      label: Speed vs Zerg
```

In the builder, each step has **+ Add a source**.

### Names

Write things by their in-game name: `Engineering Bay`, `Siege Tank`,
`U-238 Shells`, `Stim Packs`. Case doesn't matter, and common shorthand works
(`ebay`, `rax`, `cc`, `depot`, `vessel`, `goon`, `ling speed`…). The builder
suggests the right name if it doesn't recognise one. The full lists are in
[`src/data/`](src/data).

To show a different label, or to say which kind of thing a name is, write the
item out:

```yaml
make:
  - tech: Stim Packs
    label: Stim Pack
  - upgrade: Terran Infantry Weapons
    label: +1 Attack
  - unit: Marine
    count: 4
```

## What's in this repo

| Path                   |                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| `articles/`            | The guides. `order.json` sets the order on the browse page; builds not listed come after, by name. |
| `src/parse.ts`         | Turns an article into the data the guide renders, with friendly errors.                            |
| `src/*.svelte`         | The guide, cheat sheet and browse components. cwal.gg renders these directly.                      |
| `src/data/`, `assets/` | Brood War names and icons, by game id.                                                             |
| `preview/`             | The Build Order Builder page. `npm run build` writes it to `dist/`.                                |
| `scripts/check.ts`     | The article check CI runs.                                                                         |

cwal.gg includes this repo as a git submodule and imports `src/` as is, so a
merged article goes live once cwal.gg picks up the new commit.

The build-order classifier (the rules that label a player's build from a
replay, and its sandbox) lives in
[dxrsz/cwal-build-classifier](https://github.com/dxrsz/cwal-build-classifier).
