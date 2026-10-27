# Saathi design system

Status: v1, ready to implement (light theme only)
Owner: Product design
Last updated: 27 October 2026
Related: `design-reference-analysis.md` (what we learned and what we will not copy), master prompt section 6 (copy rules)

Saathi is a working name. There is no final logo yet. Use a plain wordmark set in the display font: "Saathi" in Bricolage Grotesque 700, ink colour, with no symbol, dot or flourish. Replace it when the brand is decided.

---

## 1. Character

Saathi helps people in Delhi NCR and Mumbai hire a verified person for a specific job. The design has three jobs, in this order:

1. **Make people feel safe.** Verification, pricing and policy are always visible and specific.
2. **Feel human and warm.** Warm paper tones, real photographs of real work, plain friendly language.
3. **Feel considered and premium.** Large confident type, generous space, restraint everywhere else.

Indian-urban but not cliché: no paisley, mandala, rangoli, auto-rickshaw icons, flag colours or "incredible India" imagery. The Indian character comes from real photography of local work contexts, local specifics in copy (sectors, localities, hours, INR prices) and a warm palette taken from everyday materials (terracotta, paper, marigold, indigo ink).

What we never do: generic SaaS look, default Tailwind palette, rounded cards everywhere, heavy gradients, glow, glassmorphism, floating decorative blobs, illustration-led art, custom cursors, scroll-jacking, dashboard widgets on customer pages.

---

## 2. Typography

### 2.1 Families

| Role | Family | Source | Weights | Use |
|---|---|---|---|---|
| Display | Bricolage Grotesque | `next/font/google`, variable | 600, 700, 800 | Marketing headlines, page titles, wordmark, big numbers (prices, OTP digits) |
| Accent | Instrument Serif, italic | `next/font/google` | 400 italic | At most one word per marketing headline. Never in product UI, forms, tables or buttons |
| Body and UI | Public Sans | `next/font/google`, variable | 400, 500, 600, 700 | Body text, navigation, forms, tables, buttons, labels |
| Hindi (later) | Noto Sans Devanagari | `next/font/google` | 400, 500, 600, 700 | Added to the body and display stacks when Hindi ships. Do not load it before then |

Font loading:
- Use `next/font/google` with `display: "swap"`, `subsets: ["latin"]` and CSS variables (`--font-bricolage`, `--font-instrument`, `--font-public-sans`).
- Preload only the body font and the display font. The accent font is not preloaded.
- Fallback stacks use metric-adjusted system fonts (next/font does this) to keep CLS under 0.1.

Stacks:
```
--font-display: var(--font-bricolage), "Segoe UI", system-ui, sans-serif;
--font-accent:  var(--font-instrument), Georgia, "Times New Roman", serif;
--font-sans:    var(--font-public-sans), "Segoe UI", system-ui, sans-serif;
```

### 2.2 Fluid type scale

Sizes scale linearly between a 375px and a 1280px viewport. Formula: `clamp(min, intercept + slope vw, max)`.

| Token | Mobile (375) | Desktop (1280) | CSS value | Line height | Letter spacing | Family and weight |
|---|---|---|---|---|---|---|
| `display-xl` | 44px | 112px | `clamp(2.75rem, 0.989rem + 7.514vw, 7rem)` | 0.92 | -0.04em | Display 800 |
| `display-l` | 36px | 80px | `clamp(2.25rem, 1.111rem + 4.862vw, 5rem)` | 0.95 | -0.035em | Display 700 |
| `h1` | 32px | 56px | `clamp(2rem, 1.378rem + 2.652vw, 3.5rem)` | 1.0 | -0.03em | Display 700 |
| `h2` | 26px | 40px | `clamp(1.625rem, 1.262rem + 1.547vw, 2.5rem)` | 1.08 | -0.02em | Display 700 |
| `h3` | 21px | 28px | `clamp(1.3125rem, 1.131rem + 0.773vw, 1.75rem)` | 1.2 | -0.01em | Display 600 |
| `h4` | 18px | 21px | `clamp(1.125rem, 1.047rem + 0.331vw, 1.3125rem)` | 1.3 | 0 | Sans 600 |
| `body-l` | 18px | 20px | `clamp(1.125rem, 1.073rem + 0.221vw, 1.25rem)` | 1.55 | 0 | Sans 400 |
| `body` | 16px | 17px | `clamp(1rem, 0.974rem + 0.11vw, 1.0625rem)` | 1.6 | 0 | Sans 400 |
| `small` | 14px | 14px | `0.875rem` | 1.5 | 0 | Sans 400 |
| `label` / eyebrow | 13px | 13px | `0.8125rem` | 1.3 | 0.08em, uppercase | Sans 600 |

