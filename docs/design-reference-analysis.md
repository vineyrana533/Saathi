# Design reference analysis: kigo.studio

Status: Complete for the scope listed below
Inspected: 27 October 2026, using the built-in browser in the Claude desktop app
Purpose: Learn design principles from https://kigo.studio/ and translate them into an original identity for Saathi. Nothing in this document is a licence to copy Kigo's branding, text, images or layouts.

---

## 1. What was inspected

| Page | URL | Widths checked | What was done |
|---|---|---|---|
| Home | https://kigo.studio/ | 1440 x 900, 375 x 812, default pane (800 wide) | Full scroll top to footer, computed styles, CSS variables, media queries, easings, keyframes, hover rules, nav hover, contact CTA hover, keyboard focus, mobile menu open |
| Website design service page | https://kigo.studio/services/website-design | 1440 x 900 | Load timing of hero, scroll through clients, before/after slider, work list, testimonials text |
| About us | https://kigo.studio/about-us | 768 x 1024 (tablet) | Hero, stats row, team bios, footer at tablet width |

Method:
- Screenshots at each scroll position (scaled to 0.5 or 0.6 to save space).
- `getComputedStyle` on headings, paragraphs, links and buttons to get real font families, sizes, weights, line heights, letter spacing and colours.
- Walked every readable stylesheet to count media queries, `prefers-reduced-motion` blocks, transition durations, easing curves, `:hover` rules and `@keyframes` names.
- Read `:root` custom properties.
- Pressed Tab three times from page load to check the focus indicator, checked for a skip link, the `lang` attribute and images without `alt`.

## 2. What I could not inspect

Be clear about these gaps. Anything below is not covered by the observations in this document.

- **Studio reel video.** The "STUDIO REEL 2026" poster button was seen but the video was not played. Playback, controls, captions and autoplay behaviour are unknown.
- **Touch behaviour on real devices.** Mobile was emulated in a desktop browser at 375 x 812. Swipe, tap delay, momentum scrolling inside their custom scroll container and touch hover fallbacks were not tested on a physical phone.
- **Real-device Core Web Vitals.** No field data and no measurement on a mid-range Android over 4G. LCP, INP and CLS for this site are unknown.
- **No Lighthouse run.** Performance, accessibility and SEO scores were not measured.
- **Mega-menu images.** On desktop hover over "Services", the four service tiles opened but their image areas rendered blank in the screenshot. Either they lazy-load slowly or failed. Their final appearance was not seen.
- **Spanish pages** (`/es`), blog, tools and contact form pages were not opened.
- **Form behaviour.** No form was filled or submitted, so validation and error states were not seen.
- **Screen reader output.** Only structural checks were made (lang, alt, focus). No screen reader was run.

## 3. Observations

### 3.1 Visual identity and art direction

- A single, strong art direction runs through the whole site: hand-drawn, East Asian inspired illustration (ink-wash mountains, a blossom branch, mythological figures, koi, dragons) on a warm, slightly textured off-white "paper" background.
- One dominant accent colour, a saturated red (`--red: #d62828`), used for the logo dot, the italic accent word, CTA kanji stamps and the footer sun. Secondary colours appear mostly inside illustrations and as per-service title colours (maroon `rgb(124,29,37)`, deep teal `rgb(33,70,75)`, rust `rgb(161,61,39)`, brown `rgb(111,52,45)`).
- Body text is a near-black `rgb(32,32,32)` on paper. Paragraph text is a warm grey `rgb(74,65,68)`.
- The tone is confident and playful. The illustration does the emotional work. The interface chrome (header, cards, buttons) stays quiet: thin rules, square corners, small type.
- The overall feeling is "crafted and premium" rather than "template". This comes from three things: consistent illustration, very large display type, and restraint in UI elements.

### 3.2 Homepage composition and section order

Measured section heights at 768px tall viewport (rounded):

1. **Header** (sticky, about 55 to 80px, `--header-height: 80px`). Wordmark left, nav centre-right, language switch and a bordered CONTACT button right.
2. **Hero** (one viewport). Huge uppercase headline with one italic serif accent word in red, a two-line description, an illustrated blossom branch with falling petal animation, and a vertical Japanese haiku line.
3. **Clients** (about 1160px). Large heading, a dark video poster tile ("Studio reel"), a grid of client logos, and a large illustrated character beside them.
4. **Services** (about 3890px). One "poster" per service. Each poster has a thin-bordered info strip (three numbered benefits with a large stat, a pink CTA button) followed by a giant service word (about 153px Kanit, tight negative tracking) overlapping a full-bleed illustrated scene.
5. **Work** (about 3000px). Two-column staggered list of project postcards: photo, uppercase title, short description, tag row, small arrow icon. A blossom illustration and a dragon decorate the sides.
6. **Team** (about 1260px, white background). One person per screen: name in large uppercase, role eyebrow, short bio, social icons, giant illustrated character on the right.
7. **FAQ** (about 1460px). Accordion with a thin-bordered row per question and a small illustrated flower icon per row, plus a plus icon.
8. **Footer**. A three-line statement headline ("still thinking about..." pattern) with one italic accent word, a large red circle with a black ink tree, then three link columns (Pages, Services, Contact) and legal links.

