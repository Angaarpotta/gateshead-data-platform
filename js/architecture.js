/* ============================================================
   Architecture.js — interactive Fabric platform diagram
   Layered view: Sources → Ingestion → Storage → Processing → Serving → Consumption
   Gateshead Data Platform Portfolio
   ============================================================ */

const ARCHITECTURE_LAYERS = [
  {
    label: 'Data Sources',
    description: 'Line-of-business applications and external data feeds',
    nodes: [
      {
        id: 'src-revenues',
        icon: '💰',
        name: 'Revenues & Benefits',
        tech: 'Northgate',
        detail: {
          description: 'Council tax, business rates, housing benefit, and council tax support. This is one of the most complex source systems — heavily normalised relational schema with 200+ tables.',
          integration: 'ODBC via on-premises data gateway',
          volume: '~500K records, daily incremental',
          format: 'SQL Server tables',
          notes: 'We considered the vendor API but it only exposes a subset of the data we need. ODBC gives us full access to the underlying views.'
        }
      },
      {
        id: 'src-housing',
        icon: '🏠',
        name: 'Housing',
        tech: 'NEC Housing',
        detail: {
          description: 'Property stock, tenancies, repairs, and voids. The repairs data alone generates 3,000+ records per day.',
          integration: 'ODBC via gateway + REST API (for repairs)',
          volume: '~42K properties, repairs: ~3.2K/day',
          format: 'SQL Server + JSON (API)',
          notes: 'We use the API for real-time repair updates and ODBC for the nightly full sync. The API occasionally drops fields — hence the schema validation step in bronze.'
        }
      },
      {
        id: 'src-social',
        icon: '🤝',
        name: 'Social Care',
        tech: 'LiquidLogic',
        detail: {
          description: 'Adult and children\'s social care referrals, assessments, and care plans. Highly sensitive data with strict access controls.',
          integration: 'Secure file transfer (SFTP) + database views',
          volume: '~28K referrals/year',
          format: 'CSV (SFTP) + SQL Server',
          notes: 'PII is hashed at source before it enters the platform. We use column-level security in Fabric to restrict access to authorised analysts only.'
        }
      },
      {
        id: 'src-external',
        icon: '🌐',
        name: 'External / Open Data',
        tech: 'ONS, NOMIS, IMD',
        detail: {
          description: 'Census data, indices of multiple deprivation, population estimates, and other publicly available datasets. Used for benchmarking and contextual analysis.',
          integration: 'REST APIs + manual CSV uploads',
          volume: 'Varies — mostly annual refreshes',
          format: 'CSV, JSON, GeoJSON',
          notes: 'The IMD data is published every 4-5 years so it\'s relatively static. We have a scheduled check for new ONS releases.'
        }
      }
    ]
  },
  {
    label: 'Ingestion',
    description: 'Data movement into OneLake',
    nodes: [
      {
        id: 'ing-dataflow',
        icon: '🔄',
        name: 'Dataflow Gen2',
        tech: 'Power Query Online',
        detail: {
          description: 'Low-code data ingestion for simpler sources. We use Dataflow Gen2 for flat file imports and basic transformations where a full notebook would be overkill.',
          integration: 'Fabric workspace: Corp_Data_Ingestion',
          volume: 'Handles ~15 data sources',
          format: 'M (Power Query)',
          notes: 'Dataflows are great for enabling analysts to build their own ingestion without needing to write PySpark. We maintain templates they can clone.'
        }
      },
      {
        id: 'ing-pipeline',
        icon: '⚙️',
        name: 'Data Pipelines',
        tech: 'Fabric Pipelines',
        detail: {
          description: 'Orchestration layer — schedules and sequences the ingestion activities, handles dependencies and error recovery.',
          integration: 'Fabric workspace: Corp_Data_Orchestration',
          volume: '23 pipelines, 87 activities',
          format: 'JSON (pipeline definitions)',
          notes: 'We follow a naming convention: PL_{source}_{frequency}_{target_layer}. Error alerts go to a Teams channel via webhook.'
        }
      },
      {
        id: 'ing-gateway',
        icon: '🔒',
        name: 'On-Prem Gateway',
        tech: 'Data Gateway (Standard)',
        detail: {
          description: 'Secure bridge between on-premises data sources and the cloud platform. Runs on a dedicated VM in the council\'s data centre.',
          integration: 'Azure Virtual Network peering',
          volume: 'Throughput: ~50 GB/day',
          format: 'Encrypted tunnel',
          notes: 'We run two gateway nodes for redundancy. After the first one went down on a Friday evening and we lost the weekend batch, we learned that lesson quickly.'
        }
      }
    ]
  },
  {
    label: 'Storage',
    description: 'OneLake — medallion architecture',
    nodes: [
      {
        id: 'store-bronze',
        icon: '🥉',
        name: 'Bronze',
        tech: 'Lakehouse (raw)',
        detail: {
          description: 'Raw data landing zone. Append-only, no business logic. Every record gets audit columns (_ingested_at, _source_system, _batch_id).',
          integration: 'Lakehouse: LH_Bronze',
          volume: '~180 GB across 34 Delta tables',
          format: 'Delta / Parquet',
          notes: 'Bronze is our safety net — if anything goes wrong downstream, we can always rebuild from here. We keep 90 days of history using Delta time travel.'
        }
      },
      {
        id: 'store-silver',
        icon: '🥈',
        name: 'Silver',
        tech: 'Lakehouse (cleansed)',
        detail: {
          description: 'Cleansed, deduplicated, conformed data. This is where business rules get applied — standardising postcodes, resolving duplicates, enriching with reference data.',
          integration: 'Lakehouse: LH_Silver',
          volume: '~120 GB across 28 Delta tables',
          format: 'Delta / Parquet',
          notes: 'Silver tables are the "single version of truth" for each entity. We run DQ checks after every refresh and block downstream processing if quality drops below threshold.'
        }
      },
      {
        id: 'store-gold',
        icon: '🥇',
        name: 'Gold',
        tech: 'Lakehouse (curated)',
        detail: {
          description: 'Business-ready datasets — aggregated, modelled for consumption. Star schemas for Power BI, flat tables for Python analytics.',
          integration: 'Lakehouse: LH_Gold',
          volume: '~45 GB across 16 Delta tables + views',
          format: 'Delta / Parquet + SQL views',
          notes: 'Gold is consumption-ready. We maintain both dimensional models (for BI) and denormalised flat tables (for data science). The views abstract away the physical storage.'
        }
      }
    ]
  },
  {
    label: 'Processing',
    description: 'Transformation and analytics',
    nodes: [
      {
        id: 'proc-notebooks',
        icon: '📓',
        name: 'Notebooks',
        tech: 'PySpark / SQL',
        detail: {
          description: 'Fabric notebooks for complex transformations — SCD Type 2 merges, splink record linkage, statistical models. Our main transformation engine.',
          integration: 'Fabric workspace: Corp_Data_Transform',
          volume: '18 notebooks across the pipeline',
          format: 'PySpark, Spark SQL',
          notes: 'We version control notebooks in Git (Azure DevOps). Each notebook follows a template: parameters → read → transform → validate → write → log.'
        }
      },
      {
        id: 'proc-dbt',
        icon: '🔧',
        name: 'dbt',
        tech: 'dbt-fabric adapter',
        detail: {
          description: 'We\'re piloting dbt for the silver→gold transformation layer. It brings version-controlled SQL models with built-in testing and documentation.',
          integration: 'dbt Cloud connected to Fabric SQL endpoint',
          volume: '12 models (staging + marts)',
          format: 'SQL (Jinja-templated)',
          notes: 'Still early days with dbt in Fabric — the adapter is maturing. Main benefit is the built-in testing and the generated documentation site for the team.'
        }
      },
      {
        id: 'proc-stored',
        icon: '📦',
        name: 'Stored Procedures',
        tech: 'T-SQL',
        detail: {
          description: 'Legacy stored procedures migrated from the on-premises data warehouse. Gradually being refactored into notebooks/dbt models.',
          integration: 'SQL Analytics Endpoint',
          volume: '7 remaining (from original 30+)',
          format: 'T-SQL',
          notes: 'We\'re migrating these at a pace that doesn\'t disrupt existing reports. About 75% done — the remaining ones have complex business logic that needs careful validation.'
        }
      }
    ]
  },
  {
    label: 'Serving',
    description: 'Analytics-ready endpoints',
    nodes: [
      {
        id: 'serve-sql',
        icon: '🔌',
        name: 'SQL Endpoint',
        tech: 'Fabric SQL Analytics',
        detail: {
          description: 'Auto-generated SQL endpoint for each lakehouse. Enables T-SQL queries against Delta tables — used by Power BI, SSMS, and ad-hoc analysts.',
          integration: 'Auto-provisioned per lakehouse',
          volume: 'All Gold layer tables exposed',
          format: 'T-SQL compatible',
          notes: 'The auto-generated endpoint is read-only, which is a feature not a limitation — prevents accidental writes from report tools.'
        }
      },
      {
        id: 'serve-semantic',
        icon: '🧊',
        name: 'Semantic Model',
        tech: 'Power BI Dataset',
        detail: {
          description: 'Shared semantic models that define the business logic layer — measures, calculated columns, row-level security, and relationships.',
          integration: 'Fabric workspace: Corp_Analytics_Prod',
          volume: '4 semantic models (Corporate, Housing, Social Care, Finance)',
          format: 'TMDL / XMLA',
          notes: 'We use shared semantic models so every report uses the same definitions. No more "your number doesn\'t match my number" conversations.'
        }
      }
    ]
  },
  {
    label: 'Consumption',
    description: 'How the organisation uses the data',
    nodes: [
      {
        id: 'con-pbi',
        icon: '📊',
        name: 'Power BI',
        tech: 'Reports & Dashboards',
        detail: {
          description: 'The primary consumption tool. 40+ reports across the organisation covering revenues, housing, social care, waste, and corporate KPIs.',
          integration: 'Power BI Service (Fabric workspace)',
          volume: '~450 weekly active users',
          format: 'PBIX / PBIT',
          notes: 'We run a monthly "report clinic" where teams can bring questions and we help them build self-service reports. Adoption has grown 3x in the last year.'
        }
      },
      {
        id: 'con-copilot',
        icon: '🤖',
        name: 'Copilot',
        tech: 'M365 Copilot',
        detail: {
          description: 'Natural language queries against the semantic models. Still in pilot but showing promise for enabling non-technical staff to access data.',
          integration: 'M365 Copilot + Power BI integration',
          volume: 'Pilot: 15 users',
          format: 'Natural language → DAX',
          notes: 'Early results are mixed — works well for simple questions, struggles with cross-domain queries. We\'re working with Microsoft on improving the grounding.'
        }
      },
      {
        id: 'con-api',
        icon: '🔗',
        name: 'APIs',
        tech: 'REST / GraphQL',
        detail: {
          description: 'Data APIs for downstream system integration — feeding data back to operational systems and partner organisations.',
          integration: 'Azure API Management + Function Apps',
          volume: '~12K API calls/day',
          format: 'JSON (REST)',
          notes: 'The API layer lets us share data with partner organisations (NHS, DWP) in a controlled way without giving direct database access.'
        }
      }
    ]
  }
];

