import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

function isCtaParagraph(el) {
  const links = [...el.querySelectorAll('a')];
  if (!links.length) return false;
  return el.textContent.trim() === links.map((a) => a.textContent).join('').trim();
}

/**
 * Hero banner: background image row + statement row (statement text and CTA link).
 * The authored cells are kept in place (Universal Editor instrumentation lives on them);
 * they are only classed and the layout is done in CSS.
 * @param {Element} block The block element
 */
export default function decorate(block) {
  let content;
  [...block.children].forEach((row) => {
    [...row.children].forEach((cell) => {
      const hasPicture = !!cell.querySelector('picture');
      if (hasPicture && !cell.textContent.trim()) {
        row.classList.add('hero-banner-media');
      } else if (cell.textContent.trim() || cell.children.length) {
        if (!content) {
          content = cell;
          row.classList.add('hero-banner-body');
          cell.classList.add('hero-banner-content');
        } else {
          // extra authored text cells are merged into the content cell
          content.append(...cell.childNodes);
          cell.remove();
        }
      }
    });
    if (!row.children.length) row.remove();
  });

  // Universal Editor groups rich text into one editable wrapper: lay out the wrapper's items
  const richtext = content?.querySelector(':scope > [data-aue-type="richtext"]');
  if (richtext && content.children.length === 1) {
    content.classList.remove('hero-banner-content');
    richtext.classList.add('hero-banner-content');
    content = richtext;
  }

  if (content) {
    [...content.children].forEach((el) => {
      el.classList.add(isCtaParagraph(el) ? 'hero-banner-cta' : 'hero-banner-text');
    });
  }

  block.querySelectorAll('.hero-banner-media picture > img').forEach((img) => {
    const optimized = createOptimizedPicture(img.src, img.alt, false, [
      { media: '(min-width: 900px)', width: '2000' },
      { width: '900' },
    ]);
    moveInstrumentation(img, optimized.querySelector('img'));
    img.closest('picture').replaceWith(optimized);
  });
}
