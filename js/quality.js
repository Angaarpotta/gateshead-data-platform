/* ============================================================
   Quality.js — data quality engine
   Runs client-side validation rules against sample council data
   Gateshead Data Platform Portfolio
   ============================================================ */

// Sample council tax data — intentionally includes errors for the demo
const SAMPLE_DATA = [
  { account_ref: 'CT00012847', title: 'Mr', forename: 'James', surname: 'Henderson', address: '14 Coatsworth Road', postcode: 'NE8 1SR', ward_code: 'E05001086', band: 'C', start_date: '2022-04-01', annual_charge: 1456.78, balance: 0.00, payment_method: 'DD' },
  { account_ref: 'CT00012848', title: 'Mrs', forename: 'Sarah', surname: 'Thompson', address: '28 Durham Road', postcode: 'NE9 5QR', ward_code: 'E05001087', band: 'B', start_date: '2023-01-15', annual_charge: 1245.90, balance: -23.50, payment_method: 'CARD' },
  { account_ref: 'CT00012849', title: '', forename: 'Robert', surname: '', address: '7 Low Fell Lane', postcode: 'INVALID', ward_code: 'E05009999', band: 'Z', start_date: '2025-13-01', annual_charge: -500.00, balance: 0, payment_method: 'CASH' },
  { account_ref: 'CT00012850', title: 'Ms', forename: 'Fatima', surname: 'Al-Rashid', address: '92 Saltwell Road', postcode: 'NE8 4JS', ward_code: 'E05001092', band: 'A', start_date: '2024-06-20', annual_charge: 1089.30, balance: 544.65, payment_method: 'DD' },
  { account_ref: '', title: 'Dr', forename: 'Michael', surname: 'Okonkwo', address: '3 Team Street', postcode: 'NE8 2QT', ward_code: 'E05001088', band: 'D', start_date: '2021-09-01', annual_charge: 1634.20, balance: 0.00, payment_method: 'DD' },
  { account_ref: 'CT00012852', title: 'Mr', forename: 'David', surname: 'Wilson', address: '55 Whickham Highway', postcode: 'NE16 3AP', ward_code: 'E05001098', band: 'E', start_date: '2020-04-01', annual_charge: 1998.45, balance: 166.54, payment_method: 'BACS' },
  { account_ref: 'CT00012853', title: 'Mrs', forename: 'Linda', surname: null, address: '12 Birtley Lane', postcode: 'DH3 1JT', ward_code: 'E05001080', band: 'B', start_date: '2023-04-01', annual_charge: 1245.90, balance: 0.00, payment_method: 'DD' },
  { account_ref: 'CT00012854', title: 'Mr', forename: '', surname: 'Patel', address: '8 Bensham Road', postcode: 'NE8 1YJ', ward_code: 'E05001091', band: 'A', start_date: '2024-03-15', annual_charge: 1089.30, balance: 800.00, payment_method: 'CASH' },
  { account_ref: 'CT00012855', title: 'Miss', forename: 'Emma', surname: 'Clarke', address: '41 Ryton Village', postcode: 'NE40 3NE', ward_code: 'E05001094', band: 'F', start_date: '2019-04-01', annual_charge: 2340.60, balance: 0.00, payment_method: 'DD' },
  { account_ref: 'CT00012856', title: 'Mr', forename: 'Tomasz', surname: 'Kowalski', address: '16 Felling Shore Road', postcode: 'NE10 0HB', ward_code: 'E05001085', band: 'C', start_date: '2022-11-01', annual_charge: 1456.78, balance: 121.40, payment_method: 'CARD' }
];

// Valid ward codes for Gateshead (subset — enough to test with)
const VALID_WARDS = [
  'E05001080', 'E05001081', 'E05001082', 'E05001083', 'E05001084',
  'E05001085', 'E05001086', 'E05001087', 'E05001088', 'E05001089',
  'E05001090', 'E05001091', 'E05001092', 'E05001093', 'E05001094',
  'E05001095', 'E05001096', 'E05001097', 'E05001098', 'E05001099'
];

