/*
 * Header block
 *
 * Content contract (nav.plain.html — flat top-level sections, read in order):
 *   1. brand     – linked logo image
 *   2. nav list  – <ul> of top-level links (one per main menu item)
 *   3..n+2       – one megamenu section per top-level item (same order):
 *                  <h2> title, <p> description, <p><a> overview CTA, then one <ul>
 *                  per column; an <li> with a nested <ul> is a titled link group,
 *                  an <li> with a single link is a plain link
 *   n+3 locale   – <h2> trigger label, <p><a> global site link, nested <ul> tree
 *                  region > country > brand > site links
 *   n+4 search   – <h2> trigger label, <p> placeholder, <p><a> search action,
 *                  <h3> heading + <ul> of suggested searches
 * All copy lives in the fragment; this file only builds controls and behavior.
 */

import { getMetadata } from '../../scripts/aem.js';

const isDesktop = window.matchMedia('(width >= 1200px)');
const isTablet = window.matchMedia('(width >= 600px)');

let idCounter = 0;
const nextId = (prefix) => {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
};

/**
 * Creates an element with attributes and children
 * @param {string} tag tag name
 * @param {Object} attrs attributes (className supported)
 * @param {...(Node|string)} children child nodes
 * @returns {Element}
 */
function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v === null || v === undefined || v === false) return;
    if (k === 'className') e.className = v;
    else e.setAttribute(k, v === true ? '' : v);
  });
  children.flat().forEach((c) => {
    if (c !== null && c !== undefined) e.append(c);
  });
  return e;
}

const icon = (name) => el('span', { className: `header-icon header-icon-${name}`, 'aria-hidden': 'true' });

