/* ============================================================
   Governance.js — data catalog and governance framework
   Searchable catalog, lineage, data dictionary, policies
   Gateshead Data Platform Portfolio
   ============================================================ */

const DATASETS = [
  {
    id: 'council-tax',
    name: 'Council Tax Accounts',
    owner: 'Revenues & Benefits Team',
    classification: 'official',
    description: 'Active council tax accounts including liability, payment status, and property details. Core dataset for the revenues dashboard.',
    quality: 94.7,
    freshness: 'Daily (02:00)',
    records: '142,847',
    lastUpdated: '2024-12-15',
    lineage: ['Northgate Revenues', 'Bronze (raw)', 'Silver (cleansed)', 'Gold (council_tax_summary)', 'Power BI'],
    columns: [
      { name: 'account_ref', type: 'VARCHAR(10)', description: 'Unique account reference (CT + 8 digits)', pii: false },
      { name: 'property_ref', type: 'VARCHAR(12)', description: 'Property reference — links to Properties dataset', pii: false },
      { name: 'liable_name', type: 'VARCHAR(100)', description: 'Full name of the liable party', pii: true },
      { name: 'postcode', type: 'VARCHAR(8)', description: 'Property postcode (standardised format)', pii: false },
      { name: 'ward_code', type: 'VARCHAR(9)', description: 'ONS ward code (E05xxxxxx)', pii: false },
      { name: 'band', type: 'CHAR(1)', description: 'Council tax band (A-H)', pii: false },
      { name: 'annual_charge', type: 'DECIMAL(10,2)', description: 'Annual charge amount in GBP', pii: false },
      { name: 'balance_outstanding', type: 'DECIMAL(10,2)', description: 'Current balance owed', pii: false }
    ],
    policies: {
      retention: '7 years after account closure (legal requirement)',
      access: 'Revenues team + Finance (read-only) + Data team (admin)',
      pii: 'liable_name field subject to GDPR — mask in non-production environments'
    }
  },
  {
    id: 'housing-properties',
    name: 'Housing Properties',
    owner: 'Housing Management',
    classification: 'official',
    description: 'Council housing stock — property attributes, tenure details, current void status. Used across housing, repairs, and asset management.',
    quality: 97.2,
    freshness: 'Daily (03:00)',
    records: '42,391',
    lastUpdated: '2024-12-15',
    lineage: ['NEC Housing', 'Bronze (raw)', 'Silver (dim_properties — SCD2)', 'Gold (property_analytics)', 'Power BI'],
    columns: [
      { name: 'property_ref', type: 'VARCHAR(12)', description: 'Unique property reference', pii: false },
      { name: 'address_line_1', type: 'VARCHAR(100)', description: 'First line of address', pii: false },
      { name: 'postcode', type: 'VARCHAR(8)', description: 'Postcode (standardised)', pii: false },
      { name: 'ward_code', type: 'VARCHAR(9)', description: 'ONS ward code', pii: false },
      { name: 'property_type', type: 'VARCHAR(30)', description: 'e.g. House, Flat, Bungalow, Maisonette', pii: false },
      { name: 'bedrooms', type: 'INT', description: 'Number of bedrooms (0-10)', pii: false },
      { name: 'void_status', type: 'VARCHAR(20)', description: 'Current void status: Occupied, Void, Under Repair', pii: false }
    ],
    policies: {
      retention: 'Permanent (asset record)',
      access: 'Housing team + Repairs + Asset Management + Data team',
      pii: 'No direct PII — but address data combined with other datasets could identify individuals'
    }
  },
  {
    id: 'social-care-referrals',
    name: 'Social Care Referrals',
    owner: 'Adult Social Care',
    classification: 'sensitive',
    description: 'Adult social care referrals and contacts. Contains sensitive personal data — strict access controls applied. Used for demand analysis and service planning.',
    quality: 91.3,
    freshness: 'Daily (04:00)',
    records: '28,430',
    lastUpdated: '2024-12-14',
    lineage: ['LiquidLogic LAS', 'SFTP Transfer', 'Bronze (PII-hashed)', 'Silver (splink matched)', 'Gold (demand_analysis)', 'Power BI (RLS)'],
    columns: [
      { name: 'referral_id', type: 'VARCHAR(12)', description: 'Unique referral reference', pii: false },
      { name: 'contact_date', type: 'DATE', description: 'Date of first contact', pii: false },
      { name: 'nhs_number_hash', type: 'VARCHAR(64)', description: 'SHA-256 hash of NHS number (never stored in plain text)', pii: true },
      { name: 'postcode_area', type: 'VARCHAR(4)', description: 'Truncated postcode (area only, e.g. NE8)', pii: false },
      { name: 'primary_support_reason', type: 'VARCHAR(50)', description: 'e.g. Physical Support, Mental Health, Learning Disability', pii: false },
      { name: 'person_cluster_id', type: 'VARCHAR(20)', description: 'Unique person ID from splink matching', pii: false },
      { name: 'outcome', type: 'VARCHAR(30)', description: 'Referral outcome: Service Provided, Signposted, NFA', pii: false }
    ],
    policies: {
      retention: '7 years (statutory retention for social care records)',
      access: 'ASC analysts only — Row-Level Security in Power BI, workspace-level in Fabric',
      pii: 'OFFICIAL-SENSITIVE classification. NHS numbers hashed. Postcodes truncated. No name or address data in the platform.'
    }
  },
  {
    id: 'housing-repairs',
    name: 'Housing Repairs',
    owner: 'Housing Repairs Service',
    classification: 'official',
    description: 'Repair requests, completions, and costs. High volume transactional data used for performance monitoring and contractor management.',
    quality: 93.1,
    freshness: 'Every 4 hours',
    records: '512,340',
    lastUpdated: '2024-12-15',
    lineage: ['NEC Housing API', 'Bronze (raw)', 'Silver (enriched + SLA calc)', 'Gold (repairs_performance)', 'Power BI'],
    columns: [
      { name: 'repair_id', type: 'VARCHAR(12)', description: 'Unique repair reference', pii: false },
      { name: 'property_ref', type: 'VARCHAR(12)', description: 'Property reference — links to Properties', pii: false },
      { name: 'reported_date', type: 'DATE', description: 'Date repair was reported', pii: false },
      { name: 'priority', type: 'VARCHAR(15)', description: 'Emergency, Urgent, Routine', pii: false },
      { name: 'repair_category', type: 'VARCHAR(30)', description: 'e.g. Plumbing, Electrical, Structural', pii: false },
      { name: 'turnaround_days', type: 'INT', description: 'Days from report to completion', pii: false },
      { name: 'sla_met', type: 'BOOLEAN', description: 'Whether the repair was completed within SLA', pii: false },
      { name: 'actual_cost', type: 'DECIMAL(10,2)', description: 'Actual cost of the repair in GBP', pii: false }
    ],
    policies: {
      retention: '6 years (financial audit requirement)',
      access: 'Housing team + Finance + Contractor managers',
      pii: 'No direct PII. Tenant names excluded from the analytics platform.'
    }
  },
  {
    id: 'waste-collection',
    name: 'Waste Collection',
    owner: 'Neighbourhood Services',
    classification: 'public',
    description: 'Bin collection schedules, missed collections, recycling rates by ward. Some of this data is published as open data.',
    quality: 96.8,
    freshness: 'Daily (05:00)',
    records: '89,240',
    lastUpdated: '2024-12-15',
    lineage: ['Waste Management System', 'Bronze (raw)', 'Silver (standardised)', 'Gold (recycling_analytics)', 'Power BI + Open Data Portal'],
    columns: [
      { name: 'collection_id', type: 'VARCHAR(12)', description: 'Unique collection reference', pii: false },
      { name: 'property_uprn', type: 'VARCHAR(12)', description: 'UPRN — unique property reference number', pii: false },
      { name: 'ward_code', type: 'VARCHAR(9)', description: 'ONS ward code', pii: false },
      { name: 'collection_type', type: 'VARCHAR(20)', description: 'Residual, Recycling, Garden, Bulky', pii: false },
      { name: 'scheduled_date', type: 'DATE', description: 'Scheduled collection date', pii: false },
      { name: 'collected', type: 'BOOLEAN', description: 'Whether collection was completed', pii: false }
    ],
    policies: {
      retention: '3 years (operational)',
      access: 'Neighbourhood Services + Data team + Public (aggregated)',
      pii: 'None — UPRN is not PII by itself'
    }
  },
  {
    id: 'ref-wards',
    name: 'Reference: Wards',
    owner: 'Data Team',
    classification: 'public',
    description: 'ONS ward reference data for Gateshead. Used as a lookup/dimension table across the platform. Updated after boundary reviews.',
    quality: 100.0,
    freshness: 'As needed (boundary reviews)',
    records: '22',
    lastUpdated: '2024-05-01',
    lineage: ['ONS Geography Portal', 'Manual upload', 'ref.wards'],
    columns: [
      { name: 'ward_code', type: 'VARCHAR(9)', description: 'ONS ward code (E05xxxxxx)', pii: false },
      { name: 'ward_name', type: 'VARCHAR(60)', description: 'Ward name', pii: false },
      { name: 'population', type: 'INT', description: 'Estimated population (Census 2021)', pii: false },
      { name: 'area_sq_km', type: 'DECIMAL(6,2)', description: 'Geographic area in km²', pii: false }
    ],
    policies: {
      retention: 'Permanent (reference data)',
      access: 'All users (public data)',
      pii: 'None'
    }
  }
];