Rules:
- **Sentence case** for every heading. No uppercase display headlines. Uppercase only for the `label` style.
- Body copy never goes below 16px. Inputs are always at least 16px so iOS does not zoom on focus.
- Measure (line length): 45 to 75 characters for paragraphs. Use `max-width: 65ch`.
- Numbers in prices and tables use `font-variant-numeric: tabular-nums`.
- Format money as `₹1,250` (Indian grouping, `en-IN` locale, from integer paise). Format times as `4:30 pm`, dates as `Tue, 4 Nov`.
- Accent word: one Instrument Serif italic word, lowercase or sentence case, in `accent` colour, same size as the headline (optically it may be set 5% larger). Example: "Drivers for your own car, by the hour or the *day*."

---

## 3. Colour

Light theme only at launch. Dark mode is out of scope for v1; tokens are named by role so a dark theme can be added later without renaming.

### 3.1 Tokens

| Token | Hex | Role |
|---|---|---|
| `paper` | `#F6F1E8` | Default page background (warm off-white) |
| `paper-2` | `#EEE6D8` | Alternate section background, table header, subtle fills |
| `surface` | `#FFFFFF` | Inputs, dialogs, popovers, the price breakdown panel |
| `ink` | `#1C1A17` | Primary text, headings, wordmark, dark footer background |
| `ink-2` | `#5A534A` | Secondary text, descriptions, table secondary columns |
| `ink-3` | `#6E665B` | Captions, timestamps, helper text (minimum colour for any text) |
| `ink-on-dark` | `#F6F1E8` | Text on `ink` backgrounds |
| `ink-on-dark-2` | `#B8B0A3` | Secondary text on `ink` backgrounds |
| `rule` | `#D3CFC7` | Decorative 1px separators between rows and sections (ink at 16% on paper) |
| `rule-strong` | `#B0ACA5` | Table outer borders, hovered row rule (ink at 32% on paper) |
| `field-border` | `#7E7B75` | Input, select, checkbox and OTP box borders (meets 3:1 for UI components) |
| `accent` | `#A93D27` | Terracotta. Primary buttons, accent headline word, active nav marker |
| `accent-strong` | `#8C3120` | Primary button hover and pressed |
| `accent-tint` | `#F3DED6` | Selected-state backgrounds (chosen time slot) |
| `trust` | `#1F2A44` | Deep indigo. Verified badges, safety information, trust headings |
| `trust-link` | `#27407A` | Inline links (always underlined) |
| `trust-tint` | `#E4E8F1` | Verified badge background, safety callout background |
| `marigold` | `#E3A13B` | Highlight only: the "new" marker, focus ring on dark backgrounds, small decorative underline. Never text on paper |
| `marigold-tint` | `#F8E7C4` | Sandbox banner background, gentle highlight |
| `success` | `#2E6B3A` | Success text and icons |
| `success-tint` | `#E3EEDF` | Success background |
| `warning` | `#8A5A12` | Warning text and icons |
| `warning-tint` | `#F7E8C8` | Warning background |
| `danger` | `#A3261C` | Errors, destructive actions, SOS |
| `danger-tint` | `#F6DEDA` | Error background |
| `info` | `#1F5480` | Informational text and icons |
| `info-tint` | `#DDE7F1` | Informational background |
| `focus` | `#2346B8` | Focus ring on light backgrounds |
| `focus-on-dark` | `#E3A13B` | Focus ring on `ink` or `trust` backgrounds |

Usage rules:
- Terracotta (`accent`) is for one primary action per view and the accent word. Do not use it for decoration, icons or large fills.
- Indigo (`trust`) means "verified, safe, official". Do not use it for unrelated decoration, so the meaning stays clear.
- Marigold is a highlight, never text on light backgrounds (1.98:1 on paper).
- No gradients. Flat fills only.

### 3.2 Contrast ratios (computed with the WCAG 2.x relative luminance formula)

