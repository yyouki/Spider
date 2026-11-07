# Space UI design references

The SVGs in this directory are design source artboards. They guide React components and styles; the app does not render the full-screen artboards as runtime images.

| Reference | App implementation |
| --- | --- |
| space-chat.svg | src/app.tsx chat workspace and src/styles.css |
| space-ide-desktop.svg | src/ide.tsx and src/ide.css |
| space-ide-mobile.svg | Responsive IDE layout in src/ide.css |
| space-analytics.svg | src/analytics.tsx and src/styles.css |
| space-settings.svg | Settings controls in src/app.tsx and src/styles.css |
| space-design-system.svg | Shared color, typography, spacing, radius, and component tokens |

## Applied visual direction

- Light surfaces use #FAFAF9, #F1F1EF, and #E2E2DF.
- Interface text uses #1C1D1F; the accent is #2F7D6D.
- The IDE dark palette uses #1B1C1F, #17181B, and #2A2C31, with #4FB39C as its accent.
- Interface and code fonts use local/system fallbacks; no external font download is required.
- Mobile chat adapts the desktop chat reference through CSS breakpoints because there is no separate mobile chat artboard.
- The existing IDE light theme uses the shared light palette; there is no separate light desktop IDE artboard.

The current implementation preserves existing chat, workspace, analytics, settings, and IDE behavior. The artboards are design guidance, not a claim that every illustrated control or placeholder is implemented as a product feature.
