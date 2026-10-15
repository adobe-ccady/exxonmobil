import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

const AUTOPLAY_INTERVAL = 7000;
const SWIPE_THRESHOLD = 50;

let carouselId = 0;

function getSlides(block) {
  return [...block.querySelectorAll('.carousel-hero-slide')];
}

function updateActiveSlide(block, slideIndex) {
  block.dataset.activeSlide = slideIndex;

  getSlides(block).forEach((slide, idx) => {
    const active = idx === slideIndex;
    slide.setAttribute('aria-hidden', !active);
    slide.classList.toggle('active', active);
    slide.querySelectorAll('a').forEach((link) => {
      if (active) link.removeAttribute('tabindex');
      else link.setAttribute('tabindex', '-1');
    });
  });

  block.querySelectorAll('.carousel-hero-indicator').forEach((indicator, idx) => {
    const button = indicator.querySelector('button');
    const active = idx === slideIndex;
    indicator.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  });
}

function showSlide(block, slideIndex = 0) {
  const slides = getSlides(block);
  if (!slides.length) return;
  let realIndex = slideIndex;
  if (slideIndex < 0) realIndex = slides.length - 1;
  if (slideIndex >= slides.length) realIndex = 0;
  updateActiveSlide(block, realIndex);
}

function setupAutoplay(block) {
  const toggle = block.querySelector('.carousel-hero-toggle');
  let timer;

  const stop = () => {
    clearInterval(timer);
    timer = undefined;
  };
  const start = () => {
    stop();
    timer = setInterval(() => {
      showSlide(block, parseInt(block.dataset.activeSlide, 10) + 1);
    }, AUTOPLAY_INTERVAL);
  };
  const setPlaying = (playing) => {
    block.dataset.playing = playing;
    toggle.setAttribute('aria-pressed', !playing);
    toggle.setAttribute('aria-label', playing ? 'Pause carousel' : 'Play carousel');
    if (playing) start();
    else stop();
  };

  toggle.addEventListener('click', () => {
    setPlaying(block.dataset.playing !== 'true');
  });

  // pause while the user interacts with the carousel
  block.addEventListener('focusin', stop);
  block.addEventListener('focusout', () => {
    if (block.dataset.playing === 'true') start();
  });

  // restart the timer after manual navigation so the new slide gets a full interval
  block.addEventListener('carousel-hero:navigate', () => {
    if (block.dataset.playing === 'true' && !block.contains(document.activeElement)) start();
  });

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // no autoplay while authoring in Universal Editor (the block is instrumented there)
  const authoring = block.hasAttribute('data-aue-resource');
  setPlaying(!reduceMotion && !authoring);
}

function navigate(block, slideIndex) {
  showSlide(block, slideIndex);
  block.dispatchEvent(new CustomEvent('carousel-hero:navigate'));
}

function bindEvents(block) {
  block.querySelectorAll('.carousel-hero-indicator button').forEach((button) => {
    button.addEventListener('click', (e) => {
      const indicator = e.currentTarget.closest('.carousel-hero-indicator');
      navigate(block, parseInt(indicator.dataset.targetSlide, 10));
    });
  });

  // horizontal swipe on touch devices
  const slides = block.querySelector('.carousel-hero-slides');
  let startX;
  let startY;
  slides.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });
  slides.addEventListener('touchend', (e) => {
    if (startX === undefined) return;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    startX = undefined;
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return;
    const current = parseInt(block.dataset.activeSlide, 10);
    navigate(block, dx < 0 ? current + 1 : current - 1);
  }, { passive: true });

  // Universal Editor: show the slide an author selects in the content tree
  block.addEventListener('aue:ui-select', (e) => {
    const slide = e.target.closest('.carousel-hero-slide');
    if (e.detail?.selected && slide) navigate(block, parseInt(slide.dataset.slideIndex, 10));
  });

  setupAutoplay(block);
}

