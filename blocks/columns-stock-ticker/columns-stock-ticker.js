/**
 * Stock ticker: one row, two cells.
 * Cell 1: ticker label (heading). Cell 2: price, change and timestamp paragraphs.
 * @param {Element} block The block element
 */
export default function decorate(block) {
  const row = block.firstElementChild;
  if (!row) return;
  const cols = [...row.children];
  block.classList.add(`columns-stock-ticker-${cols.length}-cols`);

  const [labelCol, ...dataCols] = cols;
  if (labelCol) labelCol.classList.add('columns-stock-ticker-label');

  // collect the figures from the remaining cell(s); Universal Editor groups rich text
  // into one editable wrapper, in which case the wrapper lays out the figures
  const figures = dataCols.flatMap((col) => {
    col.classList.add('columns-stock-ticker-data');
    const richtext = col.querySelector(':scope > [data-aue-type="richtext"]');
    if (richtext && col.children.length === 1) {
      richtext.classList.add('columns-stock-ticker-data');
      return [...richtext.children];
    }
    return [...col.children];
  });

  const roles = ['price', 'change', 'time'];
  figures.forEach((el, idx) => {
    if (roles[idx]) el.classList.add(`columns-stock-ticker-${roles[idx]}`);
  });

  const change = block.querySelector('.columns-stock-ticker-change');
  if (change) {
    const text = change.textContent.trim();
    const down = /^[-−▼]/.test(text) || /\(-/.test(text);
    block.classList.add(down ? 'columns-stock-ticker-down' : 'columns-stock-ticker-up');
    const indicator = document.createElement('span');
    indicator.className = 'columns-stock-ticker-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    change.prepend(indicator, ' ');
  }

  // wrap the bullet separator in the timestamp so it can be spaced like the source
  const time = block.querySelector('.columns-stock-ticker-time');
  if (time && time.children.length === 0 && time.textContent.includes('•')) {
    const [before, ...rest] = time.textContent.split('•');
    const dot = document.createElement('span');
    dot.className = 'columns-stock-ticker-dot';
    dot.setAttribute('aria-hidden', 'true');
    dot.textContent = '•';
    time.replaceChildren(`${before.trim()} `, dot, ` ${rest.join('•').trim()}`);
  }

  // drop any additional authored rows beyond the first into the data area gracefully
  [...block.children].slice(1).forEach((extra) => extra.classList.add('columns-stock-ticker-extra'));
}
