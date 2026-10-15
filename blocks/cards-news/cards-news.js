import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

/**
 * News list: row per item, [optional image] | [title link, tag, read-time].
 * Renders as a vertical list; the tag and read-time are grouped into one meta line.
 * @param {Element} block The block element
 */
export default function decorate(block) {
  const ul = document.createElement('ul');
  [...block.children].forEach((row) => {
    const li = document.createElement('li');
    moveInstrumentation(row, li);
    while (row.firstElementChild) li.append(row.firstElementChild);

    [...li.children].forEach((div) => {
      if (div.querySelector('picture') && div.children.length === 1) {
        div.className = 'cards-news-card-image';
      } else if (!div.textContent.trim()) {
        // empty image cell (news items are authored without images)
        div.remove();
      } else {
        div.className = 'cards-news-card-body';
      }
    });

    const body = li.querySelector('.cards-news-card-body');
    if (body) {
      // Universal Editor groups rich text into one editable wrapper; read the items inside it
      const content = body.querySelector(':scope > [data-aue-type="richtext"]') || body;
      const [title, ...rest] = [...content.children];
      if (title) title.classList.add('cards-news-title');
      if (rest.length) {
        const meta = document.createElement('div');
        meta.className = 'cards-news-meta';
        rest.forEach((el, idx) => {
          el.classList.add(idx === 0 ? 'cards-news-tag' : 'cards-news-readtime');
          meta.append(el);
        });
        content.append(meta);
      }
    }

    ul.append(li);
  });

  ul.querySelectorAll('picture > img').forEach((img) => {
    const optimizedPic = createOptimizedPicture(img.src, img.alt, false, [{ width: '400' }]);
    moveInstrumentation(img, optimizedPic.querySelector('img'));
    img.closest('picture').replaceWith(optimizedPic);
  });

  block.replaceChildren(ul);
}
