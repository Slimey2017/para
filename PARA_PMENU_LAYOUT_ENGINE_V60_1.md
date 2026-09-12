# PARA V60.1 — PMENU Layout Engine

V60.1 moves PMENU beyond one grid renderer. A Home Style can now swap the actual navigation composition while using the same safe folder-based `.pmenu` format.

## Layouts

PMENU v1 now accepts:

- `channel-grid` — Wii/channel-style grid with explicit item positions and sizes
- `grid` — generic grid alias
- `crossbar` — horizontal icon rail
- `blades` — tall side-by-side menu panels
- `carousel` — large snap-scrolling showcase cards

Example:

```text
@pmenu 1

menu "PARA Crossbar" {
  id "para.example.crossbar"
  author "PARA"
  accent "#9b5cff"
}

layout crossbar {
  gap 26
}

item games { label "Games" route "games" }
item music { label "Music" route "music" }
item settings { label "Settings" route "settings" }
```

The same item definitions and local assets work across all layouts. PMENU still executes no JavaScript.

## Why this matters

A Home Style is no longer just a wallpaper and reskinned grid. The layout block selects a real renderer mode, so a Wii-like channel grid, horizontal crossbar, blade dashboard, or large carousel can feel structurally different while all routes remain controlled by PARA.

## Included examples

`examples/home-styles/` now contains `ChannelGrid`, `Crossbar`, `Blades`, and `Carousel` sample folders.
