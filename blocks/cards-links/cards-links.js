import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

/**
 * Quick-link cards: row per card, [image] | [h3 title, list of links].
 * Links may be authored as a list (ul/ol) or as consecutive link paragraphs.
 * @param {Element} block The block element
 */
export default function decorate(block) {
  const ul = document.createElement('ul');
  [...block.children].forEach((row) => {
    const li = document.createElement('li');
    moveInstrumentation(row, li);
    while (row.firstElementChild) li.append(row.firstElementChild);

    [...li.children].forEach((div) => {
      if (div.children.length === 1 && div.querySelector('picture')) {
        div.className = 'cards-links-card-image';
      } else {
        div.className = 'cards-links-card-body';
      }
    });

    const body = li.querySelector('.cards-links-card-body');
    if (body) {
      [...body.children].forEach((el) => {
        if (/^H[1-6]$/.test(el.tagName)) el.classList.add('cards-links-title');
        else if (el.tagName === 'UL' || el.tagName === 'OL') el.classList.add('cards-links-list');
        else if (el.querySelector('a')) el.classList.add('cards-links-link');
      });
    }

    ul.append(li);
  });

  ul.querySelectorAll('picture > img').forEach((img) => {
    const optimizedPic = createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }]);
    moveInstrumentation(img, optimizedPic.querySelector('img'));
    img.closest('picture').replaceWith(optimizedPic);
  });

  block.replaceChildren(ul);
}
