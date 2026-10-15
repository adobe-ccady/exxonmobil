import { loadCSS } from '../../scripts/aem.js';

/**
 * Content imported into AEM before the stock ticker had its own component arrives as a
 * plain Columns block: one row, [heading] | [share price, change, timestamp].
 * @param {Element} block The block element
 * @returns {boolean} true if the block holds a stock quote
 */
function isStockTicker(block) {
  const rows = [...block.children];
  if (rows.length !== 1 || rows[0].children.length !== 2) return false;
  const [label, figures] = rows[0].children;
  const price = figures.querySelector('p');
  return !!label.querySelector('h1, h2, h3, h4, h5, h6')
    && !!price && /^\$\s?\d[\d,]*(\.\d+)?$/.test(price.textContent.trim());
}

/**
 * Renders a stock-quote Columns block with the columns-stock-ticker block.
 * @param {Element} block The block element
 */
async function decorateAsStockTicker(block) {
  block.classList.replace('columns', 'columns-stock-ticker');
  block.closest('.section')?.classList.add('columns-stock-ticker-container');
  const [, { default: decorateTicker }] = await Promise.all([
    loadCSS(`${window.hlx.codeBasePath}/blocks/columns-stock-ticker/columns-stock-ticker.css`),
    import('../columns-stock-ticker/columns-stock-ticker.js'),
  ]);
  decorateTicker(block);
}

export default async function decorate(block) {
  if (isStockTicker(block)) {
    await decorateAsStockTicker(block);
    return;
  }

  const cols = [...block.firstElementChild.children];
  block.classList.add(`columns-${cols.length}-cols`);

  // setup image columns
  [...block.children].forEach((row) => {
    [...row.children].forEach((col) => {
      const pic = col.querySelector('picture');
      if (pic) {
        const picWrapper = pic.closest('div');
        if (picWrapper && picWrapper.children.length === 1) {
          // picture is only content in column
          picWrapper.classList.add('columns-img-col');
        }
      }
    });
  });
}