let activeNode = null;

export function initArchitecture() {
  renderDiagram();
}

function renderDiagram() {
  const container = document.getElementById('arch-diagram');
  if (!container) return;

  let html = '';

  ARCHITECTURE_LAYERS.forEach((layer, layerIdx) => {
    // layer with nodes
    html += `
      <div class="arch-layer" data-layer="${layerIdx}">
        <div class="arch-layer-label">${layer.label}</div>
        ${layer.nodes.map(node => `
          <div class="arch-node" data-node-id="${node.id}" title="${node.tech}">
            <div class="node-icon">${node.icon}</div>
            <div class="node-name">${node.name}</div>
            <div class="node-tech">${node.tech}</div>
          </div>
        `).join('')}
      </div>
    `;

    // connector row between layers (except after last)
    if (layerIdx < ARCHITECTURE_LAYERS.length - 1) {
      html += `
        <div class="arch-connector-row">
          <div class="arch-connector-down"></div>
        </div>
      `;
    }
  });

  container.innerHTML = html;

  // click handlers for nodes
  container.querySelectorAll('.arch-node').forEach(nodeEl => {
    nodeEl.addEventListener('click', () => {
      const nodeId = nodeEl.dataset.nodeId;
      const node = findNode(nodeId);
      if (node) {
        showNodeDetail(node, nodeEl);
      }
    });
  });
}

