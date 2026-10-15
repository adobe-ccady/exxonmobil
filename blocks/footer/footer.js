import { getMetadata } from '../../scripts/aem.js';

/**
 * Loads the footer fragment: the `footer` page metadata when set, otherwise /footer.
 * Pages served from a /content/ folder (local import preview) try /content/footer first.
 * @returns {Promise<{doc: Document, base: string}|null>}
 */
async function fetchFooterFragment() {
  const footerMeta = getMetadata('footer');
  const candidates = footerMeta ? [new URL(footerMeta, window.location).pathname] : [];
  if (window.location.pathname.startsWith('/content/')) candidates.push('/content/footer');
  candidates.push('/footer');
  let resp;
  // eslint-disable-next-line no-restricted-syntax
  for (const footerPath of candidates) {
    // eslint-disable-next-line no-await-in-loop
    resp = await fetch(`${footerPath.replace(/(\.plain)?\.html$/, '')}.plain.html`);
    if (resp.ok) break;
  }
  if (!resp?.ok) return null;
  const html = await resp.text();
  // parse into an inert document so relative image paths are not requested
  // against the page URL before they are rebased onto the fragment URL
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return { doc, base: resp.url };
}

/**
 * Rebases relative src attributes onto the fragment URL so the footer
 * renders the same on every page depth.
 * @param {Element} root
 * @param {string} base
 */
function rebaseImages(root, base) {
  root.querySelectorAll('img[src]').forEach((img) => {
    img.src = new URL(img.getAttribute('src'), base).href;
  });
}

/* code-hosted icons (base, hover, label) for known footer destinations */
const LINK_ICONS = {
  'linkedin.com': ['footer-in-gray', 'footer-in-white', 'LinkedIn'],
  'youtube.com': ['footer-yt-gray', 'footer-yt-white', 'YouTube'],
  'exxon.com': ['footer-exxon-gray', 'footer-exxon-white', 'Exxon'],
  'mobil.com': ['footer-mobil-gray', 'footer-mobil-white', 'Mobil'],
  'esso.com': ['footer-esso-gray', 'footer-esso-white', 'Esso'],
  home: ['footer-logo-exxonmobil-main', 'footer-logo-exxonmobil-main-hover', 'ExxonMobil logo'],
};

/**
 * @param {string} name an image alt text
 * @returns {Array} [key, icon entry] whose label matches, or []
 */
function findByLabel(name) {
  const wanted = (name || '').trim().toLowerCase();
  if (!wanted) return [];
  return Object.entries(LINK_ICONS).find(([, [, , label]]) => label.toLowerCase() === wanted) || [];
}

/**
 * @param {Element} a link
 * @returns {Array|undefined} icon entry for the link's destination
 */
function iconsFor(a) {
  const url = new URL(a.href, window.location);
  // site root, as delivered ("/") or as an AEM author path ("/content/<site>[/index][.html]")
  const isHome = url.origin === window.location.origin
    && (url.pathname === '/' || /^\/content\/[^/]+(\/index)?(\.html)?\/?$/.test(url.pathname));
  const byHost = LINK_ICONS[isHome ? 'home' : url.hostname.replace(/^www\./, '')];
  if (byHost) return byHost;
  // fall back to the image's name, e.g. when AEM rewrote an internal link
  return findByLabel(a.querySelector('img[alt]:not([alt=""])')?.alt)[1];
}

/**
 * AEM's link checker can drop the link around the logo (it points at the site root,
 * which is not an AEM page path), leaving a bare broken image. Re-link known images.
 * @param {Element} root
 */
function relinkOrphanIcons(root) {
  root.querySelectorAll('img[alt]:not([alt=""])').forEach((img) => {
    if (img.closest('a')) return;
    const [key] = findByLabel(img.alt);
    if (!key) return;
    const a = document.createElement('a');
    a.href = key === 'home' ? '/' : `https://www.${key}/`;
    img.before(a);
    a.append(img);
    // the hover image that followed it belongs to the same link
    const next = a.nextElementSibling;
    if (next?.tagName === 'IMG' && !next.alt) a.append(next);
  });
}

/**
 * Social and brand links are rendered with the icons shipped in code. AEM does not keep
 * images that are not in AEM Assets (the published page gets src="about:error", the
 * editor drops them) and splits multi-image links into one link per image, so the
 * authored images cannot be relied on: known destinations always get the code icons,
 * and adjacent links to the same place are merged.
 * @param {Element} root
 */
/**
 * Last resort for the logo: the first entry of the brand row (last footer section, first
 * group of image-only links) is the ExxonMobil logo. Used when AEM has stripped both the
 * logo's link and its alt text.
 * @param {Element} root
 */
function restoreBrandLogo(root) {
  const isIconLike = (a) => a.querySelector('img') || !a.textContent.trim();
  const group = [...root.querySelectorAll(':scope > div:last-of-type > :is(p, ul)')]
    .find((g) => g.querySelector('img') && [...g.querySelectorAll('a')].every(isIconLike));
  const first = group?.querySelector('a, img');
  if (!first) return;

  let link = first.tagName === 'A' ? first : null;
  const known = link && iconsFor(link);
  // already recognised as another destination (Exxon, Mobil, ...): leave it alone
  if (known && known !== LINK_ICONS.home) return;

  if (!link) {
    // bare image left behind after AEM removed its link
    link = document.createElement('a');
    first.before(link);
    link.append(first);
    const next = link.nextElementSibling;
    if (next?.tagName === 'IMG' && !next.alt) link.append(next);
  }
  if (!known) link.href = '/';
  const img = link.querySelector('img');
  const [, , homeLabel] = LINK_ICONS.home;
  if (img && !link.querySelector('img[alt]:not([alt=""])')) img.alt = homeLabel;
}