let expandedCard = null;

export function initGovernance() {
  renderCatalog(DATASETS);
  setupSearch();
}

function setupSearch() {
  const input = document.getElementById('catalog-search-input');
  if (!input) return;

  input.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();

    if (!query) {
      renderCatalog(DATASETS);
      return;
    }

    const filtered = DATASETS.filter(d =>
      d.name.toLowerCase().includes(query) ||
      d.owner.toLowerCase().includes(query) ||
      d.description.toLowerCase().includes(query) ||
      d.classification.toLowerCase().includes(query) ||
      d.columns.some(c =>
        c.name.toLowerCase().includes(query) ||
        c.description.toLowerCase().includes(query)
      )
    );

    renderCatalog(filtered);
  });
}

function renderCatalog(datasets) {
  const grid = document.getElementById('catalog-grid');
  if (!grid) return;

  if (datasets.length === 0) {
    grid.innerHTML = `<p style="color: var(--text-muted); grid-column: 1 / -1; text-align: center; padding: 40px;">No datasets match your search.</p>`;
    return;
  }

  grid.innerHTML = datasets.map(d => `
    <div class="catalog-card" data-dataset-id="${d.id}">
      <div class="catalog-card-header">
        <div>
          <div class="catalog-card-title">${d.name}</div>
          <div class="catalog-card-owner">${d.owner}</div>
        </div>
        <span class="classification-badge ${d.classification}">${d.classification}</span>
      </div>
      <p style="font-size: 0.82rem; color: var(--text-secondary); line-height: 1.6;">${d.description}</p>
      <div class="catalog-card-meta">
        <div class="catalog-meta-item">Quality: <span style="color: ${d.quality >= 95 ? 'var(--success)' : d.quality >= 90 ? 'var(--warm)' : 'var(--danger)'};">${d.quality}%</span></div>
        <div class="catalog-meta-item">Refresh: <span>${d.freshness}</span></div>
        <div class="catalog-meta-item">Records: <span>${d.records}</span></div>
        <div class="catalog-meta-item">Updated: <span>${d.lastUpdated}</span></div>
      </div>

      <div class="catalog-expanded" id="expand-${d.id}">
        <!-- Lineage -->
        <h4 style="margin-bottom: 8px;">Data Lineage</h4>
        <div class="lineage-flow">
          ${d.lineage.map((node, i) =>
            `<span class="lineage-node">${node}</span>${i < d.lineage.length - 1 ? '<span class="lineage-arrow">→</span>' : ''}`
          ).join('')}
        </div>

        <!-- Data Dictionary -->
        <h4 style="margin: 16px 0 8px;">Data Dictionary</h4>
        <div style="overflow-x: auto;">
          <table class="data-dict-table">
            <thead>
              <tr>
                <th>Column</th>
                <th>Type</th>
                <th>Description</th>
                <th>PII</th>
              </tr>
            </thead>
            <tbody>
              ${d.columns.map(col => `
                <tr>
                  <td><code>${col.name}</code></td>
                  <td style="font-size: 0.75rem; color: var(--text-muted);">${col.type}</td>
                  <td>${col.description}</td>
                  <td>${col.pii ? '<span class="badge badge-warn">Yes</span>' : '<span style="color: var(--text-muted);">—</span>'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <!-- Governance Policies -->
        <h4 style="margin: 16px 0 8px;">Governance Policies</h4>
        <div style="display: grid; gap: 10px; font-size: 0.82rem;">
          <div>
            <strong style="color: var(--text-primary);">Retention:</strong>
            <span style="color: var(--text-secondary);"> ${d.policies.retention}</span>
          </div>
          <div>
            <strong style="color: var(--text-primary);">Access Control:</strong>
            <span style="color: var(--text-secondary);"> ${d.policies.access}</span>
          </div>
          <div>
            <strong style="color: var(--text-primary);">PII Handling:</strong>
            <span style="color: var(--text-secondary);"> ${d.policies.pii}</span>
          </div>
        </div>
      </div>
    </div>
  `).join('');

  // click handlers to expand/collapse
  grid.querySelectorAll('.catalog-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.datasetId;
      const expanded = document.getElementById(`expand-${id}`);
      if (!expanded) return;

      // collapse any other expanded card
      if (expandedCard && expandedCard !== id) {
        const prev = document.getElementById(`expand-${expandedCard}`);
        if (prev) prev.classList.remove('visible');
      }

      expanded.classList.toggle('visible');
      expandedCard = expanded.classList.contains('visible') ? id : null;
    });
  });
}