/** Text of an <li> excluding nested lists */
function ownText(li) {
  return [...li.childNodes]
    .filter((n) => n.nodeType === Node.TEXT_NODE || (n.nodeType === Node.ELEMENT_NODE && n.tagName !== 'UL'))
    .map((n) => n.textContent)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Loads the nav fragment: the `nav` page metadata when set, otherwise /nav.
 * Pages served from a /content/ folder (local import preview) try /content/nav first.
 */
async function fetchNavFragment() {
  const navMeta = getMetadata('nav');
  const candidates = navMeta ? [new URL(navMeta, window.location).pathname] : [];
  if (window.location.pathname.startsWith('/content/')) candidates.push('/content/nav');
  candidates.push('/nav');
  let resp;
  // eslint-disable-next-line no-restricted-syntax
  for (const navPath of candidates) {
    // eslint-disable-next-line no-await-in-loop
    resp = await fetch(`${navPath.replace(/(\.plain)?\.html$/, '')}.plain.html`);
    if (resp.ok) break;
  }
  if (!resp?.ok) return null;
  const html = await resp.text();
  const frag = document.createElement('div');
  frag.innerHTML = html;
  // resolve relative media against the fragment location
  frag.querySelectorAll('img[src]').forEach((img) => {
    img.src = new URL(img.getAttribute('src'), resp.url).href;
  });
  return frag;
}

/* ---------------------------------- state --------------------------------- */

function closeAllPanels(nav, except = null) {
  nav.querySelectorAll('.nav-item.is-open').forEach((item) => {
    if (item === except) return;
    item.classList.remove('is-open');
    item.querySelector('.nav-link')?.setAttribute('aria-expanded', 'false');
  });
  if (!except) nav.closest('.nav-wrapper')?.classList.remove('is-expanded');
}

function setSearchOpen(nav, open) {
  const panel = nav.querySelector('.nav-search-box');
  const btn = nav.querySelector('.nav-search-button');
  if (!panel || !btn) return;
  panel.hidden = !open;
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  nav.closest('.nav-wrapper').classList.toggle('search-open', open);
  if (open) panel.querySelector('input')?.focus();
}

function setGlobalOpen(nav, open) {
  const dialog = nav.querySelector('.nav-global-dialog');
  const btn = nav.querySelector('.nav-global-button');
  if (!dialog || !btn) return;
  dialog.hidden = !open;
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  document.body.style.overflowY = open ? 'hidden' : '';
  if (open) dialog.querySelector('.nav-global-close')?.focus();
  else btn.focus({ preventScroll: true });
}

function setMenuOpen(nav, open) {
  const btn = nav.querySelector('.nav-hamburger button');
  nav.setAttribute('aria-expanded', open ? 'true' : 'false');
  btn?.setAttribute('aria-expanded', open ? 'true' : 'false');
  btn?.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  document.body.style.overflowY = open && !isDesktop.matches ? 'hidden' : '';
  if (!open) closeAllPanels(nav);
}

/* --------------------------------- panels --------------------------------- */

/**
 * Positions a constrained megamenu panel near its trigger and keeps it inside the viewport
 * @param {Element} item nav list item
 */
function positionPanel(item) {
  const panel = item.querySelector('.nav-mega');
  if (!panel || panel.classList.contains('nav-mega-wide') || !isDesktop.matches) {
    if (panel) panel.style.removeProperty('left');
    return;
  }
  const link = item.querySelector('.nav-link');
  const items = [...item.parentElement.children];
  const index = items.indexOf(item);
  const vw = document.documentElement.clientWidth;
  const linkRect = link.getBoundingClientRect();
  const barRect = item.closest('.nav-bar').getBoundingClientRect();
  const width = panel.offsetWidth;
  // first half: align overview text with the trigger; second half: center under trigger
  let left = linkRect.left - 45;
  if (index >= items.length / 2 || left + width > vw) {
    left = linkRect.left + (linkRect.width / 2) - (width / 2);
  }
  left = Math.max(0, Math.min(left, vw - width));
  panel.style.left = `${Math.round(left - barRect.left)}px`;
}

function openPanel(nav, item) {
  closeAllPanels(nav, item);
  setSearchOpen(nav, false);
  item.classList.add('is-open');
  item.querySelector('.nav-link')?.setAttribute('aria-expanded', 'true');
  nav.closest('.nav-wrapper')?.classList.add('is-expanded');
  positionPanel(item);
}

/**
 * Builds a link group (titled section) from a list item with a nested list
 * @param {Element} li source list item
 */
function buildGroup(li) {
  const nested = li.querySelector(':scope > ul');
  const id = nextId('nav-group');
  const title = el('button', {
    type: 'button', className: 'nav-group-title', 'aria-expanded': 'false', 'aria-controls': id,
  }, ownText(li), icon('chevron'));
  nested.className = 'nav-group-links';
  nested.id = id;
  title.addEventListener('click', () => {
    if (isDesktop.matches) return;
    const group = title.closest('.nav-group');
    const expanded = title.getAttribute('aria-expanded') === 'true';
    group.parentElement.closest('.nav-mega').querySelectorAll('.nav-group.is-open').forEach((g) => {
      if (g === group) return;
      g.classList.remove('is-open');
      g.querySelector('.nav-group-title').setAttribute('aria-expanded', 'false');
    });
    group.classList.toggle('is-open', !expanded);
    title.setAttribute('aria-expanded', expanded ? 'false' : 'true');
  });
  return el('div', { className: 'nav-group' }, title, nested);
}

/**
 * Builds a megamenu panel from a fragment section
 * @param {Element} section fragment section
 */
function buildPanel(section) {
  const heading = section.querySelector('h1, h2, h3, h4, h5, h6');
  const paras = [...section.querySelectorAll(':scope > p')];
  const description = paras.find((p) => !p.querySelector('a'));
  const ctaP = paras.find((p) => p.querySelector('a'));
  const columns = [...section.querySelectorAll(':scope > ul')];

  const overview = el('div', { className: 'nav-mega-overview' });
  if (heading) {
    heading.className = 'nav-mega-title';
    overview.append(heading);
  }
  if (description) {
    description.className = 'nav-mega-description';
    overview.append(description);
  }
  let cta = null;
  if (ctaP) {
    const a = ctaP.querySelector('a');
    a.className = 'nav-mega-cta';
    a.append(icon('arrow'));
    ctaP.className = 'nav-mega-cta-wrapper';
    cta = ctaP;
    overview.append(ctaP);
  }

  const cols = columns.map((ul) => {
    const col = el('div', { className: 'nav-mega-column' });
    let looseList = null;
    [...ul.children].forEach((li) => {
      if (li.querySelector(':scope > ul')) {
        looseList = null;
        col.append(buildGroup(li));
      } else {
        if (!looseList) {
          looseList = el('ul', { className: 'nav-group-links nav-group-plain' });
          col.append(el('div', { className: 'nav-group nav-group-untitled is-open' }, looseList));
        }
        looseList.append(li);
      }
    });
    return col;
  });

  // mobile shows the overview CTA as the first entry of the accordion
  const mobileCta = cta ? el('p', { className: 'nav-mega-cta-wrapper nav-mega-mobile-cta' }, cta.querySelector('a').cloneNode(true)) : null;

  const total = cols.length + 1;
  const panel = el(
    'div',
    { className: `nav-mega nav-mega-cols-${total}${total >= 4 ? ' nav-mega-wide' : ''}` },
    el('div', { className: 'nav-mega-inner' }, overview, mobileCta, cols),
  );
  return panel;
}

/**
 * Builds the primary navigation list with megamenus
 * @param {Element} nav nav element
 * @param {Element} listSection fragment section containing the top-level list
 * @param {Element[]} panelSections megamenu sections in list order
 */
function buildNavSections(nav, listSection, panelSections) {
  const list = listSection.querySelector('ul');
  list.className = 'nav-list';
  [...list.children].forEach((li, i) => {
    li.className = 'nav-item';
    const link = li.querySelector('a');
    if (!link) return;
    link.className = 'nav-link';
    const section = panelSections[i];
    if (!section) return;
    const panel = buildPanel(section);
    panel.id = nextId('nav-mega');
    li.classList.add('nav-drop');
    link.setAttribute('aria-haspopup', 'true');
    link.setAttribute('aria-expanded', 'false');
    link.setAttribute('aria-controls', panel.id);
    link.append(icon('chevron'));
    li.append(panel);

    li.addEventListener('mouseenter', () => {
      if (isDesktop.matches) openPanel(nav, li);
    });
    li.addEventListener('mouseleave', () => {
      if (isDesktop.matches) closeAllPanels(nav);
    });
    li.addEventListener('focusin', () => {
      if (isDesktop.matches && !li.classList.contains('is-open')) openPanel(nav, li);
    });
    li.addEventListener('focusout', (e) => {
      if (isDesktop.matches && !li.contains(e.relatedTarget)) closeAllPanels(nav);
    });
    link.addEventListener('keydown', (e) => {
      if (!isDesktop.matches) return;
      if (e.code === 'ArrowDown') {
        e.preventDefault();
        openPanel(nav, li);
        panel.querySelector('a')?.focus();
      }
    });
    // mobile: tapping the label expands the accordion (single open)
    link.addEventListener('click', (e) => {
      if (isDesktop.matches) return;
      e.preventDefault();
      if (li.classList.contains('is-open')) closeAllPanels(nav);
      else {
        closeAllPanels(nav, li);
        li.classList.add('is-open');
        link.setAttribute('aria-expanded', 'true');
      }
    });
  });
  const sections = el('div', { className: 'nav-sections' }, list);
  return sections;
}

/**
 * Builds the search toggle + panel
 * @param {Element} nav nav element
 * @param {Element} section fragment section
 */
function buildSearch(nav, section) {
  const heading = section.querySelector('h2');
  const label = heading?.textContent.trim() || 'Search';
  const paras = [...section.querySelectorAll(':scope > p')];
  const placeholder = paras.find((p) => !p.querySelector('a'))?.textContent.trim() || '';
  const action = paras.find((p) => p.querySelector('a'))?.querySelector('a');
  const popularTitle = section.querySelector('h3');
  const popular = section.querySelector('ul');

  const panelId = nextId('nav-search');
  const button = el('button', {
    type: 'button', className: 'nav-search-button', 'aria-label': label, 'aria-expanded': 'false', 'aria-controls': panelId,
  }, icon('search'));

  const inputId = nextId('nav-search-input');
  const input = el('input', {
    type: 'search', name: 'search', id: inputId, autocomplete: 'off', 'aria-label': label,
  });
  // phones show the short label as placeholder, larger screens the full prompt
  const setPlaceholder = () => { input.placeholder = isTablet.matches ? placeholder : label; };
  setPlaceholder();
  isTablet.addEventListener('change', setPlaceholder);
  const submit = el('button', { type: 'submit', className: 'nav-search-submit', disabled: true }, action?.textContent.trim() || label, icon('arrow'));
  input.addEventListener('input', () => {
    submit.disabled = !input.value.trim();
  });
  const form = el(
    'form',
    { className: 'nav-search-form', role: 'search', action: action ? action.href : '/search' },
    el('label', { for: inputId, className: 'nav-search-icon-label' }, icon('search'), el('span', { className: 'nav-visually-hidden' }, label)),
    input,
    submit,
  );
  form.addEventListener('submit', (e) => {
    if (!input.value.trim()) e.preventDefault();
  });

  const close = el('button', { type: 'button', className: 'nav-search-close', 'aria-label': `Close ${label.toLowerCase()}` }, icon('close'));
  close.addEventListener('click', () => {
    setSearchOpen(nav, false);
    button.focus();
  });

  const popularBlock = el('div', { className: 'nav-search-popular' });
  if (popularTitle) {
    popularTitle.className = 'nav-search-popular-title';
    popularBlock.append(popularTitle);
  }
  if (popular) {
    popular.className = 'nav-search-popular-list';
    popularBlock.append(popular);
  }

  const panel = el(
    'div',
    { className: 'nav-search-box', id: panelId, hidden: true },
    el('div', { className: 'nav-search-inner' }, close, form, popularBlock),
  );

  button.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') !== 'true';
    closeAllPanels(nav);
    if (!isDesktop.matches) setMenuOpen(nav, false);
    setSearchOpen(nav, open);
  });
  return { button, panel };
}