Pattern worth noting: every major section opens with very large type, and the page reads like a sequence of posters rather than a stack of cards.

### 3.3 Typography and type scale

Families found in computed styles:

| Role | Family | Notes |
|---|---|---|
| Display headings | "Kigo Display" (custom), fallback Poppins | Weight 700, uppercase |
| Section and nav titles | Kanit | Weight 600, uppercase, strong negative tracking |
| Accent word | "Kigo Display Italic", fallback Playfair Display | Lowercase italic serif, red |
| Body and UI | Poppins | Weight 400 |
| Haiku | "Kigo Haiku", Mincho fallbacks | Vertical Japanese text |
| Brush | "Kigo Brush" | Decorative strokes |

Measured values at 1440 wide (root font size is fluid, see 3.4):

| Element | Size | Line height | Letter spacing | Weight |
|---|---|---|---|---|
| Hero H1 | 58.4px (800 pane) | 0.86 (50.2px) | -3.79px (about -0.065em) | 700 |
| Section H2 ("Some of our clients") | 47.1px | 1.05 | -2.83px (about -0.06em) | 700 |
| Service poster word | 153.6px | 0.85 | -9.98px (about -0.065em) | 600 |
| Mobile menu items | 46.7px | 1.0 | -2.10px (about -0.045em) | 600 |
| Service title in mega menu | 26.6px | 0.9 | -1.73px | 600 |
| Hero description | 21px | 1.4 | normal | 400 |
| Nav links | 14px | 1.0 | normal | 400 |
| CTA label | 14px | 1.2 | normal, uppercase | 400 |

Token scale from `:root` (in rem, root is fluid): `--font-h1: 3.8rem`, `--font-h2: 2.2rem`, `--font-h3: 1.7rem`, `--font-h4: 1.35rem`, `--font-h5: 1.15rem`, `--font-body: 1rem`, `--font-body-sm: .9rem`, `--font-body-xs: .8rem`, `--font-eyebrow: .8rem`, plus very large display sizes (`--font-size-title: 7rem`, `--font-size-hero-title: 7rem`, `--font-size-work-title: 6rem`).

Text treatments:
- Display lines are uppercase with very tight leading (0.85 to 0.9) and heavy negative tracking, so headlines read as solid blocks.
- One word per headline switches to a lowercase italic serif in the accent colour. This creates contrast and personality without a second colour system.
- Body copy stays modest (16 to 21px) with generous line height (1.4).

### 3.4 Grid, spacing, proportions and whitespace

- `--max-width: 1280px` content container.
- `--section-spacing: 8rem` between sections (about 128 to 160px given the fluid root).
- `--padding-horizontal-page: 3rem` desktop page padding.
- `--edge-padding: clamp(16px, 1.2vw, 32px)` for edges.
- **Fluid root font size:** `font-size: clamp(16px, 1vh + 0.2vmin + 1vw, 20px)` on `:root`. Everything in rem scales with viewport, so the whole layout breathes rather than jumping at breakpoints.
- Whitespace is generous around display type. Info strips inside posters are dense but bounded by a 1px rule, which keeps them tidy.
- Work list uses a two-column staggered layout, one column offset vertically, which adds rhythm.

### 3.5 Images and storytelling

- Each service has its own large illustrated character or scene (a demon mask for websites, kabuki figures for ecommerce, koi for apps, a woman riding a tiger for automations). The image is the emotional "hook" for that service and the giant service word overlaps it.
- Team members are represented by illustrated mythological figures, not photos.
- Work items use real project photography (people using the product in context), which provides proof.
- Decorative ambient motion: falling petals across the hero and other sections.

Lesson: one consistent image language across the site, a different hero image per offer, and real photography where proof matters.

### 3.6 Navigation, header, footer and calls to action

