# WIP Archive

Not part of the app — nothing here is imported or built. Reference snapshots only, kept for future development.

## `HomePageContent.mobile-live-meter-wip-2026-08-29.tsx`

The full `app/HomePageContent.tsx` as of 2026-08-29, right before the mobile
"Live Meter" redesign (3-screen Home/Builder/Quote flow, `MobileBottomSheet`s,
`ClientPortal`, `PanelVisualizerGrid`, `BatterySizingHelper`, etc.) was reverted
back to the simpler single-column-scroll + floating-bottom-bar mobile UX,
per explicit instruction ("many issues in the UX... keep it for future
development, let's fix the functionality first").

This snapshot includes BOTH the mobile redesign AND every functional/pricing
fix built on top of it in the same session (industrial multi-inverter
"clubbing", the manual inverter quantity override + QuantityStepper, the
bill-amount sector auto-routing threshold, and the Target Budget
Industrial lock) — the functional fixes were kept in the live `app/HomePageContent.tsx`
(re-applied against the reverted mobile structure); only the mobile-specific
UI/components were removed from the live file.

To pick the mobile redesign back up later: diff this file against the
current `app/HomePageContent.tsx` to see exactly what mobile-only
components/state/JSX existed (`ClientPortal`, `RangeSlider`,
`PanelVisualizerGrid`, `MobileSpecRow`, `MobileBottomSheet`,
`BatterySizingHelper` + `BATTERY_HELPER_*` constants, `MobileQuoteScreen`,
`mobileScreen`/`mobileSheetKey`/`showBalanceOfSystem`/`batteryHelperSelectedLoads`/
`batteryHelperHours` state, `openMobileBuilder`, `suggestBatterySku`), then
re-thread in whatever functional work has landed on the live file since.