/**
 * Builds the locale (global) selector toggle + dialog
 * @param {Element} nav nav element
 * @param {Element} section fragment section
 * @param {Element} logo logo image to reuse in the dialog header
 */
function buildGlobalSelector(nav, section, logo) {
  const heading = section.querySelector('h2');
  const label = heading?.textContent.trim() || '';
  const globalLink = section.querySelector(':scope > p a');
  const regionsList = section.querySelector(':scope > ul');
  const dialogId = nextId('nav-global');

  const button = el(
    'button',
    {
      type: 'button', className: 'nav-global-button', 'aria-expanded': 'false', 'aria-controls': dialogId, 'aria-label': `${label} selector`,
    },
    icon('globe'),
    el('span', { className: 'nav-global-label' }, label),
  );

  const close = el('button', { type: 'button', className: 'nav-global-close', 'aria-label': `Close ${label.toLowerCase()} selector` }, icon('close'));
  close.addEventListener('click', () => setGlobalOpen(nav, false));

  const body = el('div', { className: 'nav-global-body' });
  if (globalLink) {
    globalLink.className = 'nav-global-link';
    globalLink.append(icon('chevron'));
    body.append(el('div', { className: 'nav-global-item nav-global-home' }, globalLink));
  }

  [...(regionsList?.children || [])].forEach((regionLi) => {
    const contentId = nextId('nav-region');
    const regionBtn = el('button', {
      type: 'button', className: 'nav-region-toggle', 'aria-expanded': 'false', 'aria-controls': contentId,
    }, el('span', { className: 'nav-region-title' }, ownText(regionLi)), icon('chevron'));
    const sites = el('div', { className: 'nav-region-sites', hidden: true });
    const countries = el('ul', { className: 'nav-region-countries' });
    const countryBack = el('button', { type: 'button', className: 'nav-country-back' }, icon('chevron'), el('span'));
    countryBack.addEventListener('click', () => {
      const region = countryBack.closest('.nav-region');
      region.classList.remove('is-country');
      sites.hidden = true;
      countries.querySelectorAll('.nav-country').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      region.querySelector('.nav-region-toggle').focus();
    });
    [...(regionLi.querySelector(':scope > ul')?.children || [])].forEach((countryLi) => {
      const countryBtn = el('button', { type: 'button', className: 'nav-country', 'aria-pressed': 'false' }, ownText(countryLi));
      const brandList = countryLi.querySelector(':scope > ul');
      countryBtn.addEventListener('click', () => {
        countries.querySelectorAll('.nav-country').forEach((b) => b.setAttribute('aria-pressed', b === countryBtn ? 'true' : 'false'));
        sites.textContent = '';
        [...(brandList?.children || [])].forEach((brandLi) => {
          const links = brandLi.querySelector(':scope > ul').cloneNode(true);
          links.className = 'nav-brand-sites';
          sites.append(el('div', { className: 'nav-brand-group' }, el('p', { className: 'nav-brand-title' }, ownText(brandLi)), links));
        });
        sites.hidden = false;
        if (!isTablet.matches) {
          // phone: drill into the country (sites replace the country list)
          countryBack.querySelector('span:last-child').textContent = ownText(countryLi);
          countryBack.closest('.nav-region').classList.add('is-country');
          countryBack.focus();
        }
      });
      countries.append(el('li', {}, countryBtn));
    });
    const content = el('div', { className: 'nav-region-content', id: contentId, hidden: true }, countryBack, countries, sites);
    // APG accordion pattern: the toggle button lives inside a heading
    const regionHeading = el('h3', { className: 'nav-region-heading' }, regionBtn);
    const item = el('div', { className: 'nav-global-item nav-region' }, regionHeading, content);
    regionBtn.addEventListener('click', () => {
      const open = regionBtn.getAttribute('aria-expanded') !== 'true';
      body.querySelectorAll('.nav-region').forEach((r) => {
        const isThis = r === item && open;
        r.classList.toggle('is-open', isThis);
        r.querySelector('.nav-region-toggle').setAttribute('aria-expanded', isThis ? 'true' : 'false');
        r.querySelector('.nav-region-content').hidden = !isThis;
        r.classList.remove('is-country');
      });
      // phone: an open region replaces the region list (drill-in), toggle acts as back
      body.classList.toggle('is-drilled', open && !isTablet.matches);
    });
    body.append(item);
  });

  const dialogLogo = logo ? logo.cloneNode(true) : null;
  const dialog = el(
    'div',
    {
      className: 'nav-global-dialog', id: dialogId, role: 'dialog', 'aria-modal': 'true', 'aria-label': `${label} selector`, hidden: true,
    },
    el('div', { className: 'nav-global-header' }, el('div', { className: 'nav-global-logo' }, dialogLogo), close),
    el('div', { className: 'nav-global-scroll' }, body),
  );
  dialog.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') setGlobalOpen(nav, false);
  });

  button.addEventListener('click', () => {
    closeAllPanels(nav);
    setSearchOpen(nav, false);
    if (!isDesktop.matches) setMenuOpen(nav, false);
    setGlobalOpen(nav, true);
  });
  isTablet.addEventListener('change', () => {
    body.classList.remove('is-drilled');
    body.querySelectorAll('.nav-region.is-country').forEach((r) => r.classList.remove('is-country'));
  });
  return { button, dialog };
}