function createSlide(row, slideIndex, id) {
  const slide = document.createElement('li');
  slide.dataset.slideIndex = slideIndex;
  slide.id = `carousel-hero-${id}-slide-${slideIndex}`;
  slide.classList.add('carousel-hero-slide');
  moveInstrumentation(row, slide);

  const cells = [...row.querySelectorAll(':scope > div')];
  cells.forEach((cell) => {
    const isImage = cell.querySelector('picture, img') && !cell.querySelector('h1, h2, h3, h4, h5, h6, p:not(:has(picture))');
    cell.classList.add(isImage ? 'carousel-hero-slide-image' : 'carousel-hero-slide-content');
    slide.append(cell);
  });

  const cell = slide.querySelector('.carousel-hero-slide-content');
  // Universal Editor groups rich text into one editable wrapper; read the items inside it
  const content = cell?.querySelector(':scope > [data-aue-type="richtext"]') || cell;
  if (content) {
    // the first paragraph before the heading is the eyebrow
    const heading = content.querySelector('h1, h2, h3, h4, h5, h6');
    const first = content.firstElementChild;
    if (heading && first && first !== heading && first.tagName === 'P'
      && !first.querySelector('a, picture')) {
      first.classList.add('carousel-hero-eyebrow');
    }
    if (heading) {
      if (!heading.id) heading.id = `${slide.id}-title`;
      slide.setAttribute('aria-labelledby', heading.id);
    }

    // paragraphs that only hold a link are calls to action, others are body text
    content.querySelectorAll(':scope > p:not(.carousel-hero-eyebrow)').forEach((p) => {
      const link = p.querySelector('a');
      if (link && p.textContent.trim() === link.textContent.trim()) {
        p.classList.add('carousel-hero-cta');
        link.classList.add('carousel-hero-cta-link');
      } else {
        p.classList.add('carousel-hero-text');
      }
    });
  }

  slide.querySelectorAll('.carousel-hero-slide-image picture > img').forEach((img) => {
    const picture = createOptimizedPicture(img.src, img.alt, slideIndex === 0, [
      { media: '(min-width: 900px)', width: '2000' },
      { width: '900' },
    ]);
    moveInstrumentation(img, picture.querySelector('img'));
    img.closest('picture').replaceWith(picture);
  });

  return slide;
}

/**
 * Builds the indicator label from the slide heading, keeping authored line breaks.
 * @param {Element} heading
 * @param {Element} button
 */
function fillIndicatorLabel(heading, button) {
  heading.childNodes.forEach((node) => {
    if (node.nodeName === 'BR') button.append(document.createElement('br'));
    else button.append(document.createTextNode(node.textContent));
  });
}

function createScrollButton(block) {
  const button = document.createElement('button');
  button.type = 'button';
  button.classList.add('carousel-hero-scroll');
  button.setAttribute('aria-label', 'Scroll down');
  button.addEventListener('click', () => {
    const section = block.closest('.section');
    const next = section ? section.nextElementSibling : null;
    if (next) next.scrollIntoView({ behavior: 'smooth' });
    else window.scrollBy({ top: block.offsetHeight, behavior: 'smooth' });
  });
  return button;
}

export default async function decorate(block) {
  carouselId += 1;
  const id = carouselId;
  block.id = `carousel-hero-${id}`;
  block.setAttribute('role', 'region');
  block.setAttribute('aria-roledescription', 'Carousel');

  const rows = [...block.querySelectorAll(':scope > div')];
  const isSingleSlide = rows.length < 2;

  const container = document.createElement('div');
  container.classList.add('carousel-hero-slides-container');
  const slidesWrapper = document.createElement('ul');
  slidesWrapper.classList.add('carousel-hero-slides');
  container.append(slidesWrapper);

  let indicators;
  if (!isSingleSlide) {
    const nav = document.createElement('nav');
    nav.classList.add('carousel-hero-nav');
    nav.setAttribute('aria-label', 'Carousel slide controls');
    indicators = document.createElement('ol');
    indicators.classList.add('carousel-hero-indicators');
    nav.append(indicators);
    container.append(nav);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.classList.add('carousel-hero-toggle');
    container.append(toggle);
  }

  rows.forEach((row, idx) => {
    const slide = createSlide(row, idx, id);
    slidesWrapper.append(slide);

    if (indicators) {
      const heading = slide.querySelector('h1, h2, h3, h4, h5, h6');
      const indicator = document.createElement('li');
      indicator.classList.add('carousel-hero-indicator');
      indicator.dataset.targetSlide = idx;
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-controls', slide.id);
      if (heading) fillIndicatorLabel(heading, button);
      else button.textContent = `Slide ${idx + 1}`;
      indicator.append(button);
      indicators.append(indicator);
    }
    row.remove();
  });

  container.append(createScrollButton(block));

  block.replaceChildren(container);
  updateActiveSlide(block, 0);

  if (!isSingleSlide) bindEvents(block);
}