Text pairs (AA needs 4.5:1 for normal text, 3:1 for large text 24px+ or 18.66px+ bold):

| Foreground | Background | Ratio | Passes |
|---|---|---|---|
| `ink` #1C1A17 | `paper` #F6F1E8 | 15.43 | AAA |
| `ink` | `paper-2` #EEE6D8 | 14.01 | AAA |
| `ink` | `surface` #FFFFFF | 17.36 | AAA |
| `ink-2` #5A534A | `paper` | 6.74 | AA |
| `ink-2` | `paper-2` | 6.12 | AA |
| `ink-2` | `surface` | 7.58 | AAA |
| `ink-3` #6E665B | `paper` | 5.02 | AA |
| `ink-3` | `paper-2` | 4.56 | AA |
| `ink-3` | `surface` | 5.65 | AA |
| white | `accent` #A93D27 (primary button label) | 6.21 | AA |
| `paper` | `accent` | 5.52 | AA |
| white | `accent-strong` #8C3120 | 8.15 | AAA |
| `accent` | `paper` (accent word, text links in accent) | 5.52 | AA |
| `accent` | `paper-2` | 5.01 | AA |
| `accent` | `surface` | 6.21 | AA |
| `trust` #1F2A44 | `paper` | 12.67 | AAA |
| `trust` | `trust-tint` #E4E8F1 (verified badge) | 11.62 | AAA |
| `trust-link` #27407A | `paper` | 8.89 | AAA |
| `trust-link` | `paper-2` | 8.07 | AAA |
| `trust-link` | `surface` | 10.00 | AAA |
| `ink-on-dark` #F6F1E8 | `ink` | 15.43 | AAA |
| `ink-on-dark-2` #B8B0A3 | `ink` | 8.08 | AAA |
| `ink` | `marigold` #E3A13B | 7.79 | AAA |
| `ink` | `marigold-tint` #F8E7C4 (sandbox banner) | 14.24 | AAA |
| `success` #2E6B3A | `paper` / `success-tint` #E3EEDF | 5.69 / 5.35 | AA |
| `warning` #8A5A12 | `paper` / `warning-tint` #F7E8C8 | 5.26 / 4.88 | AA |
| `danger` #A3261C | `paper` / `danger-tint` #F6DEDA / `surface` | 6.55 / 5.74 / 7.37 | AA |
| `info` #1F5480 | `paper` / `info-tint` #DDE7F1 | 7.08 / 6.36 | AA |

Non-text UI pairs (AA needs 3:1):

| Element | Against | Ratio | Passes |
|---|---|---|---|
| `field-border` #7E7B75 | `paper` | 3.75 | Yes |
| `field-border` | `paper-2` | 3.40 | Yes |
| `field-border` | `surface` | 4.22 | Yes |
| `focus` #2346B8 | `paper` / `paper-2` / `surface` | 7.07 / 6.42 / 7.96 | Yes |
| `focus-on-dark` #E3A13B | `ink` | 7.79 | Yes |
| `accent` button fill | `paper` | 5.52 | Yes |

Known non-compliant pairs, do not use:
- `focus` #2346B8 on `ink` (2.18). Use `focus-on-dark` instead.
- `marigold` as text on `paper` (1.98).
- `rule` #D3CFC7 is decorative only (1.38). It must never be the only boundary of an interactive element.

---

## 4. Space, grid and shape

### 4.1 Spacing scale (4px base)

Tailwind v4 default `--spacing: 0.25rem` is kept, so `p-1` is 4px. Use these steps only:

| Step | px | Typical use |
|---|---|---|
| 1 | 4 | Icon gap |
| 2 | 8 | Label to input, inline gaps |
| 3 | 12 | Compact row padding |
| 4 | 16 | Default gap, mobile edge padding |
| 6 | 24 | Form field gap, card padding |
| 8 | 32 | Group spacing |
| 12 | 48 | Sub-section spacing |
| 16 | 64 | Section spacing on mobile |
| 24 | 96 | Section spacing on tablet |
| 32 | 128 | Section spacing on desktop |

Section spacing token: `--spacing-section: clamp(4rem, 2.343rem + 7.072vw, 8rem)` (64px to 128px).

### 4.2 Grid

| Range | Columns | Gutter | Edge padding |
|---|---|---|---|
| Below 768 | 4 | 16px | 16px |
| 768 to 1023 | 8 | 24px | 32px |
| 1024 and up | 12 | 24px | 48px |

