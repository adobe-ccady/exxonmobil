# ExxonMobil – AEM Edge Delivery Services (Document Authoring)

Corporate homepage of corporate.exxonmobil.com migrated to AEM Edge Delivery Services, authored in
[Document Authoring (da.live)](https://da.live).

## Environments
- Preview: https://main--exxonmobil--adobe-ccady.aem.page/
- Live: https://main--exxonmobil--adobe-ccady.aem.live/
- Authoring: https://da.live/#/adobe-ccady/exxonmobil

## Blocks
| Block | Used for |
|---|---|
| `carousel-hero` | Full-screen homepage slider (image + eyebrow, heading, CTA per row) |
| `columns-stock-ticker` | Share price row: `[heading] \| [price, change, time]` |
| `hero-banner` | Background image with statement and CTA on the right |
| `hero-centered` | Background image with centered heading, text and CTA |
| `cards-topics` | 2x2 topic cards: image, linked title, tag link |
| `cards-news` | News list: title link, tag, read time (no image) |
| `cards-business` | 3 business cards: image, eyebrow title, text, links |
| `cards-links` | 3 link cards: image, title, list of links |
| `heading` | Section heading with optional link; options `red`, `red-small` |
| `header` / `footer` | Built from the `/nav` and `/footer` documents |

Section styles (Section Metadata `style`): `grey`, `trending-split` (topics + latest news side by side).

## Authoring notes
- **Nav** (`/nav`): section 1 = brand link (logo comes from `/icons/exxonmobil-logo.png`), section 2 = top-level
  links, then one section per mega menu (heading, intro, overview link, link lists), then Global and Search.
- **Footer** (`/footer`): social and brand links are plain text links (LinkedIn, YouTube, ExxonMobil logo, Exxon,
  Mobil, Esso); the footer block renders their icons from `/icons`.
- Buttons in heroes are plain links in their own paragraph.

## Local development
1. `npm install`
2. `npx -y @adobe/aem-cli up` (or `aem up`) and open http://localhost:3000
3. `npm run lint`

Brand font: EMprint (self-hosted in `/fonts`) – confirm the license allows web hosting.