- **Header:** wordmark with a red dot, nav links (Home, Services with dropdown, Tools, Blog, About Us), a bordered CONTACT button with a stamp glyph, language switch EN/ES. Small 14px type, quiet. A small dot appears next to the active or hovered nav item.
- **Services mega menu:** four equal tiles, each with the service name in its own colour and an image area.
- **Mobile menu:** full-screen sheet, very large uppercase items (about 47px) separated by thin rules, a plus icon to expand Services, the CONTACT button below, and an illustration at the bottom right. Close icon replaces the hamburger.
- **Primary CTAs** on posters: filled pink-red rectangle, uppercase label, square corners, a glyph on the right.
- **Footer:** statement headline as a final CTA, link columns, contact details, social icons, legal links.
- A floating WhatsApp icon container exists in the DOM (`whatsapp-icon`).

### 3.7 Section transitions, scroll behaviour and animation

- **Custom scroll container.** The page renders inside a `scrollable` div with a custom scrollbar container (`#scrollbar-container`). The document itself reports a height of only 768px. This means native scrolling is replaced. This can break expected browser behaviour (find in page jump, scroll restoration, some assistive tech) and is a risk on low-end phones.
- **Late hero reveal.** On the website-design service page, the screenshot taken two seconds after navigation showed only the header and an empty paper background. The headline appeared later. On a mid-range Android this would push LCP well past 2.5 seconds.
- Measured transition durations, most common first: 0.5s (19 rules), 0.2s (15), 1s (11), 0.18s (11), 0.3s (10).
- Easing curves: `ease-out` (15), `linear` (10), `cubic-bezier(0.6, 0, 0.2, 1)` (9), named custom curves `ease-rise` and `ease-soft`, `cubic-bezier(0.25, 0.7, 0.25, 1)`, `cubic-bezier(0.65, 0, 0.25, 1)`.
- Keyframes include title reveals (`client-title-reveal`), handwriting style "write" animations for headings (`spring-write`, `web-write`, `service-write`), blossom open and petal fall, generic `p-rise` and `p-fade-up`, and a pulsing CTA glyph.
- **Reduced motion:** 42 `@media (prefers-reduced-motion: reduce)` blocks. Motion has been considered for accessibility, which is good practice.

### 3.8 Hover states and micro-interactions

From stylesheet rules and live hover:
- Nav item: small dot fades in on hover and focus-within.
- CONTACT button: glyph pulses (1.4s ease-in-out loop) on hover and focus-visible. A custom cursor shows a circular label ("Contact") on hover.
- Text links: colour shifts to red with matching underline colour.
- Bordered cards: border darkens from light to `rgba(39,39,39,0.6)` on hover.
- Work postcards and blog posters: image scales to 1.035 to 1.04, arrow icon shifts 3px diagonally.
- FAQ: plus icon turns red on hover.
- Reviews buttons: invert to ink background with paper text.
- Hover rules are scoped with `(hover: hover) and (pointer: fine)` in places, so touch devices do not get stuck hover states.

These are small, fast and consistent: the vocabulary is "darken border, shift arrow 3px, scale image 4%, change colour to accent".

### 3.9 Responsive behaviour

Most-used media queries: `max-width: 767px` (30 blocks), `max-width: 899px` (21), `max-width: 599px` (19), `max-width: 1024px` (16), plus 479, 359, 999 and 1100. Effective breakpoints are roughly 360, 480, 600, 768, 900, 1024.

- **Desktop 1440:** full nav, two-column work list, posters with three-column benefit strip, giant service words across the full width.
- **Tablet 768:** header collapses to hamburger. About page stats stack into a single right-aligned column. Footer link columns stay at two across with contact below. Illustrations keep large scale and crop at the edge.
- **Mobile 375:** hero illustration moves above the headline. Headline stays two lines with the accent word. Poster benefit strips become a single column inside a bordered box, CTA button below, service word below that. Header becomes a translucent pill behind the language switch and menu icon once scrolled.

### 3.10 Accessibility checks

- `lang="en-US"` set on the document.
- All 33 images on the home page had an `alt` attribute.
- Keyboard focus shows a visible outline (`rgb(229,151,0) auto`) on links.
- No skip link was found.
- Focus-visible states are styled for the CTA and posters, mirroring hover.
- Accessible names exist for the menu button ("Toggle mobile menu").
- A visually hidden H2 ("Services") labels the poster section for screen readers.

## 4. Principles to adopt