- Max content width 1280px, centred. Text-heavy pages (policies, FAQs) use an 8-column measure inside it.
- Full-bleed photography is allowed on marketing pages only.
- Product pages (search, booking, account, worker portal, admin) use the same container but no full-bleed images.

### 4.3 Breakpoints

| Name | Min width | Tailwind token |
|---|---|---|
| `sm` | 480px | `--breakpoint-sm: 30rem` |
| `md` | 768px | `--breakpoint-md: 48rem` |
| `lg` | 1024px | `--breakpoint-lg: 64rem` |
| `xl` | 1280px | `--breakpoint-xl: 80rem` |

Design mobile first. The base styles target a 360 to 479px phone.

### 4.4 Radius, borders and elevation

| Token | Value | Use |
|---|---|---|
| `--radius-none` | 0 | Section blocks, photographs, tables, list rows, panels |
| `--radius-xs` | 2px | Buttons, inputs, selects, OTP boxes, status pills, toasts, dialogs |
| `--radius-full` | 9999px | Avatars and the small verified dot only |

- Borders are 1px. Decorative separators use `rule`. Interactive boundaries use `field-border`.
- Elevation is almost absent. Only floating layers get a shadow: `--shadow-pop: 0 1px 2px rgb(28 26 23 / 0.08), 0 8px 24px rgb(28 26 23 / 0.10)` for dropdowns, dialogs and toasts. No shadows on cards, rows or buttons.

---

## 5. Image treatment

- **Style:** documentary, real people doing the actual work in real local settings. A driver's hands on the steering wheel in a customer's hatchback in Gurugram. A registration desk at a Noida conference with lanyards on the table. Someone holding a numbered token in a government office queue. An adult helping an older person through a hospital entrance (non-medical help only).
- **Grade:** warm, natural light, slightly lifted shadows, no heavy filters, no duotones.
- **Licensing:** clearly licensed images only. Record source, licence and photographer for every image in `docs/image-credits.md` when images are added.
- **Never:** stock handshake shots, people in suits pointing at screens, staged "happy customer" laughter, public figures or celebrities, images that suggest romance or intimacy (important for the gated companion category), photos of real workers without their consent.
- **Worker photos:** the worker's own photo, moderated before it is visible, shown only with consent. Ratio 4:5, face centred, plain background preferred, displayed at 72px in list rows and 240px on profiles. Square corners, never circles on profile pages (circles only for small avatars in chat and headers).
- **Aspect ratios:** hero 3:2 on desktop, 4:5 on mobile; section images 4:3; worker portraits 4:5.
- **Performance:** every image uses `next/image` with explicit width and height, `sizes`, AVIF/WebP, and `priority` only for the single LCP image. No image is the LCP element on product pages; the headline is.
- **Placeholder component (`ImagePlaceholder`):** until licensed images exist, render a `paper-2` block at the correct aspect ratio with a 1px `rule-strong` border and a visible caption in `label` style: "Photo needed: [description of the intended shot]". It has `role="img"` and an `aria-label` describing the intended image. It must look intentional, not broken, and never be mistaken for real content.

---

## 6. Components

Every interactive component has these states defined: default, hover (fine pointers only), focus-visible, active/pressed, disabled, and where relevant loading, error and success. Minimum touch target 44 x 44px for primary controls; never below 24 x 24px for anything.

### 6.1 Header
- **Anatomy:** skip link (first focusable element), wordmark (links home), primary nav (Services, How it works, Safety, Work with Saathi), city selector (Delhi NCR / Mumbai), account link or "Log in", primary button "Book a person".
- **Behaviour:** sticky. 72px tall at top of page; condenses to 56px after 80px of scroll (wordmark scales down, a `rule` bottom border appears). Uses `position: sticky` and a scroll listener with `requestAnimationFrame`, no layout shift.
- **Active item:** 2px `accent` underline under the label.
- **Mobile (below 1024):** wordmark, city code, and a "Menu" button with a text label next to the icon. Opens a full-screen sheet on `paper`: large sentence-case items in Display 700 at `h1` size, separated by `rule` lines; city selector; at the bottom a full-width primary button "Book a person" and a secondary link "Work with Saathi". Focus is trapped inside, Escape closes, focus returns to the Menu button, body scroll is locked.

