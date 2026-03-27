# Seanime-Style Web UI Design

**Date:** 2026-03-26
**Area:** `web/`
**Status:** Approved

## Goal

Redesign the milmil web UI so it feels much closer to Seanime's dense, always-dark, media-first desktop app experience while remaining recognizably milmil and keeping existing routes and API contracts stable.

## Product Direction

milmil should feel like an anime media cockpit rather than a route-by-route dashboard. The redesign will prioritize:

- always-dark presentation
- layered, immersive surfaces instead of empty page canvases
- denser information hierarchy and stronger metadata grouping
- heavier use of poster and banner art
- a more connected "watch session" feeling between home, detail, and player pages
- responsive adaptation that changes the experience on mobile instead of compressing the desktop shell

## Visual Direction

The target mood is closer to Seanime's desktop shell:

- darker, tinted neutrals with restrained accent usage
- compact but readable typography
- stronger poster art presence
- rich headers and section frames instead of repeated generic card grids
- chrome that feels like app UI, not website scaffolding

This is not intended to be a pixel copy of Seanime. The goal is to push much closer to its density, layout conventions, and immersive feel without cloning branding.

## Shell Redesign

The current shell will be replaced with a more substantial app frame:

- a wider desktop sidebar with labels and clearer active states
- a denser top context bar for page context, quick actions, and search affordances
- a darker layered content canvas that avoids the current light-theme failure mode
- mobile and tablet navigation that adapts to the viewport instead of preserving the fixed desktop rail

The application will be always dark. Theme switching and system/light ambiguity will be removed from the main user experience.

## Home Page

Home will become a control-center style dashboard:

- featured hero with richer metadata and primary actions
- stronger continue-watching rail styled as active viewing sessions
- compact airing and up-next sections with denser rows
- more intentional discover/trending composition with richer surfaces
- optional contextual side content on larger screens for library and queue-like status

The page should feel curated and operational rather than like a sequence of independent sections.

## Anime Detail Page

Anime detail will become a cinematic landing page:

- larger, darker, art-led header
- stronger grouping of poster, title, stats, tags, and actions
- tighter metadata and synopsis structure
- episode list that reads like a watch queue, not a plain list
- less dead space and better balance between content blocks

## Watch Page

Watch will become a session shell:

- the player remains central but gains surrounding context
- related metadata, episode navigation, danmaku state, and next actions are brought into the frame
- the page should feel like an active watch environment, not just a player embed plus status text
- the player styling should feel integrated with the app shell

## Responsive Strategy

Responsive work is part of the redesign, not a follow-up:

- desktop keeps the richer rail and app-shell structure
- tablet and phone layouts collapse into stacked, touch-friendly flows
- mobile navigation must stop wasting viewport width with a permanent rail
- multi-column schedule and other dense layouts must adapt to a single-column or sectional presentation on small screens

## Technical Constraints

- keep the current router structure and API integration intact where possible
- prefer presentation-layer refactors over backend changes
- harden image fallback handling so failed remote covers still produce intentional UI
- add targeted UI tests for theme behavior, shell states, and key responsive layout conditions

## Success Criteria

The redesign is successful when:

- the app is consistently dark and visually coherent on first load
- the shell feels much closer to Seanime's dense desktop UI language
- home, detail, and watch feel like one continuous product experience
- mobile no longer feels like a squeezed desktop layout
- image failures and empty states no longer collapse the visual atmosphere