1. **One consistent image language.** Pick one way of showing images and use it everywhere, with a different lead image per service.
2. **Big, confident type as structure.** Section openings use very large display type with tight leading so each section reads like a poster.
3. **One accent word per headline.** A single italic serif word in the accent colour gives personality without extra decoration.
4. **Quiet interface chrome.** Square corners, thin 1px rules, small UI type, very little shadow. Let content and type carry the page.
5. **One strong accent colour.** Use it for CTAs and the accent word, not for everything.
6. **Fluid scale.** Use `clamp()` for type and spacing so layouts scale smoothly between breakpoints.
7. **Generous section spacing** with a max content width around 1280px.
8. **Proof next to promise.** Real photography of real work sits next to claims.
9. **Small, consistent micro-interactions.** Border darkens, arrow moves 3px, image scales a few percent, link turns accent colour. Fast (120 to 200ms).
10. **Full-screen mobile menu** with large tappable type and clear separators.
11. **Statement footer** that ends the page with a final call to action.
12. **Respect reduced motion** everywhere motion exists, and scope hover effects to fine pointers.
13. **Hidden structural headings** where a visual section has no visible heading, so screen readers still get a logical outline.

## 5. Things not to copy

- Kigo's name, wordmark, red dot logo, or any of their brand assets.
- Japanese and East Asian motifs: kanji stamps on buttons, vertical haiku text, cherry blossom branches, falling petals, red sun circle, ink-wash mountains, ukiyo-e style figures, mythological characters, koi or dragons.
- Their illustration style in general. Saathi should not be illustration-led at all at launch (see the design system).
- The custom cursor and the circular hover label.
- The custom scroll container and custom scrollbar. Saathi uses native scrolling.
- Delayed hero reveal animations. Saathi never animates the LCP element in.
- The "MAKE YOUR X cool / MAKE YOUR Y profitable" headline structure, and the "Still thinking about...? Let's compare results" footer line.
- Any of their copy, FAQs or service descriptions.
- Exact layouts: the poster-with-benefit-strip composition, the giant overlapping service word over a full-bleed illustration, the staggered two-column work list, the one-person-per-screen team layout.
- Unsourced stat claims such as "+20% faster", "+23% leads", "+12% sales". Saathi shows only numbers from its own stored data, or clearly labelled placeholders.
- Testimonial walls. Saathi shows only real reviews from completed bookings.
- Uppercase-everything headlines in a condensed font. Saathi uses sentence case for warmth and readability.

## 6. How each principle translates to Saathi

Saathi is a trust-first marketplace for hiring verified people in Delhi NCR and Mumbai: personal drivers, event and business staff, and errands and appointment help. Customers are choosing a person, so the design has to feel warm and safe as well as premium.

| Principle from the reference | Translation for Saathi |
|---|---|
| One consistent image language | Documentary-style, warm-graded, licensed photography of real work context: a driver's hands on the wheel in a customer's car, a registration desk at an event, someone waiting in a queue with a folder. No illustration-led art. Worker photos are their own moderated 4:5 portraits. Until licensed images exist, a clearly labelled placeholder component is shown. |
| Big, confident type as structure | Bricolage Grotesque display headlines at large fluid sizes with tight leading, in sentence case. Each section opens with a plain, specific line such as "Drivers for your own car, by the hour or the day." |
| One accent word per headline | One Instrument Serif italic word per headline at most, in terracotta. Used on marketing pages only, never in product UI or forms. |
| Quiet interface chrome | Square 2px corners on inputs and buttons, 0 on large blocks, 1px warm rules, almost no shadow. Worker results are list rows separated by rules, not rounded cards. |
| One strong accent colour | Terracotta for primary CTAs and the accent word. Deep indigo is reserved for trust signals: verified badges, verification links, safety information. Marigold is used sparingly as a highlight. |
| Fluid scale | `clamp()` type scale and section spacing, implemented as Tailwind v4 theme tokens. |
| Generous spacing, 1280px max width | Same container width. Section spacing scales from 64px on mobile to 128px on desktop. |
| Proof next to promise | Verification steps shown as concrete facts next to each worker ("ID verified", "Police verification on file", "Licence valid until Mar 2028"). Ratings shown only from completed bookings. No invented numbers. |
| Small, consistent micro-interactions | Row border darkens on hover, arrow moves 3px, link underline thickens. 120 to 200ms, scoped to fine pointers. |
| Full-screen mobile menu with large type | Original version: large sentence-case Bricolage items, rules between them, a "Book a person" primary button and a "Work with Saathi" secondary link at the bottom. No illustration. |
| Statement footer | Footer opens with a plain, useful line and two actions, for example booking a driver or applying to work, followed by link columns, city list, grievance officer contact and legal links. |
| Respect reduced motion | Every animation has a reduced-motion fallback. Hover effects only under `(hover: hover) and (pointer: fine)`. |
| Hidden structural headings | Visually hidden headings on sections that rely on visuals, plus a skip link (which the reference lacks). |
| Avoid the reference's weaknesses | Native scrolling only. Hero text renders immediately with no entrance animation. Skip link included. LCP image (if any) preloaded with explicit dimensions. |
