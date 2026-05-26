const DATA_JSON = 'data/food-enforcement-001-of-001.json';
const YEAR_MIN = 2012;
const YEAR_MAX = 2024;
const CLASSES = ['Class I', 'Class II', 'Class III'];
const STACK_CLASSES = ['Class III', 'Class II', 'Class I'];
const CLASS_COLORS = {
  'Class I': '#f2a7a0',
  'Class II': '#a9c9ee',
  'Class III': '#d8d1c7',
};
const CAUSE_COLORS = {
  'Listeria': '#7c6654',
  'Undeclared allergens': '#8d7460',
  'Salmonella': '#9d826d',
  'Labeling errors': '#ad927b',
  'Foreign material': '#bea38c',
  'E. coli': '#cfb69f',
};

const parseFDADate = d3.timeParse('%Y%m%d');
const formatNumber = d3.format(',');
const formatPercent = d3.format('.1%');

const causeRules = [
  { name: 'Listeria', test: /listeria/i },
  { name: 'Undeclared allergens', test: /undeclared|allergen/i },
  { name: 'Salmonella', test: /salmonella/i },
  { name: 'Labeling errors', test: /label|mislabel|mislabeled/i },
  { name: 'Foreign material', test: /foreign material|extraneous/i },
  { name: 'E. coli', test: /e[. ]?coli/i },
];

let records = [];
let resizeTimer;

function normalizeRecord(record) {
  const initiationDate = parseFDADate(record.recall_initiation_date || '');
  const terminationDate = parseFDADate(record.termination_date || '');
  const reportDate = parseFDADate(record.report_date || '');
  const year = initiationDate ? initiationDate.getFullYear() : reportDate?.getFullYear();
  const durationDays = initiationDate && terminationDate
    ? Math.round((terminationDate - initiationDate) / 86400000)
    : null;

  return {
    ...record,
    classification: record.classification || 'Unknown',
    initiationDate,
    terminationDate,
    reportDate,
    year,
    durationDays,
  };
}

function getResults(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.results)) return json.results;
  return [];
}

async function loadData() {
  const res = await fetch(DATA_JSON);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const json = await res.json();
  records = getResults(json)
    .map(normalizeRecord)
    .filter(d => d.year >= YEAR_MIN && d.year <= YEAR_MAX && CLASSES.includes(d.classification));
}

function setupTooltip() {
  let tooltip = document.querySelector('.tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    document.body.appendChild(tooltip);
  }
  return tooltip;
}

function showTooltip(event, html) {
  const tooltip = setupTooltip();
  tooltip.innerHTML = html;
  tooltip.style.opacity = '1';
  tooltip.style.transform = `translate(${event.clientX + 14}px, ${event.clientY + 14}px)`;
}

function hideTooltip() {
  const tooltip = document.querySelector('.tooltip');
  if (tooltip) tooltip.style.opacity = '0';
}

function clearChart(selector) {
  d3.select(selector).selectAll('*').remove();
}

function chartSize(selector, fallbackHeight = 330) {
  const node = document.querySelector(selector);
  return {
    width: Math.max(320, node.getBoundingClientRect().width),
    height: fallbackHeight,
  };
}

function addTitle(svg, title, subtitle) {
  svg.append('text')
    .attr('class', 'chart-title')
    .attr('x', 0)
    .attr('y', 0)
    .text(title);

  svg.append('text')
    .attr('class', 'chart-subtitle')
    .attr('x', 0)
    .attr('y', 18)
    .text(subtitle);
}

