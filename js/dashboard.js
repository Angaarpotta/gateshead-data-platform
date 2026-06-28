/* ============================================================
   Dashboard.js — Power BI-style analytics dashboard
   Chart.js charts with realistic Gateshead council data
   Gateshead Data Platform Portfolio
   ============================================================ */

// Gateshead wards — real names for authenticity
const WARDS = [
  'Birtley', 'Blaydon', 'Bridges', 'Chopwell & Rowlands Gill',
  'Chowdene', 'Deckham', 'Dunston & Teams', 'Felling',
  'High Fell', 'Lamesley', 'Lobley Hill & Bensham', 'Low Fell',
  'Pelaw & Heworth', 'Saltwell', 'Whickham North',
  'Whickham South', 'Windy Nook & Whitehills', 'Winlaton & High Spen',
  'Ryton', 'Crawcrook & Greenside'
];

const DEPARTMENTS = [
  'Council Tax', 'Housing', 'Waste Collection',
  'Social Care', 'Education', 'Planning'
];

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

// I spent a while getting this data to look realistic — it's based
// loosely on public FOI responses from NE councils
const SERVICE_DATA = {
  'Council Tax':       [1820, 1640, 1510, 1390, 1450, 1280, 1170, 1260, 1580, 1740, 1890, 2140],
  'Housing':           [890, 920, 870, 810, 850, 780, 920, 980, 1020, 970, 910, 830],
  'Waste Collection':  [640, 580, 620, 710, 850, 940, 1080, 1020, 870, 720, 650, 590],
  'Social Care':       [420, 440, 410, 430, 450, 470, 460, 480, 510, 530, 490, 470],
  'Education':         [310, 340, 280, 260, 190, 120, 90, 140, 380, 350, 320, 290],
  'Planning':          [180, 210, 240, 260, 290, 310, 280, 270, 250, 230, 200, 190]
};

// forecast extension — simple linear projection for next 3 months
function projectForecast(data, months = 3) {
  const n = data.length;
  const xMean = (n - 1) / 2;
  const yMean = data.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (data[i] - yMean);
    den += (i - xMean) ** 2;
  }
  const slope = num / den;
  const intercept = yMean - slope * xMean;

  const forecast = [];
  for (let i = 0; i < months; i++) {
    // add some noise so it doesn't look perfectly straight
    const noise = (Math.random() - 0.5) * 60;
    forecast.push(Math.round(intercept + slope * (n + i) + noise));
  }
  return forecast;
}

// ward-level deprivation scores (higher = more deprived, loosely based on IMD 2019)
const WARD_SCORES = {
  'Birtley': 24.3, 'Blaydon': 18.7, 'Bridges': 38.2,
  'Chopwell & Rowlands Gill': 26.1, 'Chowdene': 15.4,
  'Deckham': 42.8, 'Dunston & Teams': 39.5, 'Felling': 44.1,
  'High Fell': 36.9, 'Lamesley': 12.3,
  'Lobley Hill & Bensham': 34.6, 'Low Fell': 14.8,
  'Pelaw & Heworth': 31.2, 'Saltwell': 41.7,
  'Whickham North': 9.8, 'Whickham South': 8.2,
  'Windy Nook & Whitehills': 28.4, 'Winlaton & High Spen': 22.9,
  'Ryton': 13.5, 'Crawcrook & Greenside': 11.1
};

// budget data by department (£ thousands)
const BUDGET_DATA = {
  labels: DEPARTMENTS,
  allocated: [4200, 8900, 3100, 12400, 6800, 1200],
  spent:     [3890, 9240, 2870, 11800, 6350, 1050]
};

let charts = {};
let selectedDepartment = 'All';

export function initDashboard() {
  renderKPIs();
  renderFilters();
  createCharts();
}

