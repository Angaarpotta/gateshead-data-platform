/* ============================================================
   Codelab.js — tabbed code showcase
   SQL, PySpark, Python (splink), DAX, dbt
   Gateshead Data Platform Portfolio
   ============================================================ */

const CODE_EXAMPLES = [
  {
    id: 'sql',
    tab: 'SQL',
    title: 'Complex CTE — Council Tax vs Benefits Cross-Match',
    annotation: "This is the kind of query I'd write to identify residents who may be eligible for council tax support but haven't applied. Joins across two separate source systems.",
    lang: 'sql',
    code: `-- Identify council tax accounts that might qualify for
-- Council Tax Support (CTS) but haven't applied
-- Uses CTEs for readability — I find this much clearer
-- than nested subqueries when explaining logic to analysts

WITH active_accounts AS (
    SELECT
        ct.account_ref,
        ct.property_ref,
        ct.liable_name,
        ct.postcode,
        ct.band,
        ct.annual_charge,
        ct.balance_outstanding,
        w.ward_name
    FROM gold.council_tax ct
    INNER JOIN ref.wards w ON ct.ward_code = w.ward_code
    WHERE ct.status = 'Active'
      AND ct.year = 2024
),

existing_cts AS (
    -- People already receiving council tax support
    SELECT DISTINCT
        account_ref
    FROM gold.cts_awards
    WHERE award_status = 'Live'
      AND financial_year = '2024/25'
),

housing_benefit AS (
    -- People on housing benefit — strong indicator of CTS eligibility
    SELECT
        hb.postcode,
        hb.surname,
        hb.claim_type,
        hb.weekly_amount
    FROM gold.housing_benefit hb
    WHERE hb.claim_status = 'Live'
),

potential_matches AS (
    SELECT
        a.account_ref,
        a.liable_name,
        a.ward_name,
        a.band,
        a.annual_charge,
        a.balance_outstanding,
        hb.claim_type AS hb_claim_type,
        hb.weekly_amount AS hb_weekly_amount,
        -- fuzzy name matching via soundex
        CASE
            WHEN SOUNDEX(a.liable_name) = SOUNDEX(hb.surname)
            THEN 'High'
            ELSE 'Medium'
        END AS match_confidence
    FROM active_accounts a
    LEFT JOIN existing_cts cts ON a.account_ref = cts.account_ref
    INNER JOIN housing_benefit hb
        ON a.postcode = hb.postcode
    WHERE cts.account_ref IS NULL  -- not already receiving CTS
)

SELECT
    account_ref,
    liable_name,
    ward_name,
    band,
    annual_charge,
    balance_outstanding,
    hb_claim_type,
    hb_weekly_amount,
    match_confidence,
    -- estimate potential CTS award based on band and HB amount
    ROUND(annual_charge * 0.75, 2) AS estimated_cts_award
FROM potential_matches
WHERE match_confidence IN ('High', 'Medium')
ORDER BY balance_outstanding DESC, match_confidence;`,
    output: [
      { text: '✓ Query compiled successfully', type: 'success' },
      { text: 'Execution plan: 4 table scans, 2 hash joins, 1 merge join', type: 'info' },
      { text: 'Results: 847 potential CTS-eligible accounts identified', type: 'success' },
      { text: 'Est. £1.2M in unclaimed support across 847 accounts', type: 'info' },
      { text: '⚠ Note: soundex matching may produce false positives — manual review recommended', type: 'warn' }
    ]
  },
  {
    id: 'pyspark',
    tab: 'PySpark',
    title: 'Delta Merge — Slowly Changing Dimension Type 2',
    annotation: "SCD Type 2 is essential for tracking historical changes in council data. This pattern preserves the full history of address changes, band reclassifications, etc.",
    lang: 'python',
    code: `# SCD Type 2 implementation for council tax properties
# Tracks historical changes with effective dating
# Runs in a Fabric notebook on the silver layer

from pyspark.sql import functions as F
from pyspark.sql.window import Window
from delta.tables import DeltaTable

def scd_type2_merge(
    spark,
    source_table: str,
    target_table: str,
    key_columns: list,
    tracked_columns: list
):
    """
    Performs an SCD Type 2 merge.
    New/changed records get inserted with is_current=True.
    Changed records' old versions get closed off with an end_date.
    """
    df_source = spark.read.table(source_table)
    dt_target = DeltaTable.forName(spark, target_table)
    df_target = dt_target.toDF()

    # Build the join condition
    join_cond = " AND ".join(
        [f"target.{c} = source.{c}" for c in key_columns]
    )

    # Detect changes — compare tracked columns
    change_cond = " OR ".join(
        [f"target.{c} != source.{c}" for c in tracked_columns]
    )

    # Step 1: Close off changed records
    # This sets end_date and is_current = false for records
    # that have changed in the source
    dt_target.alias("target").merge(
        df_source.alias("source"),
        f"{join_cond} AND target.is_current = true"
    ).whenMatchedUpdate(
        condition=change_cond,
        set={
            "end_date": F.current_date(),
            "is_current": F.lit(False)
        }
    ).execute()

    # Step 2: Insert new versions of changed records
    # and entirely new records
    df_changed = df_source.alias("s").join(
        df_target.filter("is_current = true").alias("t"),
        on=key_columns,
        how="left_anti"  # records not in target (new or just closed)
    ).select(
        *[F.col(c) for c in df_source.columns],
        F.current_date().alias("start_date"),
        F.lit(None).cast("date").alias("end_date"),
        F.lit(True).alias("is_current"),
        F.current_timestamp().alias("_updated_at")
    )

    df_changed.write \\
        .format("delta") \\
        .mode("append") \\
        .saveAsTable(target_table)

    return df_changed.count()


# Usage:
rows_affected = scd_type2_merge(
    spark,
    source_table="bronze.properties_latest",
    target_table="silver.dim_properties",
    key_columns=["property_ref"],
    tracked_columns=[
        "address_line_1", "postcode", "ward_code",
        "band", "property_type", "bedrooms"
    ]
)

print(f"SCD2 merge complete: {rows_affected} new versions created")`,
    output: [
      { text: '✓ Reading bronze.properties_latest... 42,391 rows', type: 'info' },
      { text: '✓ Reading silver.dim_properties... 48,204 current rows', type: 'info' },
      { text: '✓ Phase 1: Closed 312 changed records', type: 'success' },
      { text: '✓ Phase 2: Inserted 312 new versions + 89 new properties', type: 'success' },
      { text: 'SCD2 merge complete: 401 new versions created', type: 'success' }
    ]
  },
  {
    id: 'splink',
    tab: 'Python (splink)',
    title: 'Probabilistic Record Linkage — Matching Residents Across Systems',
    annotation: "One of the things I find most interesting about council data — different systems often don't share a common identifier for residents. splink lets us match probabilistically. I used this approach in the social care pipeline.",
    lang: 'python',
    code: `# Record linkage across council systems using splink
# Goal: create a single person index from fragmented data
# This is genuinely useful — councils often have the same person
# recorded differently in revenues, housing, social care, etc.

import splink.comparison_library as cl
from splink import Linker, SettingsCreator, DuckDBAPI, block_on

# Load person records from multiple source systems
df_revenues = spark.read.table("silver.revenues_persons") \\
    .select("person_id", "forename", "surname",
            "dob", "postcode", "source_system")

df_housing = spark.read.table("silver.housing_tenants") \\
    .select("person_id", "forename", "surname",
            "dob", "postcode", "source_system")

df_social = spark.read.table("silver.social_care_contacts") \\
    .select("person_id", "forename", "surname",
            "dob", "postcode", "source_system")

# Union all person records
df_all = df_revenues.unionByName(df_housing) \\
    .unionByName(df_social)

# Convert to pandas for splink (or use Spark backend for scale)
pdf = df_all.toPandas()

# Configure the linkage model
settings = SettingsCreator(
    link_type="dedupe_only",
    comparisons=[
        cl.JaroWinklerAtThresholds(
            "forename", [0.92, 0.85, 0.70],
            term_frequency_adjustments=True
        ),
        cl.JaroWinklerAtThresholds(
            "surname", [0.95, 0.88],
            term_frequency_adjustments=True
        ),
        cl.DateOfBirthComparison(
            "dob",
            datetime_metrics=["month", "year", "day"],
            invalid_dates_as_null=True
        ),
        cl.LevenshteinAtThresholds(
            "postcode", [1, 2]
        ),
    ],
    blocking_rules_to_generate_predictions=[
        block_on("surname", "postcode"),
        block_on("forename", "dob"),
        block_on("surname", "dob"),
    ],
    max_iterations=20,
    em_convergence=0.0001
)

# Train the model
db_api = DuckDBAPI()
linker = Linker(pdf, settings, db_api)

linker.estimate_u_using_random_sampling(max_pairs=5e6)
linker.estimate_parameters_using_expectation_maximisation(
    block_on("surname", "dob")
)
linker.estimate_parameters_using_expectation_maximisation(
    block_on("forename", "postcode")
)

# Predict matches
df_predictions = linker.predict(
    threshold_match_probability=0.88
)

# Cluster into unique person groups
df_clusters = linker.cluster_pairwise_predictions_at_threshold(
    df_predictions,
    threshold_match_probability=0.92
)

# Summary stats
n_records = len(pdf)
n_clusters = df_clusters["cluster_id"].nunique()
print(f"Matched {n_records} records into {n_clusters} unique people")
print(f"Deduplication ratio: {n_records/n_clusters:.1f}:1")`,
    output: [
      { text: '✓ Loaded 34,891 person records from 3 source systems', type: 'info' },
      { text: '✓ EM training converged after 14 iterations', type: 'success' },
      { text: '✓ Predicted 12,847 pairwise matches above 0.88 threshold', type: 'info' },
      { text: 'Matched 34,891 records into 28,104 unique people', type: 'success' },
      { text: 'Deduplication ratio: 1.2:1', type: 'success' },
      { text: '⚠ Review: 243 matches between 0.88-0.92 may need manual verification', type: 'warn' }
    ]
  },
  {
    id: 'dax',
    tab: 'DAX',
    title: 'Power BI Measures — Executive Dashboard KPIs',
    annotation: "These are the measures that sit behind the council's executive dashboard. The rolling averages and YoY comparisons are what the leadership team actually look at in their Monday briefings.",
    lang: 'javascript',
    code: `// ============================================
// Executive Dashboard — DAX Measures
// Semantic model: Gateshead_Corporate_Analytics
// ============================================

// --- Service Demand ---

Total Service Requests =
COUNTROWS('ServiceRequests')

Requests This Month =
CALCULATE(
    [Total Service Requests],
    DATESMTD('Calendar'[Date])
)

// Rolling 3-month average — smooths out seasonal noise
// The leadership team prefers this over raw monthly numbers
Requests Rolling 3M Avg =
VAR CurrentDate = MAX('Calendar'[Date])
VAR ThreeMonthsAgo =
    EDATE(CurrentDate, -3)
RETURN
    CALCULATE(
        AVERAGEX(
            VALUES('Calendar'[MonthYear]),
            [Total Service Requests]
        ),
        DATESBETWEEN(
            'Calendar'[Date],
            ThreeMonthsAgo,
            CurrentDate
        )
    )

// Year-over-year change — the one metric everyone asks about
Service Demand YoY % =
VAR CurrentYear =
    CALCULATE(
        [Total Service Requests],
        DATESYTD('Calendar'[Date])
    )
VAR PriorYear =
    CALCULATE(
        [Total Service Requests],
        DATESYTD(
            DATEADD('Calendar'[Date], -1, YEAR)
        )
    )
RETURN
    DIVIDE(
        CurrentYear - PriorYear,
        PriorYear,
        0
    )

// --- Council Tax Collection ---

Collection Rate % =
DIVIDE(
    SUMX(
        'CouncilTax',
        'CouncilTax'[Annual Charge]
            - 'CouncilTax'[Balance Outstanding]
    ),
    SUM('CouncilTax'[Annual Charge]),
    0
)

// Arrears risk segmentation — categorises accounts
// for the revenues team's proactive outreach
Arrears Risk Category =
SWITCH(
    TRUE(),
    [Balance Outstanding] = 0, "No Arrears",
    [Balance Outstanding] <= 200, "Low Risk",
    [Balance Outstanding] <= 500, "Medium Risk",
    [Balance Outstanding] <= 1000, "High Risk",
    "Critical"
)

// --- Housing Repairs ---

SLA Compliance % =
DIVIDE(
    COUNTROWS(
        FILTER(
            'Repairs',
            'Repairs'[Turnaround Days]
                <= 'Repairs'[SLA Target Days]
        )
    ),
    COUNTROWS('Repairs'),
    0
)

Avg Repair Cost =
AVERAGEX(
    FILTER('Repairs', NOT(ISBLANK('Repairs'[Actual Cost]))),
    'Repairs'[Actual Cost]
)`,
    output: [
      { text: '✓ 8 measures validated against semantic model', type: 'success' },
      { text: 'Collection Rate %: 96.3% (Target: 95.5%)', type: 'success' },
      { text: 'Service Demand YoY %: +6.2%', type: 'info' },
      { text: 'SLA Compliance %: 87.4% (Target: 90%)', type: 'warn' },
      { text: 'Avg Repair Cost: £342.80', type: 'info' }
    ]
  },
  {
    id: 'dbt',
    tab: 'dbt',
    title: 'dbt Staging Model — Housing Properties',
    annotation: "I've been experimenting with dbt in Fabric (via dbt-fabric adapter). It's brilliant for version-controlled transformations with built-in testing. This is a staging model with tests and documentation.",
    lang: 'sql',
    code: `-- models/staging/stg_housing__properties.sql
-- dbt model for staging housing property data
-- Materialized as a view for cost efficiency at this layer

{{ config(
    materialized='view',
    schema='staging',
    tags=['housing', 'daily']
) }}

WITH source AS (
    SELECT * FROM {{ source('housing_raw', 'properties') }}
),

renamed AS (
    SELECT
        -- Primary key
        property_reference       AS property_id,

        -- Property attributes
        UPPER(TRIM(address_1))   AS address_line_1,
        UPPER(TRIM(address_2))   AS address_line_2,
        UPPER(TRIM(address_3))   AS address_line_3,

        -- Standardise postcodes (remove extra spaces)
        UPPER(REPLACE(postcode, ' ', ''))
                                 AS postcode_raw,
        -- Re-format with proper space
        CONCAT(
            LEFT(UPPER(REPLACE(postcode, ' ', '')),
                 LEN(REPLACE(postcode, ' ', '')) - 3),
            ' ',
            RIGHT(UPPER(REPLACE(postcode, ' ', '')), 3)
        )                        AS postcode,

        ward_code,
        property_type,
        bedrooms,
        build_year,
        tenure_type,
        void_status,
        void_start_date,

        -- Audit
        last_modified_date       AS source_updated_at,
        CURRENT_TIMESTAMP        AS _loaded_at

    FROM source
    WHERE property_reference IS NOT NULL
)

SELECT * FROM renamed


-- ============================================
-- tests/staging/stg_housing__properties.yml
-- ============================================
-- version: 2
--
-- models:
--   - name: stg_housing__properties
--     description: >
--       Staged housing properties from NEC Housing.
--       One row per property. Postcodes standardised,
--       addresses uppercased for matching consistency.
--     columns:
--       - name: property_id
--         description: Unique property reference
--         tests:
--           - unique
--           - not_null
--       - name: postcode
--         description: Standardised UK postcode
--         tests:
--           - not_null
--           - dbt_expectations.expect_column_values_to_match_regex:
--               regex: "^[A-Z]{1,2}\\d[A-Z\\d]? \\d[A-Z]{2}$"
--       - name: ward_code
--         description: ONS ward code
--         tests:
--           - not_null
--           - relationships:
--               to: ref('ref_wards')
--               field: ward_code
--       - name: bedrooms
--         tests:
--           - dbt_expectations.expect_column_values_to_be_between:
--               min_value: 0
--               max_value: 10`,
    output: [
      { text: '$ dbt run --select stg_housing__properties', type: 'info' },
      { text: '✓ 1 of 1 OK created view staging.stg_housing__properties', type: 'success' },
      { text: '', type: 'info' },
      { text: '$ dbt test --select stg_housing__properties', type: 'info' },
      { text: '✓ unique_stg_housing__properties_property_id .......... PASS', type: 'success' },
      { text: '✓ not_null_stg_housing__properties_property_id ....... PASS', type: 'success' },
      { text: '✓ not_null_stg_housing__properties_postcode ........... PASS', type: 'success' },
      { text: '✓ regex_stg_housing__properties_postcode .............. PASS', type: 'success' },
      { text: '✓ relationships_stg_housing__properties_ward_code .... PASS', type: 'success' },
      { text: '✓ between_stg_housing__properties_bedrooms ........... PASS', type: 'success' },
      { text: '✓ All 6 tests passed', type: 'success' }
    ]
  }
];

