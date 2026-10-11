---
id: 0023
title: Downloading after the game has started
status: proposed
date: 2026-10-11
supersedes: []
superseded_by: null
---

# 0023. Downloading after the game has started

## Context

ADR 0010 says: "Nothing assumes being online after load. After the machine folder is fetched, no layer makes a network request." Two later decisions need requests after that point. ADR 0018 loads the sounds after the round starts. ADR 0015 loads one customer per round, and on 2026-10-11 the owner chose how: "Progressive download. As the user is playing the first customer, the next download." Each customer is its own file of up to 1.5 MB, and the next one downloads while the current round is played, so a player never waits for a customer and never downloads all of them at once.

This ADR replaces the paragraph "Nothing assumes being online after load" of ADR 0010. The rest of ADR 0010 (the layers and the boundary test) stays in force, and its history gets a line saying so.

## Decision

- **What may download after the first screen, and nothing else without a new ADR:**
  - the sounds (ADR 0018), after the player presses Start;
  - customer files (ADR 0015), as below.
- **Customers download one at a time.** Each customer is its own file, within ADR 0015's budget (1.5 MB, 15,000 triangles). The first round's customer downloads with the machine, behind the briefing screen. When a round starts, the app chooses the next round's customer at once, and that customer's file downloads in the background while the round is played. For the daily, the customer is the day's customer (ADR 0005), so nothing extra is needed.
- **Nothing waits on a late download.** If a sound or a customer has not arrived, or fails, the game plays without it: no sound, or no figure in the scene. Patience, walk-outs and the score never depend on whether a file arrived, because they live in `core` (ADR 0004, ADR 0010).
- **Played offline, the game still works** with what it already has. The browser's normal cache keeps files that have downloaded once. No service worker; that would be its own decision.
- **Late downloads are made only by `render` (models) and `platform` (sounds),** through the existing loaders. `core` never fetches anything.

## Consequences

The first load stays small, and each round shows a customer with no wait on all but the slowest connections. The cost: the game now relies on the network after load for the extras, so a dropped connection mid-game means a round with no figure or no sound. The app must choose the next customer one round ahead, which is a small change to how free play picks customers. Tests and the browser check must cover a missing or slow customer file.

## History

- 2026-10-11: proposed by Claude, from the owner's answer quoted above.
