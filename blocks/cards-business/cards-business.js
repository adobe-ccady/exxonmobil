import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

function isLinkParagraph(el) {
  const links = [...el.querySelectorAll('a')];
  if (!links.length) return false;
  return el.textContent.trim() === links.map((a) => a.textContent).join('').trim();
}

/**
 * Business cards: row per card, [image] | [h3 eyebrow title, description, link(s)].
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
        div.className = 'cards-business-card-image';
      } else {
        div.className = 'cards-business-card-body';
      }
    });

    const body = li.querySelector('.cards-business-card-body');
    if (body) {
      [...body.children].forEach((el) => {
        if (/^H[1-6]$/.test(el.tagName)) el.classList.add('cards-business-title');
        else if (isLinkParagraph(el)) el.classList.add('cards-business-link');
        else el.classList.add('cards-business-description');
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
