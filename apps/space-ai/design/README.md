# Spider interface direction

The live interface is implemented in React and CSS. Spider's current direction is defined by the implemented components and design tokens in `src/styles.css` and `src/ide.css`. The earlier Space artboards are historical exploration, not binding layout specifications.

## Design principles

- A quiet, high-contrast workspace with a persistent navigation rail and an uncluttered work area.
- A restrained warm accent for primary actions, active navigation, and meaningful status.
- Comfortable reading sizes, consistent surfaces, and clear hierarchy across Chat, IDE, Analytics, Settings, and authentication.
- Responsive desktop and mobile layouts, visible keyboard focus, and reduced-motion support.
- Keep the full existing feature set and the user's persisted workspace/session data intact while the interface evolves.

## Implementation

- Shared tokens and application shell: `src/styles.css`
- Code workspace surfaces: `src/ide.css`
- Chat and application flows: `src/app.tsx`
- Analytics dashboard: `src/analytics.tsx`
- Authentication and metadata: `index.html`

The SVGs in this directory may be inspected for context, but the live app should follow the current implementation and accessibility/responsive requirements.
