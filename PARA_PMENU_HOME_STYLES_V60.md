# PARA V60 — PMENU Home Styles

PMENU v1 adds folder-based Home menu customization to PARA.

## What PMENU is
A Home Style is a normal folder. It contains exactly one `.pmenu` definition file at the folder root plus local image/audio assets beside it. `.pmenu` is not a ZIP/archive format and it does not execute JavaScript.

Example:

```
ChannelGrid/
├── ChannelGrid.pmenu
├── background.png
├── preview.png
└── assets/
    ├── games.png
    ├── apps.png
    └── ...
```

## Browser workflow
Open **Settings → Personalization → Home Styles → Choose Folder** and select the Home Style folder. PARA validates the PMENU definition and referenced assets, stores the installed style locally in IndexedDB, and lets the profile apply/remove it.

## PMENU v1 syntax

```
@pmenu 1

menu "My Home" {
  id "creator.my-home"
  author "Creator"
  version "1.0.0"
  background "background.png"
  preview "preview.png"
  accent "#8f5cff"
}

layout channel-grid {
  columns 4
  rows 2
  gap 18
}

item games {
  label "Games"
  route "games"
  icon "assets/games.png"
  position 1 1
}
```

Supported PMENU v1 layout types: `channel-grid` and `grid`.

## Safety / validation
- exactly one `.pmenu` file at the top of the selected folder
- no absolute paths or `../` path traversal
- local PNG/JPEG/WebP/GIF images and common audio formats only
- 160-file selection limit
- referenced assets capped at 24 MB total
- no JavaScript, `eval`, or custom executable code in a PMENU pack
- routes are declarative PARA routes

## Included example
`examples/home-styles/ChannelGrid/` is a working PMENU v1 folder with a background, preview, and eight local channel images.

## Validation
Targeted regression tests pass for PMENU plus V58/V59 recorder/music behavior. The PMENU parser also successfully parses the included ChannelGrid example.