### 6.2 Footer
- **Background:** `ink`, text `ink-on-dark`.
- **Anatomy:** a statement line at `display-l`. On the dark background the accent word is set in Instrument Serif italic in `ink-on-dark` with no colour change, so contrast stays high. Below it two actions: primary "Book a person" and secondary "Apply to work". Then link columns: Services, Cities, Company, Help and safety, Legal. Then the grievance officer contact and support contact (placeholders until filled), the legal entity name, and "Prices in INR, including applicable taxes where shown".
- Focus ring uses `focus-on-dark`.

### 6.3 Buttons
| Variant | Default | Hover | Pressed | Disabled |
|---|---|---|---|---|
| Primary | `accent` fill, white label, Sans 600 16px | `accent-strong` | `accent-strong`, translateY(1px) | `paper-2` fill, `ink-3` label, no pointer |
| Secondary | transparent, 1px `ink` border, `ink` label | `paper-2` fill | `rule` fill | `rule` border, `ink-3` label |
| Ghost | transparent, `ink` label | `paper-2` fill | `rule` fill | `ink-3` label |
| Link | `trust-link`, underlined 1px, offset 3px | underline 2px | | `ink-3` |
| Danger | `danger` fill, white label | darker 8% | | as primary disabled |

- Height 48px (default) or 40px (compact, admin tables only, still 44px hit area via padding). Horizontal padding 20px. Radius 2px.
- Optional trailing arrow icon that moves 3px right on hover.
- Loading state: label stays, a 16px spinner replaces the trailing icon, `aria-busy="true"`, button disabled to prevent double submit.
- Never more than one primary button per view section.

### 6.4 Form fields
- **Text input, select, textarea:** label above (Sans 600 14px, `ink`), optional help text below the label (`ink-3`, 14px), field on `surface` with 1px `field-border`, radius 2px, height 48px, 16px text. Hover: border `ink-2`. Focus: 2px `focus` ring with 2px offset plus border `ink`. Error: border `danger`, error message below the field in `danger` with an icon and the text "Error:" visually hidden prefix, linked by `aria-describedby`, field gets `aria-invalid="true"`. Disabled: `paper-2` fill, `ink-3` text.
- **Required fields:** mark optional fields "(optional)" instead of starring required ones.
- **Phone input:** fixed "+91" prefix segment, `inputmode="tel"`, `autocomplete="tel-national"`.
- **OTP input:** six separate 48 x 56px boxes in Display 700 24px with tabular numbers, `inputmode="numeric"`, `autocomplete="one-time-code"` on the first box, paste fills all boxes, backspace moves back. The group has one visible label and an error area. Also used for the job start and end codes.
- **Checkbox and radio:** 20px box with 1px `field-border`, 44px row hit area, checked fill `ink` with paper tick.
- **Error summary:** on submit with errors, a `danger-tint` box at the top of the form lists each error as a link to its field, and receives focus.

### 6.5 Verified badge
- Small inline element: `trust-tint` background, `trust` text, Sans 600 13px, a 12px check-shield icon, radius 2px, 4px 8px padding.
- Label is always specific: "ID verified", "Police verification", "Licence valid to Mar 2028". Never a vague "Trusted" or "Top rated".
- Expired or pending states use `warning` colours with text, for example "Licence expired" (shown to ops and the worker only).

### 6.6 Worker result row (not a card)
- Results are a list of rows separated by `rule` lines, no rounded containers.
- **Anatomy (desktop):** 72px 4:5 photo, then name (Display 600 h4) and area ("Based in Sector 50, Noida"), languages, experience; verified badges row; rating ("4.8 from 23 completed bookings", or "New on Saathi" when there are no ratings); price for the selected slot (Display 700, tabular), and a primary "Choose" button or "View profile" link on the right.
- **Mobile:** photo left, details stack right, price and button on a full-width line at the bottom.
- **Hover:** row background `paper-2` and the arrow on "View profile" moves 3px. The whole row is not one giant link; name and button are the links, so screen readers get clear targets.
- Unavailable workers are never shown as bookable for the chosen slot.