function renderKPIs() {
  const container = document.getElementById('kpi-container');
  if (!container) return;

  const totalRequests = Object.values(SERVICE_DATA)
    .reduce((sum, arr) => sum + arr.reduce((a, b) => a + b, 0), 0);
  const avgMonthly = Math.round(totalRequests / 12);
  const prevYearTotal = Math.round(totalRequests * 0.94); // 6% growth assumed

  const kpis = [
    {
      label: 'Total Service Requests',
      value: totalRequests.toLocaleString(),
      change: `+${((totalRequests / prevYearTotal - 1) * 100).toFixed(1)}%`,
      positive: false,
      sparkData: Object.values(SERVICE_DATA)[0]
    },
    {
      label: 'Avg Monthly Volume',
      value: avgMonthly.toLocaleString(),
      change: '+3.2%',
      positive: false,
      sparkData: MONTHS.map((_, i) =>
        Object.values(SERVICE_DATA).reduce((s, arr) => s + arr[i], 0))
    },
    {
      label: 'Data Quality Score',
      value: '94.7%',
      change: '+2.1pp',
      positive: true,
      sparkData: [89.2, 90.1, 90.8, 91.4, 92.0, 92.3, 92.8, 93.1, 93.6, 94.0, 94.3, 94.7]
    },
    {
      label: 'Avg Resolution (days)',
      value: '4.8',
      change: '−0.6',
      positive: true,
      sparkData: [6.2, 5.9, 5.7, 5.5, 5.4, 5.3, 5.2, 5.1, 5.0, 4.9, 4.8, 4.8]
    }
  ];

  container.innerHTML = kpis.map((kpi, i) => `
    <div class="kpi-card">
      <div class="kpi-label">${kpi.label}</div>
      <div class="kpi-value">${kpi.value}</div>
      <div class="kpi-change ${kpi.positive ? 'positive' : 'negative'}">${kpi.change} vs prior year</div>
      <div class="kpi-sparkline"><canvas id="spark-${i}"></canvas></div>
    </div>
  `).join('');

  // render sparklines after DOM insertion
  requestAnimationFrame(() => {
    kpis.forEach((kpi, i) => {
      const canvas = document.getElementById(`spark-${i}`);
      if (!canvas) return;
      createSparkline(canvas, kpi.sparkData, kpi.positive);
    });
  });
}