// Validation rules
const RULES = [
  {
    id: 'R001',
    name: 'Account Reference — Not Null',
    field: 'account_ref',
    check: (val) => val !== null && val !== undefined && val !== '',
    severity: 'fail',
    description: 'Every record must have an account reference'
  },
  {
    id: 'R002',
    name: 'Account Reference — Format',
    field: 'account_ref',
    check: (val) => !val || /^CT\d{8}$/.test(val),
    severity: 'fail',
    description: 'Account ref must match pattern CT followed by 8 digits'
  },
  {
    id: 'R003',
    name: 'Surname — Not Null',
    field: 'surname',
    check: (val) => val !== null && val !== undefined && val !== '',
    severity: 'fail',
    description: 'Surname is required for all liable parties'
  },
  {
    id: 'R004',
    name: 'Forename — Not Null',
    field: 'forename',
    check: (val) => val !== null && val !== undefined && val !== '',
    severity: 'warn',
    description: 'Forename should be present (some historic records may lack it)'
  },
  {
    id: 'R005',
    name: 'Postcode — Valid Format',
    field: 'postcode',
    // UK postcode regex — not perfect but good enough for validation
    check: (val) => !val || /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(val),
    severity: 'fail',
    description: 'Postcode must be a valid UK format'
  },
  {
    id: 'R006',
    name: 'Ward Code — Valid Reference',
    field: 'ward_code',
    check: (val) => VALID_WARDS.includes(val),
    severity: 'fail',
    description: 'Ward code must exist in the ONS ward reference table'
  },
  {
    id: 'R007',
    name: 'Council Tax Band — Valid',
    field: 'band',
    check: (val) => ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].includes(val),
    severity: 'fail',
    description: 'Band must be A through H'
  },
  {
    id: 'R008',
    name: 'Start Date — Valid',
    field: 'start_date',
    check: (val) => {
      if (!val) return false;
      const d = new Date(val);
      return !isNaN(d.getTime()) && d <= new Date();
    },
    severity: 'fail',
    description: 'Liable start date must be a valid date, not in the future'
  },
  {
    id: 'R009',
    name: 'Annual Charge — Positive',
    field: 'annual_charge',
    check: (val) => typeof val === 'number' && val > 0,
    severity: 'fail',
    description: 'Annual charge must be a positive number'
  },
  {
    id: 'R010',
    name: 'Title — Present',
    field: 'title',
    check: (val) => val !== null && val !== undefined && val !== '',
    severity: 'warn',
    description: 'Title is preferred for correspondence but not strictly required'
  }
];

let currentData = SAMPLE_DATA;
let hasRun = false;

export function initQuality() {
  setupUploadZone();
  setupRunButton();
}

function setupUploadZone() {
  const zone = document.getElementById('quality-upload');
  if (!zone) return;

  // drag and drop
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });

  zone.addEventListener('dragleave', () => {
    zone.classList.remove('dragover');
  });

  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
      parseCSV(file);
    }
  });

  // click to upload
  zone.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = () => {
      if (input.files[0]) parseCSV(input.files[0]);
    };
    input.click();
  });
}

function parseCSV(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    const lines = text.trim().split('\n');
    if (lines.length < 2) return;

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
    currentData = lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim());
      const row = {};
      headers.forEach((h, i) => {
        let val = vals[i] || '';
        // try to parse numbers
        if (/^\d+\.?\d*$/.test(val)) val = parseFloat(val);
        row[h] = val;
      });
      return row;
    });

    // update upload zone text
    const zone = document.getElementById('quality-upload');
    if (zone) {
      zone.innerHTML = `
        <div class="upload-icon">✅</div>
        <div class="upload-text">Loaded: ${file.name}</div>
        <div class="upload-hint">${currentData.length} rows parsed</div>
      `;
    }
  };
  reader.readAsText(file);
}

function setupRunButton() {
  const btn = document.getElementById('quality-run');
  if (!btn) return;

  btn.addEventListener('click', () => {
    runValidation();
  });
}

function runValidation() {
  const results = [];

  currentData.forEach((row, rowIdx) => {
    RULES.forEach(rule => {
      const value = row[rule.field];
      const passed = rule.check(value);
      results.push({
        row: rowIdx + 1,
        ruleId: rule.id,
        ruleName: rule.name,
        field: rule.field,
        value: value === null || value === undefined ? '(null)' : String(value),
        passed,
        severity: rule.severity,
        description: rule.description
      });
    });
  });

  hasRun = true;
  renderResults(results);
  renderCodePreview();
}

