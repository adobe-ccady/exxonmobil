import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

function isCtaParagraph(el) {
  const links = [...el.querySelectorAll('a')];
  if (!links.length) return false;
  return el.textContent.trim() === links.map((a) => a.textContent).join('').trim();
}

/**
 * Centered hero: background image row + content row (heading, text, CTA link),
 * content centered over the image. Authored cells are kept in place so Universal
 * Editor instrumentation is preserved.
 * @param {Element} block The block element
 */
export default function decorate(block) {
  let content;
  [...block.children].forEach((row) => {
    [...row.children].forEach((cell) => {
      if (cell.querySelector('picture') && !cell.textContent.trim()) {
        row.classList.add('hero-centered-media');
      } else if (cell.textContent.trim() || cell.children.length) {
        if (!content) {
          content = cell;
          row.classList.add('hero-centered-body');
          cell.classList.add('hero-centered-content');
        } else {
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
    content.classList.remove('hero-centered-content');
    richtext.classList.add('hero-centered-content');
    content = richtext;
  }

  if (content) {
    [...content.children].forEach((el) => {
      if (isCtaParagraph(el)) el.classList.add('hero-centered-cta');
    });
  }

  block.querySelectorAll('.hero-centered-media picture > img').forEach((img) => {
    const optimized = createOptimizedPicture(img.src, img.alt, false, [
      { media: '(min-width: 900px)', width: '2000' },
      { width: '900' },
    ]);
    moveInstrumentation(img, optimized.querySelector('img'));
    img.closest('picture').replaceWith(optimized);
  });
}