function createSparkline(canvas, data, positive) {
  new Chart(canvas, {
    type: 'line',
    data: {
      labels: data.map((_, i) => i),
      datasets: [{
        data: data,
        borderColor: positive ? '#00b894' : '#ff6b6b',
        borderWidth: 1.5,
        fill: true,
        backgroundColor: positive
          ? 'rgba(0, 184, 148, 0.08)'
          : 'rgba(255, 107, 107, 0.08)',
        pointRadius: 0,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: { display: false },
        y: { display: false }
      },
      animation: { duration: 800 }
    }
  });
}

function renderFilters() {
  const container = document.getElementById('dashboard-filters');
  if (!container) return;

  container.innerHTML = `
    <div class="filter-group">
      <label>Department</label>
      <select class="filter-select" id="filter-dept">
        <option value="All">All Departments</option>
        ${DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}
      </select>
    </div>
    <div class="filter-group">
      <label>Period</label>
      <select class="filter-select" id="filter-period">
        <option value="12">Last 12 Months</option>
        <option value="6">Last 6 Months</option>
        <option value="3">Last 3 Months</option>
      </select>
    </div>
  `;

  document.getElementById('filter-dept')?.addEventListener('change', (e) => {
    selectedDepartment = e.target.value;
    updateCharts();
  });

  document.getElementById('filter-period')?.addEventListener('change', () => {
    updateCharts();
  });
}

function createCharts() {
  const chartDefaults = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        labels: {
          color: '#9ca0b0',
          font: { family: "'Inter', sans-serif", size: 11 },
          padding: 16
        }
      },
      tooltip: {
        backgroundColor: '#1a1e2b',
        titleColor: '#e4e6ec',
        bodyColor: '#9ca0b0',
        borderColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        padding: 12,
        titleFont: { family: "'Inter', sans-serif", weight: '600' },
        bodyFont: { family: "'Inter', sans-serif" },
        cornerRadius: 8
      }
    },
    scales: {
      x: {
        ticks: { color: '#5c6078', font: { size: 11, family: "'Inter', sans-serif" } },
        grid: { color: 'rgba(255,255,255,0.03)' },
        border: { color: 'rgba(255,255,255,0.06)' }
      },
      y: {
        ticks: { color: '#5c6078', font: { size: 11, family: "'Inter', sans-serif" } },
        grid: { color: 'rgba(255,255,255,0.03)' },
        border: { color: 'rgba(255,255,255,0.06)' }
      }
    }
  };

  // 1. Service Demand Forecast (line chart)
  const forecastCtx = document.getElementById('forecast-chart');
  if (forecastCtx) {
    const totalMonthly = MONTHS.map((_, i) =>
      Object.values(SERVICE_DATA).reduce((s, arr) => s + arr[i], 0)
    );
    const forecast = projectForecast(totalMonthly);
    const extendedLabels = [...MONTHS, 'Jan (F)', 'Feb (F)', 'Mar (F)'];

    charts.forecast = new Chart(forecastCtx, {
      type: 'line',
      data: {
        labels: extendedLabels,
        datasets: [
          {
            label: 'Actual',
            data: [...totalMonthly, ...Array(3).fill(null)],
            borderColor: '#00c9a7',
            backgroundColor: 'rgba(0, 201, 167, 0.06)',
            borderWidth: 2,
            fill: true,
            tension: 0.35,
            pointRadius: 3,
            pointBackgroundColor: '#00c9a7'
          },
          {
            label: 'Forecast',
            data: [...Array(11).fill(null), totalMonthly[11], ...forecast],
            borderColor: '#7c6df0',
            borderDash: [6, 4],
            borderWidth: 2,
            fill: false,
            tension: 0.35,
            pointRadius: 3,
            pointBackgroundColor: '#7c6df0'
          }
        ]
      },
      options: { ...chartDefaults }
    });
  }

  // 2. Resource Allocation (horizontal bar)
  const allocCtx = document.getElementById('allocation-chart');
  if (allocCtx) {
    charts.allocation = new Chart(allocCtx, {
      type: 'bar',
      data: {
        labels: BUDGET_DATA.labels,
        datasets: [
          {
            label: 'Budget (£k)',
            data: BUDGET_DATA.allocated,
            backgroundColor: 'rgba(0, 201, 167, 0.3)',
            borderColor: '#00c9a7',
            borderWidth: 1,
            borderRadius: 4
          },
          {
            label: 'Spend (£k)',
            data: BUDGET_DATA.spent,
            backgroundColor: 'rgba(124, 109, 240, 0.3)',
            borderColor: '#7c6df0',
            borderWidth: 1,
            borderRadius: 4
          }
        ]
      },
      options: {
        ...chartDefaults,
        indexAxis: 'y',
      }
    });
  }

  // 3. Service Type Breakdown (donut)
  const servicesCtx = document.getElementById('services-chart');
  if (servicesCtx) {
    const totals = DEPARTMENTS.map(d =>
      SERVICE_DATA[d].reduce((a, b) => a + b, 0)
    );

    charts.services = new Chart(servicesCtx, {
      type: 'doughnut',
      data: {
        labels: DEPARTMENTS,
        datasets: [{
          data: totals,
          backgroundColor: [
            'rgba(0, 201, 167, 0.7)',
            'rgba(124, 109, 240, 0.7)',
            'rgba(247, 201, 72, 0.7)',
            'rgba(116, 185, 255, 0.7)',
            'rgba(255, 107, 107, 0.7)',
            'rgba(162, 155, 254, 0.7)'
          ],
          borderColor: '#131620',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: '65%',
        plugins: {
          legend: {
            position: 'right',
            labels: {
              color: '#9ca0b0',
              font: { family: "'Inter', sans-serif", size: 11 },
              padding: 12
            }
          },
          tooltip: chartDefaults.plugins.tooltip
        }
      }
    });
  }

  // 4. Ward Deprivation Heatmap (as horizontal bar — cleaner than a real heatmap at this scale)
  const wardCtx = document.getElementById('ward-chart');
  if (wardCtx) {
    // sort wards by deprivation score
    const sorted = Object.entries(WARD_SCORES)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 12); // top 12 for readability

    charts.ward = new Chart(wardCtx, {
      type: 'bar',
      data: {
        labels: sorted.map(([w]) => w),
        datasets: [{
          label: 'Deprivation Score (IMD)',
          data: sorted.map(([, s]) => s),
          backgroundColor: sorted.map(([, s]) => {
            if (s > 35) return 'rgba(255, 107, 107, 0.6)';
            if (s > 20) return 'rgba(247, 201, 72, 0.6)';
            return 'rgba(0, 201, 167, 0.6)';
          }),
          borderColor: sorted.map(([, s]) => {
            if (s > 35) return '#ff6b6b';
            if (s > 20) return '#f7c948';
            return '#00c9a7';
          }),
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        ...chartDefaults,
        indexAxis: 'y',
        plugins: {
          ...chartDefaults.plugins,
          legend: { display: false }
        }
      }
    });
  }
}

function updateCharts() {
  const periodEl = document.getElementById('filter-period');
  const period = periodEl ? parseInt(periodEl.value) : 12;
  const sliceStart = 12 - period;

  if (charts.forecast) {
    const filteredMonths = MONTHS.slice(sliceStart);

    let totalMonthly;
    if (selectedDepartment === 'All') {
      totalMonthly = filteredMonths.map((_, i) =>
        Object.values(SERVICE_DATA).reduce((s, arr) => s + arr[sliceStart + i], 0)
      );
    } else {
      totalMonthly = SERVICE_DATA[selectedDepartment]?.slice(sliceStart) || [];
    }

    const forecast = projectForecast(totalMonthly);
    const labels = [...filteredMonths, 'Next +1', 'Next +2', 'Next +3'];

    charts.forecast.data.labels = labels;
    charts.forecast.data.datasets[0].data = [...totalMonthly, ...Array(3).fill(null)];
    charts.forecast.data.datasets[1].data = [
      ...Array(totalMonthly.length - 1).fill(null),
      totalMonthly[totalMonthly.length - 1],
      ...forecast
    ];
    charts.forecast.update('active');
  }

  if (charts.services) {
    const totals = DEPARTMENTS.map(d => {
      const slice = SERVICE_DATA[d].slice(sliceStart);
      return slice.reduce((a, b) => a + b, 0);
    });
    charts.services.data.datasets[0].data = totals;
    charts.services.update('active');
  }
}