function findNode(nodeId) {
  for (const layer of ARCHITECTURE_LAYERS) {
    const node = layer.nodes.find(n => n.id === nodeId);
    if (node) return node;
  }
  return null;
}

function showNodeDetail(node, nodeEl) {
  const detail = document.getElementById('arch-detail');
  if (!detail) return;

  // toggle active state
  document.querySelectorAll('.arch-node').forEach(n => n.classList.remove('active'));
  nodeEl.classList.add('active');

  detail.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div>
          <h3>${node.icon} ${node.name}</h3>
          <span style="font-size: 0.78rem; color: var(--text-muted);">${node.tech}</span>
        </div>
        <button class="btn btn-sm btn-outline" onclick="this.closest('.card').parentElement.classList.remove('visible'); document.querySelectorAll('.arch-node').forEach(n => n.classList.remove('active'));">✕ Close</button>
      </div>
      <p style="color: var(--text-secondary); margin-bottom: 16px; line-height: 1.7;">${node.detail.description}</p>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
        <div>
          <h4 style="margin-bottom: 6px;">Integration</h4>
          <p style="font-size: 0.82rem; color: var(--text-secondary);">${node.detail.integration}</p>
        </div>
        <div>
          <h4 style="margin-bottom: 6px;">Volume</h4>
          <p style="font-size: 0.82rem; color: var(--text-secondary);">${node.detail.volume}</p>
        </div>
        <div>
          <h4 style="margin-bottom: 6px;">Format</h4>
          <p style="font-size: 0.82rem; color: var(--text-secondary);">${node.detail.format}</p>
        </div>
      </div>

      <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
        <h4 style="margin-bottom: 6px;">Design Notes</h4>
        <p style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.7; font-style: italic;">"${node.detail.notes}"</p>
      </div>
    </div>
  `;

  detail.classList.add('visible');

  // scroll to the detail panel
  detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