function restoreLinkIcons(root) {
  // li > p > a  ->  li > a
  root.querySelectorAll('li > p').forEach((p) => p.replaceWith(...p.childNodes));
  relinkOrphanIcons(root);
  restoreBrandLogo(root);
  root.querySelectorAll('a').forEach((a) => {
    const prev = a.previousElementSibling;
    if (prev?.tagName === 'A' && prev.href === a.href && (!a.textContent.trim() || a.querySelector('img'))) {
      prev.append(...a.querySelectorAll('img'));
      a.remove();
    }
  });
  root.querySelectorAll('a').forEach((a) => {
    const icons = iconsFor(a);
    if (!icons) return;
    const [base, hover, label] = icons;
    const text = a.textContent.trim();
    // only icon links: an image, no text, or just the destination's name
    const isIconLink = a.querySelector('img') || !text || text.toLowerCase() === label.toLowerCase();
    if (!isIconLink) return;
    const alt = [...a.querySelectorAll('img')].map((img) => img.alt).find(Boolean) || text || label;
    a.replaceChildren(...[base, hover].map((name, i) => {
      const img = document.createElement('img');
      img.src = `${window.hlx.codeBasePath}/icons/${name}.svg`;
      img.alt = i === 0 ? alt : '';
      img.loading = 'lazy';
      return img;
    }));
  });
}

/**
 * @param {Element} group a list or paragraph
 * @returns {boolean} true if every link in the group is image-only
 */
function isImageLinkGroup(group) {
  const links = [...group.querySelectorAll('a')];
  return links.length > 0 && links.every((a) => a.querySelector('img') && !a.textContent.trim());
}

/**
 * Image links carry a base image and an optional hover image.
 * Exposes the base image alt as the link's accessible name.
 * @param {Element} group
 */
function decorateImageLinks(group) {
  group.querySelectorAll('a').forEach((a) => {
    const [base, hover] = a.querySelectorAll('img');
    if (base) {
      base.classList.add('icon-base');
      if (base.alt) a.setAttribute('aria-label', base.alt);
      base.alt = '';
    }
    if (hover) {
      hover.classList.add('icon-hover');
      hover.alt = '';
    }
  });
}

/**
 * Normalizes a group of links into a list with one link per item.
 * @param {Element} group a list or paragraph
 */
function toList(group) {
  if (group.tagName === 'UL' || group.tagName === 'OL') return group;
  const ul = document.createElement('ul');
  group.querySelectorAll('a').forEach((a) => {
    const li = document.createElement('li');
    li.append(a);
    ul.append(li);
  });
  return ul;
}

/**
 * Builds one footer band from a fragment section.
 * The first band holds primary links + social icons,
 * later bands hold brand logos, legal links and copyright.
 * @param {Element} section
 * @param {boolean} isFirst
 * @returns {Element}
 */
function buildBand(section, isFirst) {
  const band = document.createElement('section');
  band.className = isFirst ? 'footer-top' : 'footer-bottom';
  const inner = document.createElement('div');
  inner.className = 'footer-inner';
  band.append(inner);

  let legalWrap;
  [...section.children].forEach((group) => {
    const hasLinks = !!group.querySelector('a');
    if (!hasLinks) {
      // plain text paragraph: copyright / notice
      group.classList.add('footer-copyright');
      if (!legalWrap) {
        legalWrap = document.createElement('div');
        legalWrap.className = 'footer-legal-wrap';
        inner.append(legalWrap);
      }
      legalWrap.append(group);
      return;
    }
    if (isImageLinkGroup(group)) {
      const list = toList(group);
      list.classList.add(isFirst ? 'footer-social' : 'footer-brands');
      decorateImageLinks(list);
      inner.append(list);
      return;
    }
    const list = toList(group);
    if (isFirst) {
      list.classList.add('footer-links');
      inner.append(list);
    } else {
      list.classList.add('footer-legal');
      if (!legalWrap) {
        legalWrap = document.createElement('div');
        legalWrap.className = 'footer-legal-wrap';
        inner.append(legalWrap);
      }
      legalWrap.prepend(list);
    }
  });
  return band;
}

/**
 * Links pointing at #privacy-center open the consent manager's
 * preference center when one is present on the page (OneTrust).
 * @param {Element} block
 */
function bindConsentLinks(block) {
  block.querySelectorAll('a[href="#privacy-center"]').forEach((a) => {
    a.setAttribute('role', 'button');
    a.addEventListener('click', (e) => {
      const { OneTrust } = window;
      if (OneTrust && typeof OneTrust.ToggleInfoDisplay === 'function') {
        e.preventDefault();
        OneTrust.ToggleInfoDisplay();
      }
    });
  });
}

/**
 * loads and decorates the footer
 * @param {Element} block The footer block element
 */
export default async function decorate(block) {
  const fragment = await fetchFooterFragment();
  block.textContent = '';
  if (!fragment) return;

  const { doc, base } = fragment;
  rebaseImages(doc.body, base);
  restoreLinkIcons(doc.body);
  const sections = [...doc.body.children].filter((el) => el.tagName === 'DIV');
  const wrapper = document.createElement('div');
  wrapper.className = 'footer-bands';
  sections.forEach((section, i) => {
    wrapper.append(buildBand(document.adoptNode(section), i === 0));
  });

  block.append(wrapper);
  bindConsentLinks(block);
}