### 6.7 Price breakdown
- A `surface` panel with 1px `rule-strong` border, square corners.
- Rows: label left, amount right in tabular numbers. Lines: service (for example "Personal driver, 4 hours at ₹250/hour"), add-ons, platform fee if any, taxes with the rate named ("GST 18% on platform fee"), discount in `success` with a minus sign, then a 1px `ink` rule and **Total** in Display 700 h3.
- Under the total: cancellation summary in plain words ("Free cancellation until 4:30 pm, Mon 3 Nov") and a link to the full policy.
- Implemented as a `<table>` with a `<caption>` (visually hidden) for screen readers.
- The values shown come from the pricing engine quote, and the same numbers are stored on the booking snapshot.

### 6.8 Status pill
- Text plus colour plus icon, never colour alone. Radius 2px, Sans 600 13px, 4px 8px padding, tint background with dark text from the matching state colour.
- Mapping: Pending payment (warning), Confirmed (info), In progress (trust), Completed (success), Cancelled (ink-2 on paper-2), Disputed (danger), Expired (ink-2 on paper-2).

### 6.9 Booking timeline
- A vertical list with a 1px `rule-strong` line on the left. Each step has a 12px marker, a title, time and actor ("Payment received, 2:14 pm"). Completed steps have an `ink` filled marker, the current step a `accent` ring marker plus "Current step" visually hidden text, future steps a hollow `field-border` marker.
- Used on the customer booking page, the worker job page and the admin booking view.

### 6.10 Empty, loading and error states
- **Empty:** a short heading saying what is empty, one sentence on why, and one action. Example: "No drivers free at that time. Try a later start, or ask our team to find someone." Buttons: "Change time", "Ask our team". No illustration.
- **Loading:** skeleton rows at the same size as the final content (prevents CLS) on `paper-2`, with a subtle opacity pulse that is disabled under reduced motion. Announce with `aria-busy` on the region and a visually hidden "Loading" status. Spinners only inside buttons.
- **Error:** `danger-tint` panel with a heading, a plain explanation, what the person can do, and a reference code for support. Never show stack traces or raw provider errors.

### 6.11 Toast
- Bottom centre on mobile, bottom right on desktop. `ink` background, `ink-on-dark` text, radius 2px, `--shadow-pop`. Auto-dismiss after 6 seconds unless it contains an action, then it stays until dismissed. Live region `role="status"` (or `role="alert"` for errors). Never the only place an important result is communicated.

### 6.12 Dialog
- `surface` panel, max width 560px, radius 2px, `--shadow-pop`, a backdrop of `ink` at 48% opacity (no blur). Title in Display 600 h3, close button with a visible label "Close". Focus trap, Escape closes, focus returns to the trigger. Destructive confirmation dialogs name the action in the button ("Cancel booking"), never "OK".

### 6.13 Tabs
- Text tabs with a 2px `accent` underline on the selected tab and a 1px `rule` line under the tab list. Arrow-key navigation, `role="tablist"`. On narrow screens the tab list scrolls horizontally with visible overflow hint (fade mask is not allowed; show a partially cut tab instead).

### 6.14 Pagination
- "Previous" and "Next" text buttons with page numbers between, current page shown in `ink` with an underline and `aria-current="page"`. Show "Showing 21 to 40 of 132". Admin tables also allow page size 20, 50, 100.

### 6.15 Sandbox mode banner
- Full-width strip at the very top of every page when any integration runs in sandbox or development mode. `marigold-tint` background, `ink` text, 1px `warning` bottom border, Sans 600 14px.
- Text: "Test mode. Payments, SMS and verification checks are simulated. No real money moves." The list of simulated services comes from configuration, so it stays accurate.
- It cannot be dismissed while any adapter is in sandbox mode. It is not shown in production once all adapters are live.

---

## 7. Motion