let activeTab = 'sql';

export function initCodelab() {
  renderTabs();
  renderCode(activeTab);

  document.getElementById('code-tabs')?.addEventListener('click', (e) => {
    const tab = e.target.closest('.code-tab');
    if (!tab) return;
    const id = tab.dataset.tab;
    if (id && id !== activeTab) {
      activeTab = id;
      document.querySelectorAll('.code-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderCode(id);
    }
  });
}

function renderTabs() {
  const container = document.getElementById('code-tabs');
  if (!container) return;

  container.innerHTML = CODE_EXAMPLES.map(ex =>
    `<button class="code-tab ${ex.id === activeTab ? 'active' : ''}" data-tab="${ex.id}">${ex.tab}</button>`
  ).join('');
}

function renderCode(tabId) {
  const example = CODE_EXAMPLES.find(e => e.id === tabId);
  if (!example) return;

  const panel = document.getElementById('code-panel');
  if (!panel) return;

  panel.innerHTML = `
    <div class="code-panel-header">
      <div>
        <h3 style="font-size: 0.9rem; margin-bottom: 2px;">${example.title}</h3>
        <div class="code-annotation">${example.annotation}</div>
      </div>
      <button class="btn btn-sm btn-outline" id="code-run-btn">▶ Run</button>
    </div>
    <div class="code-display">
      <pre><code class="language-${example.lang}">${escapeHtml(example.code)}</code></pre>
    </div>
    <div class="code-output" id="code-output"></div>
  `;

  // syntax highlighting
  if (typeof Prism !== 'undefined') {
    Prism.highlightAllUnder(panel);
  }

  // run button handler
  document.getElementById('code-run-btn')?.addEventListener('click', () => {
    simulateRun(example.output);
  });
}

function simulateRun(outputLines) {
  const outputEl = document.getElementById('code-output');
  if (!outputEl) return;

  outputEl.classList.add('visible');
  outputEl.innerHTML = '<div class="output-line info">Running...</div>';

  // simulate progressive output
  let idx = 0;
  function addLine() {
    if (idx >= outputLines.length) return;
    const line = outputLines[idx];
    outputEl.innerHTML += `<div class="output-line ${line.type}">${line.text}</div>`;
    idx++;
    setTimeout(addLine, 300 + Math.random() * 200);
  }

  setTimeout(() => {
    outputEl.innerHTML = '';
    addLine();
  }, 500);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