function renderResults(results) {
  const container = document.getElementById('quality-results');
  if (!container) return;

  const totalChecks = results.length;
  const passed = results.filter(r => r.passed).length;
  const warnings = results.filter(r => !r.passed && r.severity === 'warn').length;
  const failures = results.filter(r => !r.passed && r.severity === 'fail').length;
  const score = ((passed / totalChecks) * 100).toFixed(1);

  // scorecard
  let html = `
    <div class="quality-scorecard">
      <div class="score-item pass">
        <div class="score-value">${passed}</div>
        <div class="score-label">Passed</div>
      </div>
      <div class="score-item warn">
        <div class="score-value">${warnings}</div>
        <div class="score-label">Warnings</div>
      </div>
      <div class="score-item fail">
        <div class="score-value">${failures}</div>
        <div class="score-label">Failures</div>
      </div>
      <div class="score-item ${parseFloat(score) >= 90 ? 'pass' : parseFloat(score) >= 70 ? 'warn' : 'fail'}">
        <div class="score-value">${score}%</div>
        <div class="score-label">DQ Score</div>
      </div>
    </div>
  `;

  // failures table
  const failedResults = results.filter(r => !r.passed);
  if (failedResults.length > 0) {
    html += `
      <h4 style="margin-bottom: 12px;">Issues Found</h4>
      <table class="quality-results-table">
        <thead>
          <tr>
            <th>Row</th>
            <th>Rule</th>
            <th>Field</th>
            <th>Value</th>
            <th>Severity</th>
          </tr>
        </thead>
        <tbody>
          ${failedResults.map(r => `
            <tr>
              <td>${r.row}</td>
              <td>${r.ruleName}</td>
              <td><code style="font-family: var(--mono); font-size: 0.75rem; color: var(--accent);">${r.field}</code></td>
              <td>${r.value || '(empty)'}</td>
              <td><span class="badge badge-${r.severity}">${r.severity}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } else {
    html += `<p style="color: var(--success); font-weight: 600;">All checks passed — no issues found.</p>`;
  }

  container.innerHTML = html;
  container.style.animation = 'fadeSlideUp 0.4s ease-out';
}

function renderCodePreview() {
  const codeEl = document.getElementById('quality-code');
  if (!codeEl) return;

  codeEl.innerHTML = `
    <div class="card" style="margin-top: 1.5rem;">
      <h4 style="margin-bottom: 8px;">Equivalent Fabric Implementation</h4>
      <p class="code-annotation" style="margin-bottom: 12px;">
        In production, these rules run as a Great Expectations suite inside a Fabric notebook. Here's what the Python equivalent looks like:
      </p>
      <div class="code-display">
        <pre><code class="language-python"># Data quality validation — runs as post-ingestion step
# Using Great Expectations-style checks in a Fabric notebook

import pyspark.sql.functions as F
from pyspark.sql import DataFrame

def validate_council_tax(df: DataFrame) -> dict:
    """Run DQ rules and return a scorecard dict."""
    total_rows = df.count()
    results = {}

    # R001: account_ref not null
    nulls = df.filter(F.col("account_ref").isNull()
                      | (F.col("account_ref") == "")).count()
    results["account_ref_not_null"] = {
        "passed": total_rows - nulls,
        "failed": nulls,
        "severity": "FAIL"
    }

    # R005: postcode valid format
    invalid_pc = df.filter(
        ~F.col("postcode").rlike(
            r"^[A-Z]{1,2}\\d[A-Z\\d]?\\s*\\d[A-Z]{2}$"
        )
    ).count()
    results["postcode_format"] = {
        "passed": total_rows - invalid_pc,
        "failed": invalid_pc,
        "severity": "FAIL"
    }

    # R006: ward_code referential integrity
    valid_wards = spark.read.table("ref.wards") \\
        .select("ward_code").collect()
    valid_set = {r.ward_code for r in valid_wards}

    invalid_wards = df.filter(
        ~F.col("ward_code").isin(list(valid_set))
    ).count()
    results["ward_code_valid"] = {
        "passed": total_rows - invalid_wards,
        "failed": invalid_wards,
        "severity": "FAIL"
    }

    # Calculate overall DQ score
    total_checks = sum(
        r["passed"] + r["failed"] for r in results.values()
    )
    total_passed = sum(r["passed"] for r in results.values())
    results["_overall_score"] = round(
        total_passed / total_checks * 100, 1
    )

    return results</code></pre>
      </div>
    </div>
  `;

  if (typeof Prism !== 'undefined') {
    Prism.highlightAllUnder(codeEl);
  }
}