function drawCauseChart() {
  const selector = '#cause-chart';
  clearChart(selector);

  const data = causeRules.map(rule => ({
    name: rule.name,
    count: records.filter(d => rule.test.test(d.reason_for_recall || '')).length,
  }));

  const { width, height } = chartSize(selector, 350);
  const margin = { top: 68, right: 26, bottom: 46, left: 138 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const svg = d3.select(selector).append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('role', 'img')
    .attr('aria-label', 'Horizontal bar chart of leading causes of FDA food recalls');

  const titleGroup = svg.append('g').attr('transform', `translate(${margin.left - 36},28)`);
  addTitle(titleGroup, `Leading causes of FDA food recalls (${YEAR_MIN}-${YEAR_MAX})`, 'Categories are counted from recall reason text and are not mutually exclusive');

  const x = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.count) || 1])
    .nice()
    .range([0, innerWidth]);

  const y = d3.scaleBand()
    .domain(data.map(d => d.name))
    .range([0, innerHeight])
    .padding(0.32);

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  g.append('g')
    .attr('class', 'grid')
    .call(d3.axisBottom(x).ticks(4).tickSize(innerHeight).tickFormat(''));

  g.append('g')
    .attr('class', 'axis')
    .call(d3.axisLeft(y));

  g.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).ticks(4).tickFormat(formatNumber));

  g.selectAll('rect')
    .data(data)
    .join('rect')
    .attr('y', d => y(d.name))
    .attr('width', d => x(d.count))
    .attr('height', y.bandwidth())
    .attr('rx', 3)
    .attr('fill', d => CAUSE_COLORS[d.name])
    .attr('opacity', 0.98)
    .on('mousemove', (event, d) => {
      showTooltip(event, `<strong>${d.name}</strong><br>${formatNumber(d.count)} recall records`);
    })
    .on('mouseleave', hideTooltip);

  svg.append('text')
    .attr('class', 'axis-label')
    .attr('x', margin.left + innerWidth / 2)
    .attr('y', height - 8)
    .attr('text-anchor', 'middle')
    .text(`Number of recall records (${YEAR_MIN}-${YEAR_MAX})`);
}

function drawSeverityChart() {
  const selector = '#severity-chart';
  clearChart(selector);

  const years = d3.range(YEAR_MIN, YEAR_MAX + 1);
  const data = years.map(year => {
    const row = { year };
    CLASSES.forEach(classification => {
      row[classification] = records.filter(d => d.year === year && d.classification === classification).length;
    });
    return row;
  });

  const stacked = d3.stack().keys(STACK_CLASSES)(data);
  const { width, height } = chartSize(selector, 350);
  const margin = { top: 68, right: 88, bottom: 42, left: 58 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const svg = d3.select(selector).append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('role', 'img')
    .attr('aria-label', 'Stacked bar chart of FDA food recalls by year and severity classification');

  const titleGroup = svg.append('g').attr('transform', `translate(${margin.left},28)`);
  addTitle(titleGroup, 'FDA food recalls by year and severity classification', 'High-severity Class I recalls remain consistently present across years');

  const x = d3.scaleBand()
    .domain(years)
    .range([0, innerWidth])
    .padding(0.22);

  const y = d3.scaleLinear()
    .domain([0, d3.max(data, d => CLASSES.reduce((sum, key) => sum + d[key], 0)) || 1])
    .nice()
    .range([innerHeight, 0]);

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  g.append('g')
    .attr('class', 'grid')
    .call(d3.axisLeft(y).ticks(4).tickSize(-innerWidth).tickFormat(''));

  g.selectAll('g.stack')
    .data(stacked)
    .join('g')
    .attr('class', 'stack')
    .attr('fill', d => CLASS_COLORS[d.key])
    .selectAll('rect')
    .data(d => d.map(item => ({ ...item, key: d.key })))
    .join('rect')
    .attr('x', d => x(d.data.year))
    .attr('y', d => y(d[1]))
    .attr('height', d => y(d[0]) - y(d[1]))
    .attr('width', x.bandwidth())
    .attr('stroke', '#ffffff')
    .attr('stroke-width', 0.7)
    .on('mousemove', (event, d) => {
      const count = d.data[d.key];
      showTooltip(event, `<strong>${d.data.year} ${d.key}</strong><br>${formatNumber(count)} recalls`);
    })
    .on('mouseleave', hideTooltip);

  g.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).tickValues(years.filter(y => y % 2 === 0)));

  g.append('g')
    .attr('class', 'axis')
    .call(d3.axisLeft(y).ticks(4).tickFormat(formatNumber));

  svg.append('text')
    .attr('class', 'axis-label')
    .attr('transform', `translate(15,${margin.top + innerHeight / 2}) rotate(-90)`)
    .attr('text-anchor', 'middle')
    .text('Number of recall records');

  const legend = svg.append('g').attr('transform', `translate(${width - margin.right + 12},${margin.top + 108})`);
  legend.append('text').attr('class', 'legend-title').attr('x', 0).attr('y', -12).text('classification');
  CLASSES.forEach((classification, i) => {
    const row = legend.append('g').attr('transform', `translate(0,${i * 22})`);
    row.append('rect').attr('width', 13).attr('height', 13).attr('fill', CLASS_COLORS[classification]);
    row.append('text').attr('x', 18).attr('y', 10).attr('class', 'legend-label').text(classification);
  });
}