/**
 * Decides whether the header overlays a hero (transparent) or renders solid
 * @returns {boolean}
 */
function startsWithHero() {
  const first = document.querySelector('main .section');
  if (!first) return false;
  const block = first.querySelector('.block, [class*="hero"], [class*="carousel"]');
  return !!block && /hero|carousel/.test(block.className);
}

/**
 * loads and decorates the header, mainly the nav
 * @param {Element} block The header block element
 */
export default async function decorate(block) {
  const fragment = await fetchNavFragment();
  block.textContent = '';
  if (!fragment) return;

  const sections = [...fragment.children].filter((c) => c.tagName === 'DIV');
  const [brandSection, listSection, ...rest] = sections;
  const topCount = listSection?.querySelector('ul')?.children.length || 0;
  const panelSections = rest.slice(0, topCount);
  const [globalSection, searchSection] = rest.slice(topCount);

  const nav = el('nav', { id: 'nav', 'aria-label': 'Main navigation', 'aria-expanded': 'false' });
  const bar = el('div', { className: 'nav-bar' });

  // hamburger (mobile)
  const hamburger = el(
    'div',
    { className: 'nav-hamburger' },
    el('button', {
      type: 'button', 'aria-controls': 'nav-drawer', 'aria-label': 'Open navigation', 'aria-expanded': 'false',
    }, el('span', { className: 'nav-hamburger-icon' })),
  );
  hamburger.querySelector('button').addEventListener('click', () => {
    setSearchOpen(nav, false);
    setMenuOpen(nav, nav.getAttribute('aria-expanded') !== 'true');
  });

  // brand
  const brand = el('div', { className: 'nav-brand' });
  const brandLink = brandSection?.querySelector('a');
  let logo = brandSection?.querySelector('img');
  if (!logo && brandLink) {
    // AEM-authored nav: the brand is a plain text link, the logo comes from code
    logo = el('img', { src: `${window.hlx.codeBasePath}/icons/exxonmobil-logo.png`, alt: brandLink.textContent.trim() || 'ExxonMobil' });
    brandLink.textContent = '';
    brandLink.append(logo);
  }
  if (logo) {
    logo.width = 153;
    logo.height = 40;
    logo.setAttribute('fetchpriority', 'high');
  }
  if (brandLink) {
    brandLink.className = 'nav-brand-link';
    brandLink.setAttribute('aria-label', logo?.alt || 'Home');
    brand.append(brandLink);
  }

  // primary nav + mobile drawer chrome
  const navSections = listSection ? buildNavSections(nav, listSection, panelSections) : el('div', { className: 'nav-sections' });
  navSections.id = 'nav-drawer';
  const drawerClose = el('button', { type: 'button', className: 'nav-drawer-close', 'aria-label': 'Close navigation' }, icon('close'));
  drawerClose.addEventListener('click', () => {
    setMenuOpen(nav, false);
    hamburger.querySelector('button').focus();
  });
  navSections.prepend(el('div', { className: 'nav-drawer-header' }, el('div', { className: 'nav-drawer-logo' }, logo ? logo.cloneNode(true) : null), drawerClose));

  // tools
  const tools = el('div', { className: 'nav-tools' });
  let searchPanel = null;
  let globalDialog = null;
  if (globalSection) {
    const { button, dialog } = buildGlobalSelector(nav, globalSection, logo);
    tools.append(button);
    globalDialog = dialog;
  }
  if (searchSection) {
    const { button, panel } = buildSearch(nav, searchSection);
    tools.append(button);
    searchPanel = panel;
  }

  bar.append(hamburger, brand, navSections, tools);
  nav.append(bar);
  if (searchPanel) nav.append(searchPanel);
  if (globalDialog) nav.append(globalDialog);

  // global listeners
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape') return;
    if (nav.querySelector('.nav-item.is-open') && isDesktop.matches) closeAllPanels(nav);
    if (searchPanel && !searchPanel.hidden) setSearchOpen(nav, false);
    if (nav.getAttribute('aria-expanded') === 'true') setMenuOpen(nav, false);
  });
  document.addEventListener('click', (e) => {
    if (searchPanel && !searchPanel.hidden && !nav.contains(e.target)) setSearchOpen(nav, false);
  });

  // viewport changes: reset mobile/desktop state cleanly
  isDesktop.addEventListener('change', () => {
    setMenuOpen(nav, false);
    closeAllPanels(nav);
    nav.querySelectorAll('.nav-mega').forEach((p) => p.style.removeProperty('left'));
    nav.querySelectorAll('.nav-group:not(.nav-group-untitled)').forEach((g) => {
      g.classList.remove('is-open');
      g.querySelector('.nav-group-title')?.setAttribute('aria-expanded', 'false');
    });
  });
  window.addEventListener('resize', () => {
    const open = nav.querySelector('.nav-item.is-open');
    if (open) positionPanel(open);
  });

  const navWrapper = el('div', { className: 'nav-wrapper' }, nav);
  if (startsWithHero()) navWrapper.classList.add('nav-overlay');
  block.append(navWrapper);
}
