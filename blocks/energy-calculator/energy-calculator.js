import { readBlockConfig } from '../../scripts/aem.js';
import { createTag, loadChartJs, createChart } from '../../scripts/shared.js';

/*
 * Energy Calculator block.
 *
 * Variants (block name in the document):
 *   Energy Calculator (emissions)        – fleet fuel use → CO2e, lower-emission blend + efficiency
 *   Energy Calculator (carbon capture)   – CCS capacity → cumulative CO2 stored over time
 *   Energy Calculator (hydrogen)         – low-carbon hydrogen output → CO2 avoided
 *
 * Optional two-column rows let authors override any text or default value:
 *   title | Fleet emissions estimator
 *   intro | Estimate …
 *   disclaimer | Illustrative estimates only …
 *   label-<field> | Custom field label
 *   default-<field> | 42
 *   result-<n> | Custom label for the nth result card (1-based)
 * All assumptions (emission factors, intensities) are editable inputs, never fixed facts.
 */

const INFO_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>';

/* Typical passenger vehicle: ~4.6 t CO2 per year (U.S. EPA greenhouse gas equivalencies). */
const VEHICLE_T_CO2_PER_YEAR = 4.6;

const COMMON_STRINGS = {
  legend: 'How this estimate works',
  disclaimer: 'Illustrative estimates for discussion only. Results depend on the assumptions entered and are not a forecast or a statement of company performance.',
  chartUnavailable: 'Chart unavailable.',
  moreInfo: 'More information',
  vehiclesLabel: 'Equivalent passenger vehicles',
  vehiclesNote: 'Cars driven for one year, at about 4.6 t CO2 each.',
};

const num = (value, digits = 0) => new Intl.NumberFormat(document.documentElement.lang || undefined, {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits,
}).format(Number.isFinite(value) ? value : 0);

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

let instanceCount = 0;