function drawDurationChart() {
  const selector = '#duration-chart';
  clearChart(selector);

  const durationRecords = records.filter(d => (
    CLASSES.includes(d.classification)
    && Number.isFinite(d.durationDays)
    && d.durationDays >= 0
    && d.durationDays <= 365
  ));

  const binsByClass = new Map(CLASSES.map(classification => [
    classification,
    d3.bin()
      .domain([0, 365])
      .thresholds(d3.range(0, 391, 30))(durationRecords.filter(d => d.classification === classification).map(d => d.durationDays)),
  ]));

  const { width, height } = chartSize(selector, 350);
  const margin = { top: 68, right: 26, bottom: 42, left: 58 };
  const innerWidth = width - margin.left - margin.right;
  const facetGap = 24;
  const facetHeight = (height - margin.top - margin.bottom - facetGap * 2) / 3;

  const svg = d3.select(selector).append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('role', 'img')
    .attr('aria-label', 'Faceted histograms showing days between recall initiation and termination');

  const titleGroup = svg.append('g').attr('transform', `translate(${margin.left},28)`);
  addTitle(titleGroup, 'How long food recalls remain active', 'Most recalls are resolved within the first few months, though some last longer');

  const x = d3.scaleLinear()
    .domain([0, 365])
    .range([0, innerWidth]);

  const maxBin = d3.max(Array.from(binsByClass.values()).flat(), d => d.length) || 1;
  const y = d3.scaleLinear()
    .domain([0, maxBin])
    .nice()
    .range([facetHeight, 0]);

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  CLASSES.forEach((classification, index) => {
    const facet = g.append('g').attr('transform', `translate(0,${index * (facetHeight + facetGap)})`);
    const bins = binsByClass.get(classification);

    facet.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(y).ticks(3).tickSize(-innerWidth).tickFormat(''));

    facet.selectAll('rect')
      .data(bins)
      .join('rect')
      .attr('x', d => x(d.x0) + 1)
      .attr('y', d => y(d.length))
      .attr('width', d => Math.max(0, x(d.x1) - x(d.x0) - 2))
      .attr('height', d => facetHeight - y(d.length))
      .attr('fill', CLASS_COLORS[classification])
      .attr('opacity', 0.95)
      .on('mousemove', (event, d) => {
        showTooltip(event, `<strong>${classification}</strong><br>${formatNumber(d.length)} recalls<br>${Math.round(d.x0)}-${Math.round(d.x1)} days`);
      })
      .on('mouseleave', hideTooltip);

    facet.append('g')
      .attr('class', 'axis')
      .call(d3.axisLeft(y).ticks(3).tickFormat(formatNumber));

    facet.append('text')
      .attr('class', 'facet-label')
      .attr('x', innerWidth / 2)
      .attr('y', -6)
      .attr('text-anchor', 'middle')
      .text(classification);

    if (index === CLASSES.length - 1) {
      facet.append('g')
        .attr('class', 'axis')
        .attr('transform', `translate(0,${facetHeight})`)
        .call(d3.axisBottom(x).tickValues([0, 60, 120, 180, 240, 300, 360]));
    }
  });

  svg.append('text')
    .attr('class', 'axis-label')
    .attr('x', margin.left + innerWidth / 2)
    .attr('y', height - 6)
    .attr('text-anchor', 'middle')
    .text('Days between recall initiation and termination');

  svg.append('text')
    .attr('class', 'axis-label')
    .attr('transform', `translate(15,${margin.top + (facetHeight * 3 + facetGap * 2) / 2}) rotate(-90)`)
    .attr('text-anchor', 'middle')
    .text('Number of recalls');
}

function updateShares() {
  const total = records.length || 1;
  const counts = d3.rollup(records, v => v.length, d => d.classification);
  document.getElementById('class-i-share').textContent = formatPercent((counts.get('Class I') || 0) / total);
  document.getElementById('class-ii-share').textContent = formatPercent((counts.get('Class II') || 0) / total);
  document.getElementById('class-iii-share').textContent = formatPercent((counts.get('Class III') || 0) / total);
}

function renderCharts() {
  drawCauseChart();
  drawSeverityChart();
  drawDurationChart();
  updateShares();
}

async function init() {
  try {
    await loadData();
    renderCharts();
  } catch (err) {
    document.querySelectorAll('.viz').forEach(el => {
      el.innerHTML = `<p class="error">Could not load chart data: ${err.message}</p>`;
    });
  }
}

window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    if (records.length) renderCharts();
  }, 150);
});

document.addEventListener('DOMContentLoaded', init);
