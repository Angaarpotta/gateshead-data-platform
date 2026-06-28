/* ============================================================
   Pipeline.js — interactive ETL pipeline visualisation
   Shows medallion architecture: Source → Bronze → Silver → Gold → Serve
   Gateshead Data Platform Portfolio
   ============================================================ */

const PIPELINES = {
  'council-tax': {
    name: 'Council Tax',
    description: 'Ingests council tax accounts from the Revenues system, deduplicates residents, and serves a single view of liability for analytics.',
    stages: [
      {
        id: 'source',
        icon: '🗄️',
        name: 'Source System',
        tech: 'Northgate Revenues',
        code: `-- Extract via linked server / ODBC connection
-- Runs daily at 02:00 via Fabric Pipeline activity

SELECT
    ct.account_ref,
    ct.property_ref,
    ct.liable_name,
    ct.liable_start,
    ct.band,
    ct.annual_charge,
    ct.balance_outstanding,
    p.address_line_1,
    p.postcode,
    p.ward_code
FROM council_tax_accounts ct
INNER JOIN properties p
    ON ct.property_ref = p.property_ref
WHERE ct.year = YEAR(GETDATE())`,
        lang: 'sql',
        annotation: "Pulling from the council's Northgate Revenues system. We use an ODBC connection rather than a direct API because the vendor's REST endpoints are... limited.",
        metrics: { rowsIn: '142,847', rowsOut: '142,847', freshness: '< 6 hours' }
      },
      {
        id: 'bronze',
        icon: '🥉',
        name: 'Bronze Layer',
        tech: 'Lakehouse (raw)',
        code: `# Bronze notebook — minimal transformation, just land it safely
# Using Delta format for ACID compliance and time travel

from pyspark.sql import functions as F

df_raw = spark.read.format("jdbc") \\
    .option("url", jdbc_url) \\
    .option("dbtable", "dbo.vw_council_tax_extract") \\
    .load()

# Add audit columns — we always want to know when data landed
df_bronze = df_raw \\
    .withColumn("_ingested_at", F.current_timestamp()) \\
    .withColumn("_source_system", F.lit("northgate_revenues")) \\
    .withColumn("_batch_id", F.lit(batch_id))

df_bronze.write \\
    .format("delta") \\
    .mode("append") \\
    .saveAsTable("bronze.council_tax_raw")

print(f"Landed {df_bronze.count()} rows into bronze")`,
        lang: 'python',
        annotation: "Bronze is append-only, no business logic. We add audit columns so we can trace exactly when each record arrived and from where.",
        metrics: { rowsIn: '142,847', rowsOut: '142,847', freshness: '< 6 hours' }
      },
      {
        id: 'silver',
        icon: '🥈',
        name: 'Silver Layer',
        tech: 'Lakehouse (cleansed)',
        code: `# Silver notebook — cleanse, deduplicate, standardise
# This is where the heavy lifting happens

from pyspark.sql import functions as F
from pyspark.sql.window import Window

df_bronze = spark.read.table("bronze.council_tax_raw")

# Standardise postcodes — some come through without spaces
df_clean = df_bronze \\
    .withColumn("postcode_clean",
        F.upper(F.regexp_replace(F.col("postcode"), "\\\\s+", ""))) \\
    .withColumn("postcode_formatted",
        F.concat(
            F.substring(F.col("postcode_clean"), 1,
                F.length(F.col("postcode_clean")) - 3),
            F.lit(" "),
            F.substring(F.col("postcode_clean"), -3, 3)
        ))

# Deduplicate — take the most recent record per account
window = Window.partitionBy("account_ref") \\
    .orderBy(F.col("_ingested_at").desc())

df_deduped = df_clean \\
    .withColumn("_row_num", F.row_number().over(window)) \\
    .filter(F.col("_row_num") == 1) \\
    .drop("_row_num")

# Merge into silver using Delta MERGE (upsert)
from delta.tables import DeltaTable

if spark.catalog.tableExists("silver.council_tax"):
    dt = DeltaTable.forName(spark, "silver.council_tax")
    dt.alias("target").merge(
        df_deduped.alias("source"),
        "target.account_ref = source.account_ref"
    ).whenMatchedUpdateAll() \\
     .whenNotMatchedInsertAll() \\
     .execute()
else:
    df_deduped.write.format("delta") \\
        .saveAsTable("silver.council_tax")`,
        lang: 'python',
        annotation: "The merge pattern is crucial — we can't just overwrite because downstream reports need consistent historical data. Delta's MERGE gives us proper upsert semantics.",
        metrics: { rowsIn: '142,847', rowsOut: '138,294', freshness: '< 8 hours' }
      },
      {
        id: 'gold',
        icon: '🥇',
        name: 'Gold Layer',
        tech: 'Lakehouse (curated)',
        code: `-- Gold layer — business-ready aggregations
-- This view powers the council tax collection dashboard

CREATE OR ALTER VIEW gold.vw_council_tax_summary AS
WITH collection_rates AS (
    SELECT
        ward_code,
        band,
        COUNT(*) AS total_accounts,
        SUM(annual_charge) AS total_liability,
        SUM(balance_outstanding) AS total_outstanding,
        SUM(CASE
            WHEN balance_outstanding <= 0 THEN 1
            ELSE 0
        END) AS accounts_paid_up,
        AVG(DATEDIFF(DAY, liable_start, GETDATE()))
            AS avg_days_since_start
    FROM silver.council_tax
    GROUP BY ward_code, band
)
SELECT
    cr.*,
    w.ward_name,
    ROUND(
        cr.accounts_paid_up * 100.0 / cr.total_accounts, 1
    ) AS collection_rate_pct,
    cr.total_liability - cr.total_outstanding
        AS total_collected
FROM collection_rates cr
LEFT JOIN ref.wards w ON cr.ward_code = w.ward_code;`,
        lang: 'sql',
        annotation: "Gold is consumption-ready. This particular view feeds the collection rate KPI that the revenues team tracks weekly. I use CTEs rather than subqueries — easier for non-technical stakeholders to follow the logic.",
        metrics: { rowsIn: '138,294', rowsOut: '176', freshness: '< 8 hours' }
      },
      {
        id: 'serve',
        icon: '📊',
        name: 'Power BI',
        tech: 'Semantic Model',
        code: `// DAX measure — YoY collection rate comparison
// Used in the executive summary dashboard

Collection Rate YoY Change =
VAR CurrentRate =
    DIVIDE(
        [Total Collected],
        [Total Liability],
        0
    )
VAR PriorYearRate =
    CALCULATE(
        DIVIDE(
            [Total Collected],
            [Total Liability],
            0
        ),
        DATEADD('Date'[Date], -1, YEAR)
    )
RETURN
    CurrentRate - PriorYearRate`,
        lang: 'javascript',
        annotation: "DAX can be a bit opaque, but this measure is straightforward — comparing this year's collection rate against last year's. The DATEADD pattern is the standard way to do YoY in Power BI.",
        metrics: { rowsIn: '176', rowsOut: '—', freshness: 'Real-time (DirectQuery)' }
      }
    ]
  },
  'housing-repairs': {
    name: 'Housing Repairs',
    description: 'Tracks repair requests from the Housing system, links to property data, and surfaces turnaround times and backlog trends.',
    stages: [
      {
        id: 'source',
        icon: '🗄️',
        name: 'Source System',
        tech: 'NEC Housing',
        code: `-- Housing repairs extract
-- Incremental load based on last modified date

SELECT
    r.repair_id,
    r.property_ref,
    r.reported_date,
    r.target_date,
    r.completed_date,
    r.repair_category,
    r.priority,
    r.contractor,
    r.cost_estimate,
    r.actual_cost,
    r.status
FROM housing_repairs r
WHERE r.last_modified >= @lastWatermark`,
        lang: 'sql',
        annotation: "Incremental extraction using a watermark pattern — much more efficient than full loads for a table with 500k+ historical records.",
        metrics: { rowsIn: '~3,200/day', rowsOut: '~3,200/day', freshness: '< 4 hours' }
      },
      {
        id: 'bronze',
        icon: '🥉',
        name: 'Bronze Layer',
        tech: 'Lakehouse (raw)',
        code: `# Incremental ingestion into bronze
# Watermark tracked in a control table

last_watermark = spark.sql("""
    SELECT MAX(watermark_value)
    FROM control.pipeline_watermarks
    WHERE pipeline_name = 'housing_repairs'
""").collect()[0][0]

df_new = spark.read.format("jdbc") \\
    .option("url", jdbc_url) \\
    .option("query", f"""
        SELECT * FROM housing_repairs
        WHERE last_modified >= '{last_watermark}'
    """) \\
    .load()

df_new.write.format("delta") \\
    .mode("append") \\
    .saveAsTable("bronze.housing_repairs_raw")

# Update watermark
spark.sql(f"""
    UPDATE control.pipeline_watermarks
    SET watermark_value = current_timestamp()
    WHERE pipeline_name = 'housing_repairs'
""")`,
        lang: 'python',
        annotation: "The watermark pattern keeps incremental loads efficient. We track it in a control table so we can restart from the last successful point if something fails.",
        metrics: { rowsIn: '~3,200/day', rowsOut: '~3,200/day', freshness: '< 4 hours' }
      },
      {
        id: 'silver',
        icon: '🥈',
        name: 'Silver Layer',
        tech: 'Lakehouse (cleansed)',
        code: `# Silver — enrich with property data, calculate SLAs

df_repairs = spark.read.table("bronze.housing_repairs_raw")
df_properties = spark.read.table("silver.properties")

df_enriched = df_repairs \\
    .join(df_properties, "property_ref", "left") \\
    .withColumn("sla_days",
        F.when(F.col("priority") == "Emergency", 1)
         .when(F.col("priority") == "Urgent", 5)
         .when(F.col("priority") == "Routine", 28)
         .otherwise(28)
    ) \\
    .withColumn("turnaround_days",
        F.datediff(
            F.coalesce(F.col("completed_date"),
                       F.current_date()),
            F.col("reported_date")
        )
    ) \\
    .withColumn("sla_met",
        F.col("turnaround_days") <= F.col("sla_days")
    )`,
        lang: 'python',
        annotation: "Enrichment joins and SLA calculations happen here. The coalesce on completed_date handles open repairs — we use current_date as a proxy to show live ageing.",
        metrics: { rowsIn: '512,340', rowsOut: '508,119', freshness: '< 6 hours' }
      },
      {
        id: 'gold',
        icon: '🥇',
        name: 'Gold Layer',
        tech: 'Lakehouse (curated)',
        code: `CREATE VIEW gold.vw_repairs_performance AS
SELECT
    ward_name,
    repair_category,
    priority,
    COUNT(*) AS total_repairs,
    AVG(turnaround_days) AS avg_turnaround,
    SUM(CASE WHEN sla_met THEN 1 ELSE 0 END)
        * 100.0 / COUNT(*) AS sla_compliance_pct,
    SUM(actual_cost) AS total_cost,
    COUNT(CASE WHEN status = 'Open' THEN 1 END)
        AS open_backlog
FROM silver.housing_repairs
GROUP BY ward_name, repair_category, priority;`,
        lang: 'sql',
        annotation: "Performance aggregations by ward, category and priority. The housing team uses this to identify which areas have the worst backlogs.",
        metrics: { rowsIn: '508,119', rowsOut: '342', freshness: '< 6 hours' }
      },
      {
        id: 'serve',
        icon: '📊',
        name: 'Power BI',
        tech: 'Semantic Model',
        code: `// DAX — rolling 30-day SLA compliance trend

SLA Compliance (30d Rolling) =
VAR Last30Days =
    DATESINPERIOD(
        'Calendar'[Date],
        MAX('Calendar'[Date]),
        -30,
        DAY
    )
RETURN
    CALCULATE(
        DIVIDE(
            COUNTROWS(
                FILTER('Repairs', 'Repairs'[SLA Met])
            ),
            COUNTROWS('Repairs'),
            0
        ),
        Last30Days
    )`,
        lang: 'javascript',
        annotation: "A rolling window measure lets the housing team spot deteriorating performance before it becomes a complaint trend.",
        metrics: { rowsIn: '342', rowsOut: '—', freshness: 'Daily refresh' }
      }
    ]
  },
  'social-care': {
    name: 'Social Care Referrals',
    description: 'Processes adult social care referrals, applies splink record matching to identify repeat contacts, and feeds the demand forecasting model.',
    stages: [
      {
        id: 'source',
        icon: '🗄️',
        name: 'Source System',
        tech: 'LiquidLogic LAS',
        code: `-- Social care referrals extract
-- Sensitive data — column-level security applied

SELECT
    r.referral_id,
    r.contact_date,
    r.referral_source,
    r.primary_support_reason,
    r.age_band,
    r.gender,
    -- PII fields masked at source for bronze
    HASHBYTES('SHA2_256', r.nhs_number)
        AS nhs_number_hash,
    LEFT(r.postcode, 4) AS postcode_area,
    r.ward_code,
    r.outcome,
    r.assessment_date,
    r.service_start_date
FROM social_care_referrals r
WHERE r.referral_date >= DATEADD(YEAR, -3, GETDATE())`,
        lang: 'sql',
        annotation: "Social care data is OFFICIAL-SENSITIVE. We hash NHS numbers at extraction and truncate postcodes to area level — PII never lands in raw form in the lakehouse.",
        metrics: { rowsIn: '28,430', rowsOut: '28,430', freshness: '< 12 hours' }
      },
      {
        id: 'bronze',
        icon: '🥉',
        name: 'Bronze Layer',
        tech: 'Lakehouse (raw)',
        code: `# Bronze — land with encryption at rest
# Fabric workspace has sensitivity labels applied

df_referrals = spark.read.format("jdbc") \\
    .option("url", jdbc_url) \\
    .option("query", referral_query) \\
    .load()

# Tag with data classification
df_tagged = df_referrals \\
    .withColumn("_data_classification",
                F.lit("OFFICIAL-SENSITIVE")) \\
    .withColumn("_retention_years", F.lit(7)) \\
    .withColumn("_ingested_at", F.current_timestamp())

df_tagged.write.format("delta") \\
    .mode("append") \\
    .option("mergeSchema", "true") \\
    .saveAsTable("bronze.social_care_referrals")`,
        lang: 'python',
        annotation: "We tag classification and retention metadata at the bronze level. The retention_years column drives our automated purge pipeline (GDPR compliance).",
        metrics: { rowsIn: '28,430', rowsOut: '28,430', freshness: '< 12 hours' }
      },
      {
        id: 'silver',
        icon: '🥈',
        name: 'Silver Layer',
        tech: 'splink (record linkage)',
        code: `# Silver — deduplicate people using splink
# Probabilistic record matching across referrals

import splink.comparison_library as cl
from splink import Linker, SettingsCreator, DuckDBAPI

db_api = DuckDBAPI()

settings = SettingsCreator(
    link_type="dedupe_only",
    comparisons=[
        cl.JaroWinklerAtThresholds("nhs_number_hash",
            [0.95, 0.88]),
        cl.LevenshteinAtThresholds("postcode_area",
            [1, 2]),
        cl.ExactMatch("age_band"),
        cl.ExactMatch("gender"),
    ],
    blocking_rules_to_generate_predictions=[
        block_on("postcode_area"),
        block_on("age_band", "gender"),
    ],
    max_iterations=10,
    em_convergence=0.001
)

linker = Linker(df_referrals, settings, db_api)
linker.estimate_u_using_random_sampling(max_pairs=1e6)

# Predict matches
df_predictions = linker.predict(
    threshold_match_probability=0.85
)

# Cluster into unique individuals
df_clusters = linker.cluster_pairwise_predictions_at_threshold(
    df_predictions, threshold_match_probability=0.90
)`,
        lang: 'python',
        annotation: "This is one of the more interesting pieces — using splink to probabilistically match people across referrals without relying on a single identifier. Helps us understand repeat contacts and demand patterns.",
        metrics: { rowsIn: '28,430', rowsOut: '21,870', freshness: '< 24 hours' }
      },
      {
        id: 'gold',
        icon: '🥇',
        name: 'Gold Layer',
        tech: 'Lakehouse (curated)',
        code: `-- Gold — demand analysis aggregations
-- Feeds the forecasting model and the ASC dashboard

CREATE VIEW gold.vw_social_care_demand AS
SELECT
    DATE_TRUNC('month', contact_date) AS month,
    ward_name,
    primary_support_reason,
    COUNT(DISTINCT person_cluster_id) AS unique_people,
    COUNT(*) AS total_referrals,
    ROUND(
        COUNT(*) * 1.0 /
        COUNT(DISTINCT person_cluster_id), 2
    ) AS avg_referrals_per_person,
    AVG(DATEDIFF(DAY, contact_date,
        COALESCE(assessment_date, CURRENT_DATE)))
        AS avg_days_to_assessment,
    COUNT(CASE WHEN outcome = 'Service Provided'
        THEN 1 END) * 100.0 / COUNT(*)
        AS conversion_rate_pct
FROM silver.social_care_referrals_matched
GROUP BY 1, 2, 3;`,
        lang: 'sql',
        annotation: "The person_cluster_id from splink lets us count unique people rather than just referrals — a much more honest metric for demand planning.",
        metrics: { rowsIn: '21,870', rowsOut: '289', freshness: '< 24 hours' }
      },
      {
        id: 'serve',
        icon: '📊',
        name: 'Power BI',
        tech: 'Semantic Model',
        code: `// DAX — demand forecast using linear regression
// Simple but effective for 3-month horizon

Forecast Next Quarter =
VAR HistoricalData =
    SELECTCOLUMNS(
        FILTER(
            ALL('Calendar'[MonthYear]),
            'Calendar'[Date] >= DATE(2023,1,1)
        ),
        "MonthNum", 'Calendar'[MonthNumber],
        "Referrals", [Total Unique People]
    )
VAR Slope = LINESTX(HistoricalData,
    [Referrals], [MonthNum])
VAR Intercept = LINESTX(HistoricalData,
    [Referrals], [MonthNum], , , 2)
VAR NextMonth = MAX('Calendar'[MonthNumber]) + 3
RETURN
    ROUND(Intercept + Slope * NextMonth, 0)`,
        lang: 'javascript',
        annotation: "A basic linear forecast — good enough for quarterly planning. For anything more sophisticated we'd drop into Python and use Prophet or similar.",
        metrics: { rowsIn: '289', rowsOut: '—', freshness: 'Daily refresh' }
      }
    ]
  }
};

