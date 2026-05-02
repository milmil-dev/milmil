# Schedule Card Size and Settings Mobile Design

## Goal

Let users adjust anime card density on the schedule page, and make the settings page feel deliberate on mobile screens.

## Design

The schedule page gets a `Small / Medium / Large` card-size selector in the existing header controls. The preference is stored in the existing persisted UI store so it survives reloads and applies to both current-season schedule timelines and off-season seasonal grids.

The settings page keeps its desktop two-column layout. On mobile, the tab list becomes a horizontal, scrollable icon-and-label rail instead of a wrapped button cloud. Content spacing tightens, settings cards use smaller mobile padding, and shared selector controls can wrap naturally on narrow screens.

## Testing

Add focused frontend tests around the persisted schedule card-size preference and the shared settings controls that make mobile layouts resilient. Run targeted Vitest checks plus typecheck after implementation.
