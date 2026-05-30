# UI & Layout Guidelines

## 1. Viewport & Scrolling
- **Strict Viewport Fitting**: Main application screens (like Login/Signup, Main Dashboards) must fit exactly within the screen viewport. 
- Avoid unnecessary vertical or horizontal scrolling.
- Use `h-screen`, `w-full`, and `overflow-hidden` on main container wrappers to enforce strict boundaries.
- Allow scrolling **only** within specific internal content containers (using `overflow-y-auto`) if the content exceeds the allocated space.

## 2. Color Themes & Layout
- Maintain the enterprise "vivid blue" (`#074db7`) as the primary brand color.
- Ensure high contrast. If a panel uses the primary blue background, all text, inputs, and buttons inside it must be inverted (e.g., white text, translucent white inputs, white buttons).
- Conversely, on white backgrounds, use dark text (`text-foreground`) and primary blue accents.

## 3. Responsive Design
- Elements must perfectly scale or stack on smaller screens to remain fitted.
- Use responsive padding (e.g., `p-4 sm:p-6 md:p-8`) to maximize available space on smaller devices.
- For forms, ensure input heights and button sizes remain touch-friendly but compact enough to prevent pushing content below the viewport fold.