| Token | Value | Use |
|---|---|---|
| `--duration-fast` | 120ms | Hover colour, border and underline changes |
| `--duration-base` | 200ms | Button press, dropdown open, tab underline |
| `--duration-slow` | 320ms | Dialog and mobile menu open, header condense |
| `--duration-reveal` | 400ms | Below-the-fold section fade-up only |
| `--ease-ui` | `cubic-bezier(0.2, 0, 0, 1)` | Default for all UI motion |
| `--ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | Elements leaving |

Rules:
- **Never delay or animate the hero headline, hero image or any LCP element.** It renders in its final state on first paint.
- Reveal animations (opacity 0 to 1, translateY 12px to 0, 400ms) only for content below the fold, triggered once by IntersectionObserver, and the content is visible without JavaScript.
- No scroll-jacking, no custom scroll containers, no smooth-scroll libraries, no parallax, no custom cursor, no ambient looping animation.
- Hover motion only inside `@media (hover: hover) and (pointer: fine)`.
- Under `@media (prefers-reduced-motion: reduce)`: all transitions are reduced to opacity changes of 0 to 120ms, reveals show content immediately, skeleton pulse stops, and the header condense happens without animation.
- Animate only `opacity` and `transform` to protect INP and CLS.

---

## 8. Accessibility (WCAG 2.2 AA)

- **Language:** `<html lang="en-IN">`. Hindi pages will use `lang="hi"`. Mixed-language phrases get a `lang` attribute on their element.
- **Skip link:** "Skip to main content", first focusable element, visible on focus, targets `<main id="main">`.
- **Focus:** every interactive element shows a 2px `focus` outline with a 2px offset on `:focus-visible` (`focus-on-dark` on dark backgrounds). Never remove outlines without a replacement. Focus must not be hidden behind the sticky header (`scroll-padding-top` set to the header height) (WCAG 2.4.11).
- **Target size:** minimum 24 x 24px for all targets (WCAG 2.5.8); 44 x 44px for primary actions and anything on the worker portal, which is used on the move.
- **Forms:** every input has a visible `<label>`. Help and error text are linked with `aria-describedby`. Errors are announced and an error summary receives focus on submit. Do not ask for the same information twice in a flow (WCAG 3.3.7). OTP login supports paste and autofill (WCAG 3.3.8 accessible authentication).
- **Status is never colour only:** status pills, verification badges and form errors always include text and an icon.
- **Headings:** one `h1` per page, no skipped levels, visually hidden headings where a section has none.
- **Landmarks:** `header`, `nav` (with `aria-label` when there is more than one), `main`, `footer`.
- **Live regions:** booking status changes, chat messages and toasts are announced via polite live regions; errors and SOS confirmations via assertive.
- **Motion:** see section 7.
- **Images:** meaningful `alt` text describing the person or scene; decorative images use `alt=""`.
- **Contrast:** use only the pairs in section 3.2.
- **Zoom and reflow:** content works at 320px width and 400% zoom without horizontal scrolling (except data tables, which scroll inside their own region with a visible label).
- **Testing:** automated checks with axe in CI on key pages, plus manual keyboard and screen reader passes (NVDA on Windows, TalkBack on Android) before each milestone sign-off.

---

## 9. Copy voice

All customer-facing text follows master prompt section 6 "Copy rules for all customer-facing text". In short:

- Write like a helpful local expert explaining to a friend. Clear, specific, practical. Use contractions.
- Lead with the most useful fact. Name the city, hours, what's included and the price.
- Never invent testimonials, reviews, worker counts or statistics. Use labelled placeholders until real content exists.
- Banned phrases include "In today's fast-paced world", "Look no further", "Embark on a journey", "Unlock", "Elevate", "Seamless", "Delve", "Hidden gem", "Nestled", "Game-changer", "Plethora", "Boasts", "Vibrant", "When it comes to", "It's important to note", "In conclusion". The full list lives in the master prompt and is enforced by a copy lint check.
- No em dashes in customer-facing copy. At most one exclamation mark per page.
- Say "our team" or "advisors" for internal staff, never "agents".
- No "therapy", "wellness" or emotional-health claims. Describe companion services (when enabled) in plain, platonic, activity-based terms.

---

## 10. Tailwind CSS v4 implementation sketch

Put this in `src/app/globals.css`. The `--color-*: initial` reset removes the default Tailwind palette so only Saathi tokens exist.

```css
@import "tailwindcss";