const MODELS = {
  emissions: {
    title: 'Fleet emissions estimator',
    intro: 'Estimate the tailpipe CO2 from a road fleet and see how lower-emission fuel blends and efficiency gains can reduce it.',
    legendItems: [
      'Fuel use = vehicles × annual distance × fuel consumption.',
      'Baseline CO2 = fuel use × emission factor (kg CO2 per litre).',
      'Projected CO2 applies the efficiency gain, then the lifecycle reduction of the lower-emission blend share.',
    ],
    fields: [
      {
        id: 'vehicles', label: 'Number of vehicles', value: 50, min: 1, step: 1, suffix: 'vehicles',
      },
      {
        id: 'distance', label: 'Annual distance per vehicle', value: 100000, min: 0, step: 1000, suffix: 'km',
      },
      {
        id: 'consumption', label: 'Fuel consumption', value: 32, min: 0, step: 0.5, suffix: 'L/100 km', tooltip: 'Average fuel use per 100 km.',
      },
      {
        id: 'fuel',
        type: 'select',
        label: 'Fuel type',
        value: 'diesel',
        options: [
          { value: 'diesel', label: 'Diesel', factor: 2.69 },
          { value: 'gasoline', label: 'Gasoline', factor: 2.35 },
        ],
      },
      {
        id: 'factor', label: 'Emission factor (assumption)', value: 2.69, min: 0, step: 0.01, suffix: 'kg CO2/L', tooltip: 'Tailpipe CO2 per litre burned. Updates when you change the fuel type; edit to match your data.',
      },
      {
        id: 'blend', label: 'Lower-emission blend share', value: 20, min: 0, max: 100, step: 1, suffix: '%', tooltip: 'Share of fuel replaced by a lower-emission alternative such as renewable diesel.',
      },
      {
        id: 'reduction', label: 'Lifecycle reduction of blend (assumption)', value: 60, min: 0, max: 100, step: 1, suffix: '%', tooltip: 'How much lower the blend component\'s lifecycle emissions are.',
      },
      {
        id: 'efficiency', label: 'Efficiency improvement', value: 2, min: 0, max: 30, step: 0.5, suffix: '%', tooltip: 'Fuel saved from efficiency measures such as advanced lubricants or fleet optimisation.',
      },
    ],
    onChange(id, refs) {
      if (id !== 'fuel') return;
      const field = MODELS.emissions.fields.find((f) => f.id === 'fuel');
      const option = field.options.find((o) => o.value === refs.fuel.value);
      if (option) refs.factor.value = String(option.factor);
    },
    calculate(v) {
      const fuel = Math.max(0, v.vehicles) * Math.max(0, v.distance) * (Math.max(0, v.consumption) / 100);
      const baseline = (fuel * Math.max(0, v.factor)) / 1000;
      const efficientFuel = fuel * (1 - clamp(v.efficiency, 0, 100) / 100);
      const blendShare = clamp(v.blend, 0, 100) / 100;
      const blendReduction = clamp(v.reduction, 0, 100) / 100;
      const projected = (efficientFuel * Math.max(0, v.factor) * (1 - blendShare * blendReduction)) / 1000;
      const avoided = baseline - projected;
      return {
        metrics: [
          { label: 'Annual fuel use', value: `${num(fuel)} L`, note: 'Before any efficiency improvement.' },
          { label: 'Baseline emissions', value: `${num(baseline, 1)} t CO2`, note: 'Per year, on conventional fuel.' },
          { label: 'Projected emissions', value: `${num(projected, 1)} t CO2`, note: 'Per year, with the blend and efficiency gains.' },
          { label: 'Emissions avoided', value: `${num(avoided, 1)} t CO2`, note: `${num(baseline > 0 ? (avoided / baseline) * 100 : 0, 1)}% lower than baseline.` },
          { label: COMMON_STRINGS.vehiclesLabel, value: num(avoided / VEHICLE_T_CO2_PER_YEAR), note: COMMON_STRINGS.vehiclesNote },
        ],
        chart: {
          type: 'bar',
          title: 'Annual emissions (t CO2)',
          labels: ['Baseline', 'Projected'],
          datasets: [{ label: 't CO2', data: [baseline, projected], colors: ['navy', 'red'] }],
        },
      };
    },
  },

  'carbon-capture': {
    title: 'Carbon capture and storage estimator',
    intro: 'Project how much CO2 a carbon capture and storage (CCS) network could store safely and permanently underground over its operating life.',
    legendItems: [
      'Annual storage = capture capacity × utilisation, ramping up evenly over the ramp-up period.',
      'Cumulative storage adds each year of injection for the operating life.',
      'Vehicle equivalence uses about 4.6 t CO2 per passenger car per year.',
    ],
    fields: [
      {
        id: 'capacity', label: 'Capture capacity', value: 2, min: 0, step: 0.1, suffix: 'Mt CO2/yr', tooltip: 'Nameplate capacity in million tonnes of CO2 per year.',
      },
      {
        id: 'utilisation', label: 'Average utilisation', value: 85, min: 0, max: 100, step: 1, suffix: '%',
      },
      {
        id: 'ramp', label: 'Ramp-up period', value: 3, min: 0, max: 20, step: 1, suffix: 'years', tooltip: 'Years to reach full capacity.',
      },
      {
        id: 'years', label: 'Operating life', value: 20, min: 1, max: 50, step: 1, suffix: 'years',
      },
      { id: 'breakdown', type: 'toggle', label: 'Show yearly breakdown', value: false },
    ],
    calculate(v) {
      const years = Math.round(clamp(v.years, 1, 50));
      const ramp = Math.round(clamp(v.ramp, 0, years));
      const full = Math.max(0, v.capacity) * (clamp(v.utilisation, 0, 100) / 100);
      let cumulative = 0;
      const rows = [];
      for (let y = 1; y <= years; y += 1) {
        const annual = ramp > 0 && y <= ramp ? full * (y / (ramp + 1)) : full;
        cumulative += annual;
        rows.push({ year: y, annual, cumulative });
      }
      return {
        metrics: [
          { label: 'Annual storage at full rate', value: `${num(full, 2)} Mt CO2`, note: 'Capacity × utilisation.' },
          { label: 'Total CO2 stored', value: `${num(cumulative, 1)} Mt CO2`, note: `Over ${num(years)} years of operation.` },
          { label: COMMON_STRINGS.vehiclesLabel, value: num((full * 1e6) / VEHICLE_T_CO2_PER_YEAR), note: 'Per year at full rate. Cars driven for one year, at about 4.6 t CO2 each.' },
        ],
        table: v.breakdown ? {
          title: 'Yearly breakdown',
          headers: ['Year', 'Stored this year (Mt)', 'Cumulative (Mt)'],
          rows: rows.map((r) => [num(r.year), num(r.annual, 2), num(r.cumulative, 2)]),
        } : null,
        chart: v.breakdown ? null : {
          type: 'line',
          title: 'Cumulative CO2 stored (Mt)',
          labels: rows.map((r) => r.year),
          xTitle: 'Year of operation',
          datasets: [{ label: 'Cumulative Mt CO2', data: rows.map((r) => r.cumulative), colors: ['steel'] }],
        },
      };
    },
  },

  hydrogen: {
    title: 'Low-carbon hydrogen estimator',
    intro: 'Estimate the CO2 avoided when hydrogen is produced with carbon capture instead of unabated natural gas reforming.',
    legendItems: [
      'Annual hydrogen = daily output × operating days.',
      'Unabated CO2 = hydrogen × unabated carbon intensity.',
      'CO2 captured = unabated CO2 × capture rate. The remainder is residual emissions.',
    ],
    fields: [
      {
        id: 'output', label: 'Hydrogen output', value: 500, min: 0, step: 10, suffix: 't H2/day',
      },
      {
        id: 'days', label: 'Operating days per year', value: 350, min: 0, max: 366, step: 1, suffix: 'days',
      },
      {
        id: 'intensity', label: 'Unabated carbon intensity (assumption)', value: 9, min: 0, step: 0.1, suffix: 'kg CO2/kg H2', tooltip: 'Process CO2 from reforming natural gas without capture. Edit to match your data.',
      },
      {
        id: 'capture', label: 'Capture rate', value: 95, min: 0, max: 100, step: 0.5, suffix: '%',
      },
    ],
    calculate(v) {
      const hydrogen = Math.max(0, v.output) * clamp(v.days, 0, 366);
      const unabated = (hydrogen * Math.max(0, v.intensity)) / 1e6;
      const captured = unabated * (clamp(v.capture, 0, 100) / 100);
      const residual = unabated - captured;
      const residualIntensity = hydrogen > 0 ? (residual * 1e6) / hydrogen : 0;
      return {
        metrics: [
          { label: 'Annual hydrogen', value: `${num(hydrogen / 1000, 1)} kt H2`, note: 'Daily output × operating days.' },
          { label: 'CO2 captured', value: `${num(captured, 2)} Mt CO2`, note: 'Per year, sent for permanent storage.' },
          { label: 'Residual emissions', value: `${num(residual, 2)} Mt CO2`, note: `${num(residualIntensity, 2)} kg CO2 per kg H2.` },
          { label: COMMON_STRINGS.vehiclesLabel, value: num((captured * 1e6) / VEHICLE_T_CO2_PER_YEAR), note: COMMON_STRINGS.vehiclesNote },
        ],
        chart: {
          type: 'bar',
          title: 'Annual CO2 (Mt)',
          labels: ['Unabated', 'Captured', 'Residual'],
          datasets: [{ label: 'Mt CO2', data: [unabated, captured, residual], colors: ['navy', 'teal', 'red'] }],
        },
      };
    },
  },
};