let currentPipeline = 'council-tax';
let activeStage = null;

export function initPipeline() {
  renderPipelineTabs();
  renderPipeline(currentPipeline);

  // hook up tab clicks
  document.getElementById('pipeline-tabs')?.addEventListener('click', (e) => {
    const tab = e.target.closest('.pipeline-tab');
    if (!tab) return;
    const pipelineId = tab.dataset.pipeline;
    if (pipelineId && pipelineId !== currentPipeline) {
      currentPipeline = pipelineId;
      document.querySelectorAll('.pipeline-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderPipeline(pipelineId);
    }
  });
}

function renderPipelineTabs() {
  const container = document.getElementById('pipeline-tabs');
  if (!container) return;

  container.innerHTML = Object.entries(PIPELINES).map(([id, p]) =>
    `<button class="pipeline-tab ${id === currentPipeline ? 'active' : ''}" data-pipeline="${id}">${p.name}</button>`
  ).join('');
}

function renderPipeline(pipelineId) {
  const pipeline = PIPELINES[pipelineId];
  const canvas = document.getElementById('pipeline-canvas');
  const detail = document.getElementById('pipeline-detail');
  if (!canvas || !pipeline) return;

  activeStage = null;
  detail.classList.remove('visible');
  detail.innerHTML = '';

  // build stage elements interleaved with connectors
  let html = '';
  pipeline.stages.forEach((stage, i) => {
    html += `
      <div class="pipeline-stage" data-stage-idx="${i}">
        <div class="stage-icon">${stage.icon}</div>
        <div class="stage-name">${stage.name}</div>
        <div class="stage-tech">${stage.tech}</div>
      </div>`;
    if (i < pipeline.stages.length - 1) {
      html += `<div class="pipeline-connector"></div>`;
    }
  });

  canvas.innerHTML = html;

  // description
  const descEl = document.getElementById('pipeline-description');
  if (descEl) descEl.textContent = pipeline.description;

  // click handlers
  canvas.querySelectorAll('.pipeline-stage').forEach(stageEl => {
    stageEl.addEventListener('click', () => {
      const idx = parseInt(stageEl.dataset.stageIdx);
      showStageDetail(pipeline.stages[idx], stageEl, canvas);
    });
  });
}

function showStageDetail(stage, stageEl, canvas) {
  const detail = document.getElementById('pipeline-detail');

  // toggle active stage visuals
  canvas.querySelectorAll('.pipeline-stage').forEach(s => s.classList.remove('active'));
  stageEl.classList.add('active');

  // figure out the language display name
  const langLabels = { sql: 'SQL', python: 'PySpark', javascript: 'DAX' };
  const langLabel = langLabels[stage.lang] || stage.lang;

  detail.innerHTML = `
    <div class="card">
      <div class="pipeline-detail-grid">
        <div>
          <h4>${langLabel} — ${stage.name}</h4>
          <p class="code-annotation">${stage.annotation}</p>
          <div class="code-display">
            <pre><code class="language-${stage.lang}">${escapeHtml(stage.code)}</code></pre>
          </div>
        </div>
        <div>
          <h4>Stage Metrics</h4>
          <div class="pipeline-metrics">
            <div class="pipeline-metric">
              <div class="metric-value">${stage.metrics.rowsIn}</div>
              <div class="metric-label">Rows In</div>
            </div>
            <div class="pipeline-metric">
              <div class="metric-value">${stage.metrics.rowsOut}</div>
              <div class="metric-label">Rows Out</div>
            </div>
            <div class="pipeline-metric">
              <div class="metric-value">${stage.metrics.freshness}</div>
              <div class="metric-label">Freshness</div>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  detail.classList.add('visible');

  // trigger Prism highlighting if available
  if (typeof Prism !== 'undefined') {
    Prism.highlightAllUnder(detail);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
