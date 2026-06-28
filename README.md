# Gateshead Data Platform — Portfolio Demo

A hands-on, interactive demo of a corporate data platform built for Gateshead Council. This isn't a slide deck — everything here runs real logic in the browser.

I built this to demonstrate how I'd approach building a greenfield data platform in a local government context, covering everything from pipeline design to data governance.

## Live Demo

👉 **[View the live demo](https://angaarpotta.github.io/gateshead-data-platform/)**

## What's Inside

| Section | What It Demonstrates |
|---|---|
| **Pipeline Builder** | Interactive ETL pipelines (Council Tax, Housing, Social Care) following a medallion architecture. Click any stage to see real PySpark/SQL code. |
| **Analytics Dashboard** | Power BI-style dashboard with Chart.js — demand forecasting, resource allocation, ward deprivation analysis. All charts respond to filters. |
| **Data Quality Engine** | Upload a CSV or use sample data to run 10 validation rules (completeness, format, referential integrity). Shows the Fabric/Python equivalent. |
| **Code Laboratory** | Real-world examples in SQL, PySpark, Python (splink), DAX, and dbt — each with annotations explaining the "why" behind the code. |
| **Platform Architecture** | Interactive 6-layer Fabric architecture diagram. Click any component for integration details, volumes, and design rationale. |
| **Data Governance** | Searchable data catalog with lineage tracking, data dictionaries, PII classification, retention policies, and access controls. |

## Tech Stack

- **Frontend**: Vanilla HTML, CSS, JavaScript (ES Modules)
- **Charts**: [Chart.js 4](https://www.chartjs.org/)
- **Syntax Highlighting**: [Prism.js](https://prismjs.com/)
- **Fonts**: [Inter](https://fonts.google.com/specimen/Inter) + [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono)
- **Hosting**: GitHub Pages (static — no build step, no server)

## Data Platform Technologies Demonstrated

- **Microsoft Fabric** — Lakehouses, Notebooks, Pipelines, Dataflow Gen2, SQL Analytics Endpoints, Semantic Models
- **Delta Lake** — ACID transactions, time travel, MERGE (upsert) patterns
- **PySpark** — DataFrame transformations, window functions, SCD Type 2
- **SQL** — Complex CTEs, aggregations, views, stored procedures
- **splink** — Probabilistic record linkage for deduplication across systems
- **dbt** — Version-controlled transformation models with built-in testing
- **Power BI / DAX** — Semantic models, measures, row-level security
- **Data Governance** — Classification, retention, PII handling, GDPR compliance

## Running Locally

Since this is a static site using ES modules, you'll need a local server:

```bash
# Python
python -m http.server 8000

# Node.js
npx serve .

# VS Code
# Install "Live Server" extension and click "Go Live"
```

Then open `http://localhost:8000` in your browser.

## Deploying to GitHub Pages

1. Create a new repository on GitHub (e.g., `gateshead-data-platform`)
2. Push this code:
   ```bash
   git init
   git add .
   git commit -m "Initial commit — data platform portfolio demo"
   git branch -M main
   git remote add origin https://github.com/Angaarpotta/gateshead-data-platform.git
   git push -u origin main
   ```
3. Go to **Settings → Pages** in your repository
4. Set source to **Deploy from a branch** → **main** → **/ (root)**
5. Your site will be live at `https://yourusername.github.io/gateshead-data-platform/`

## Disclaimer

All data in this demo is **simulated**. No real personal data, council records, or sensitive information has been used. Ward names, service categories, and system names are based on publicly available information about Gateshead Council.

---

*Built with care, not a template.*