const VARIANT_ALIASES = {
  ccs: 'carbon-capture',
  'carbon-capture': 'carbon-capture',
  hydrogen: 'hydrogen',
  emissions: 'emissions',
};

function getModelKey(block) {
  const match = [...block.classList].find((c) => VARIANT_ALIASES[c]);
  return match ? VARIANT_ALIASES[match] : 'emissions';
}

function chartColor(name) {
  const dark = document.documentElement.dataset.theme === 'dark'
    || (!document.documentElement.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const palette = {
    navy: dark ? '#7fb2f0' : '#0b1f3a',
    red: dark ? '#ff4d6a' : '#e4002b',
    steel: dark ? '#7fb2f0' : '#1f5fad',
    teal: dark ? '#5cc9b2' : '#0f7a68',
  };
  return palette[name] || palette.steel;
}

function buildField(field, label, defaultValue, strings, idPrefix) {
  const id = `${idPrefix}-${field.id}`;
  const rowClass = field.type === 'toggle' ? 'energy-calculator-row energy-calculator-toggle' : 'energy-calculator-row';
  const row = createTag('label', { class: rowClass, for: id });
  const labelEl = createTag('span', { class: 'energy-calculator-label' }, label);
  if (field.tooltip) {
    const tip = createTag('span', { class: 'energy-calculator-tip', title: field.tooltip, 'aria-label': strings.moreInfo });
    tip.innerHTML = INFO_ICON;
    labelEl.append(tip);
  }

  let input;
  if (field.type === 'select') {
    input = createTag('select', { id, name: field.id }, field.options.map((opt) => createTag(
      'option',
      { value: opt.value, selected: opt.value === defaultValue ? 'selected' : undefined },
      opt.label,
    )));
    row.append(labelEl, input);
  } else if (field.type === 'toggle') {
    input = createTag('input', {
      id, name: field.id, type: 'checkbox', checked: defaultValue ? 'checked' : undefined,
    });
    row.append(labelEl, input);
  } else {
    input = createTag('input', {
      id,
      name: field.id,
      type: 'number',
      inputmode: 'decimal',
      min: field.min,
      max: field.max,
      step: field.step,
      value: String(defaultValue),
    });
    const wrap = createTag('span', { class: 'energy-calculator-input-wrap' }, input);
    if (field.suffix) wrap.append(createTag('span', { class: 'energy-calculator-suffix' }, field.suffix));
    row.append(labelEl, wrap);
  }
  return { row, input };
}

function buildChart(block, chart, strings) {
  const card = createTag('div', { class: 'energy-calculator-metric energy-calculator-chart-card' });
  card.append(createTag('h3', {}, chart.title));
  const canvas = createTag('canvas', { class: 'energy-calculator-chart', role: 'img', 'aria-label': chart.title });
  const wrap = createTag('div', { class: 'energy-calculator-chart-wrap' }, canvas);
  card.append(wrap);

  loadChartJs()
    .then(() => {
      const isBar = chart.type === 'bar';
      const instance = createChart(canvas, {
        type: chart.type,
        data: {
          labels: chart.labels,
          datasets: chart.datasets.map((ds) => {
            const colors = ds.colors.map(chartColor);
            return {
              label: ds.label,
              data: ds.data,
              backgroundColor: isBar ? colors : `${colors[0]}33`,
              borderColor: isBar ? colors : colors[0],
              borderWidth: isBar ? 0 : 2,
              borderRadius: isBar ? 6 : 0,
              fill: !isBar,
              tension: 0.25,
              pointRadius: 0,
            };
          }),
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          aspectRatio: 2.3,
          interaction: { intersect: false, mode: 'index' },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${num(ctx.raw, 2)}` } },
          },
          scales: {
            x: { title: { display: Boolean(chart.xTitle), text: chart.xTitle || '' }, grid: { display: false } },
            y: { beginAtZero: true, ticks: { callback: (value) => num(value, value < 10 ? 1 : 0) } },
          },
        },
      });
      if (instance) block.energyChart = instance;
    })
    .catch(() => {
      wrap.append(createTag('p', { class: 'energy-calculator-chart-fallback' }, strings.chartUnavailable));
    });
  return card;
}

function buildTable(table) {
  const card = createTag('div', { class: 'energy-calculator-metric energy-calculator-breakdown' });
  card.append(createTag('h3', {}, table.title));
  const el = createTag('table', { class: 'energy-calculator-table' });
  const thead = createTag('thead', {}, createTag('tr', {}, table.headers.map((h) => createTag('th', { scope: 'col' }, h))));
  const tbody = createTag('tbody', {}, table.rows.map((cells) => createTag('tr', {}, cells.map((c) => createTag('td', {}, c)))));
  el.append(thead, tbody);
  card.append(el);
  return card;
}

/**
 * Decorates the energy-calculator block.
 * @param {Element} block
 */
export default function decorate(block) {
  const config = readBlockConfig(block);
  const modelKey = getModelKey(block);
  const model = MODELS[modelKey];
  const strings = { ...COMMON_STRINGS };
  ['legend', 'disclaimer', 'chartUnavailable'].forEach((key) => {
    if (config[key.toLowerCase()]) strings[key] = config[key.toLowerCase()];
  });

  block.textContent = '';
  block.dataset.model = modelKey;
  instanceCount += 1;
  const idPrefix = `ec${instanceCount}`;

  const header = createTag('div', { class: 'energy-calculator-header' }, [
    createTag('h2', {}, config.title || model.title),
    createTag('p', { class: 'energy-calculator-intro' }, config.intro || model.intro),
  ]);

  const legend = createTag('details', { class: 'energy-calculator-legend' }, [
    createTag('summary', {}, strings.legend),
    createTag('div', { class: 'energy-calculator-legend-content' }, [
      createTag('ul', {}, model.legendItems.map((item) => createTag('li', {}, item))),
      createTag('p', { class: 'energy-calculator-disclaimer' }, strings.disclaimer),
    ]),
  ]);

  const form = createTag('form', { class: 'energy-calculator-form' });
  const group = createTag('div', { class: 'energy-calculator-group' });
  form.append(group);
  form.addEventListener('submit', (e) => e.preventDefault());

  const output = createTag('section', { class: 'energy-calculator-output', 'aria-live': 'polite' });
  const layout = createTag('div', { class: 'energy-calculator-layout' }, [form, output]);
  block.append(header, legend, layout);

  const refs = {};
  model.fields.forEach((field) => {
    const label = config[`label-${field.id}`] || field.label;
    const rawDefault = config[`default-${field.id}`];
    let value = field.value;
    if (rawDefault !== undefined) {
      if (field.type === 'toggle') value = ['true', 'yes', '1', 'on'].includes(String(rawDefault).toLowerCase());
      else if (field.type === 'select') value = rawDefault;
      else value = toNumber(rawDefault, field.value);
    }
    const { row, input } = buildField(field, label, value, strings, idPrefix);
    group.append(row);
    refs[field.id] = input;
  });

  const values = () => Object.fromEntries(model.fields.map((field) => {
    const input = refs[field.id];
    if (field.type === 'toggle') return [field.id, input.checked];
    if (field.type === 'select') return [field.id, input.value];
    return [field.id, toNumber(input.value, field.value)];
  }));

  const render = () => {
    if (block.energyChart) {
      block.energyChart.destroy();
      block.energyChart = null;
    }
    const result = model.calculate(values());
    output.textContent = '';
    result.metrics.forEach(({ label, value, note }, i) => {
      output.append(createTag('div', { class: 'energy-calculator-metric' }, [
        createTag('h3', {}, config[`result-${i + 1}`] || label),
        createTag('p', { class: 'energy-calculator-metric-value' }, value),
        createTag('p', { class: 'energy-calculator-metric-note' }, note),
      ]));
    });
    if (result.table) output.append(buildTable(result.table));
    if (result.chart) output.append(buildChart(block, result.chart, strings));
  };

  const onEdit = (e) => {
    if (model.onChange && e.target?.name) model.onChange(e.target.name, refs);
    render();
  };
  form.addEventListener('input', onEdit);
  form.addEventListener('change', onEdit);
  window.addEventListener('aem-theme-change', render);
  render();
}