@theme {
  --color-*: initial;
  --color-paper: #F6F1E8;
  --color-paper-2: #EEE6D8;
  --color-surface: #FFFFFF;
  --color-ink: #1C1A17;
  --color-ink-2: #5A534A;
  --color-ink-3: #6E665B;
  --color-ink-on-dark: #F6F1E8;
  --color-ink-on-dark-2: #B8B0A3;
  --color-rule: #D3CFC7;
  --color-rule-strong: #B0ACA5;
  --color-field-border: #7E7B75;
  --color-accent: #A93D27;
  --color-accent-strong: #8C3120;
  --color-accent-tint: #F3DED6;
  --color-trust: #1F2A44;
  --color-trust-link: #27407A;
  --color-trust-tint: #E4E8F1;
  --color-marigold: #E3A13B;
  --color-marigold-tint: #F8E7C4;
  --color-success: #2E6B3A;
  --color-success-tint: #E3EEDF;
  --color-warning: #8A5A12;
  --color-warning-tint: #F7E8C8;
  --color-danger: #A3261C;
  --color-danger-tint: #F6DEDA;
  --color-info: #1F5480;
  --color-info-tint: #DDE7F1;
  --color-focus: #2346B8;
  --color-focus-on-dark: #E3A13B;
  --color-white: #FFFFFF;
  --color-transparent: transparent;
  --color-current: currentColor;

  --font-display: var(--font-bricolage), "Segoe UI", system-ui, sans-serif;
  --font-accent: var(--font-instrument), Georgia, "Times New Roman", serif;
  --font-sans: var(--font-public-sans), "Segoe UI", system-ui, sans-serif;

  --text-display-xl: clamp(2.75rem, 0.989rem + 7.514vw, 7rem);
  --text-display-xl--line-height: 0.92;
  --text-display-xl--letter-spacing: -0.04em;
  --text-display-l: clamp(2.25rem, 1.111rem + 4.862vw, 5rem);
  --text-display-l--line-height: 0.95;
  --text-display-l--letter-spacing: -0.035em;
  --text-h1: clamp(2rem, 1.378rem + 2.652vw, 3.5rem);
  --text-h1--line-height: 1;
  --text-h1--letter-spacing: -0.03em;
  --text-h2: clamp(1.625rem, 1.262rem + 1.547vw, 2.5rem);
  --text-h2--line-height: 1.08;
  --text-h2--letter-spacing: -0.02em;
  --text-h3: clamp(1.3125rem, 1.131rem + 0.773vw, 1.75rem);
  --text-h3--line-height: 1.2;
  --text-h3--letter-spacing: -0.01em;
  --text-h4: clamp(1.125rem, 1.047rem + 0.331vw, 1.3125rem);
  --text-h4--line-height: 1.3;
  --text-body-l: clamp(1.125rem, 1.073rem + 0.221vw, 1.25rem);
  --text-body-l--line-height: 1.55;
  --text-body: clamp(1rem, 0.974rem + 0.11vw, 1.0625rem);
  --text-body--line-height: 1.6;
  --text-small: 0.875rem;
  --text-small--line-height: 1.5;
  --text-label: 0.8125rem;
  --text-label--line-height: 1.3;
  --text-label--letter-spacing: 0.08em;

  --breakpoint-sm: 30rem;
  --breakpoint-md: 48rem;
  --breakpoint-lg: 64rem;
  --breakpoint-xl: 80rem;

  --spacing-section: clamp(4rem, 2.343rem + 7.072vw, 8rem);
  --container-content: 80rem;

  --radius-none: 0;
  --radius-xs: 2px;
  --radius-full: 9999px;

  --shadow-pop: 0 1px 2px rgb(28 26 23 / 0.08), 0 8px 24px rgb(28 26 23 / 0.10);

  --ease-ui: cubic-bezier(0.2, 0, 0, 1);
  --ease-exit: cubic-bezier(0.4, 0, 1, 1);
  --duration-fast: 120ms;
  --duration-base: 200ms;
  --duration-slow: 320ms;
  --duration-reveal: 400ms;
}

@layer base {
  html { background: var(--color-paper); color: var(--color-ink); font-family: var(--font-sans); scroll-padding-top: 88px; }
  body { font-size: var(--text-body); line-height: 1.6; -webkit-font-smoothing: antialiased; }
  :focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
  .on-dark :focus-visible { outline-color: var(--color-focus-on-dark); }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 1ms !important; animation-iteration-count: 1 !important; transition-duration: 1ms !important; scroll-behavior: auto !important; }
  }
}
```

Notes:
- Keep `--spacing` at the Tailwind default (0.25rem) so the 4px scale applies.
- Re-adding `white`, `transparent` and `current` after the reset keeps common utilities working.
- Check the exact Tailwind v4 version's theme variable names when implementing; if a namespace differs, keep the token names and values from this document.
