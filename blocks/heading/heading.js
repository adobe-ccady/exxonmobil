import { moveInstrumentation } from '../../scripts/scripts.js';

/**
 * Heading: a section heading with an optional link and a style option.
 * Rows: [heading], [optional link]. The heading text becomes the link text.
 * Also accepts a heading that already contains its link (document authoring).
 * @param {Element} block The block element
 */
export default function decorate(block) {
  let heading = block.querySelector('h1, h2, h3, h4, h5, h6');
  const link = [...block.querySelectorAll('a[href]')].find((a) => !heading || !heading.contains(a));

  if (!heading) {
    // no heading level set: use the first text cell as an h2
    const cell = [...block.querySelectorAll(':scope > div > div')].find((c) => c.textContent.trim() && !c.querySelector('a'));
    if (!cell) return;
    heading = document.createElement('h2');
    moveInstrumentation(cell, heading);
    heading.textContent = cell.textContent.trim();
  }

  if (link && !heading.querySelector('a')) {
    const a = document.createElement('a');
    a.href = link.getAttribute('href');
    a.append(...heading.childNodes);
    heading.append(a);
  }

  block.replaceChildren(heading);
}
