import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

/**
 * Topic cards: row per card, [image] | [linked title, tag link].
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
        div.className = 'cards-topics-card-image';
      } else if (!div.textContent.trim() && !div.querySelector('picture')) {
        div.remove();
      } else {
        div.className = 'cards-topics-card-body';
      }
    });

    const body = li.querySelector('.cards-topics-card-body');
    if (body) {
      // Universal Editor groups rich text into one editable wrapper; read the items inside it
      const content = body.querySelector(':scope > [data-aue-type="richtext"]') || body;
      const items = [...content.children];
      if (items.length > 1) {
        const tag = items[items.length - 1];
        if (tag.querySelector('a') || tag.textContent.trim().length < 60) {
          tag.classList.add('cards-topics-tag');
        }
      }
      const title = content.querySelector(':scope > :not(.cards-topics-tag)');
      if (title) title.classList.add('cards-topics-title');
    }

    // source card: image + title share one link (hover dims image, underlines title)
    const titleLink = li.querySelector('.cards-topics-title a[href]');
    const imageCell = li.querySelector('.cards-topics-card-image');
    if (titleLink && imageCell && !imageCell.querySelector('a')) {
      const imageLink = document.createElement('a');
      imageLink.href = titleLink.getAttribute('href');
      imageLink.tabIndex = -1;
      imageLink.setAttribute('aria-hidden', 'true');
      imageLink.append(...imageCell.childNodes);
      imageCell.append(imageLink);
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
