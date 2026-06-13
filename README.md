# The Cost of Inaction

An interactive, scrollytelling data visualization on the societal and economic
impact of climate change, built for **municipal policymakers**. It links the
rise in global temperature to the accelerating, exponential cost of local
climate disasters.

Built with plain **HTML, CSS and D3.js v7** — no build step, no framework, no
Tableau/Power BI.

---

## Running the app

The app loads its data with `d3.json()`, which browsers block over `file://`.
You must serve the folder over HTTP. Any static server works; the simplest is
Python's built-in one.

1. Open a terminal in the project root (the folder containing `index.html`).
2. Start a local server:

   ```powershell
   py -m http.server 8765
   ```

   (On macOS/Linux use `python3 -m http.server 8765`.)
3. Open **http://127.0.0.1:8765** in a modern browser (Chrome, Edge, Firefox).
4. Stop the server with **Ctrl+C**. If port 8765 is busy, pick another, e.g.
   `py -m http.server 8080`, and adjust the URL.

> **Internet connection required.** D3, TopoJSON, Scrollama, the world map
> (`world-atlas`) and the web fonts all load from CDNs. If the map fails to
> appear, check your connection — the page will print a hint in the stage area.

---

## How to use it

Scroll from top to bottom. The story is told in **six narrative steps** down the
left column while the visualization on the right (the sticky "stage") reacts to
where you are:

1. **The Baseline** — the temperature line up to 1929.
2. **The Shift** — keep scrolling; the line is *drawn out year by year* as you
   scroll, all the way to today.
3. **Emergence of Extremes** — a world bubble map of climate disasters up to 1990.
4. **The Modern Crisis** — the same map extended through 2026; bubbles swell.
5. **The Economic Toll** — damages stacked by decade, growing exponentially.
6. **Explore the Data** — a 3-panel dashboard you can interrogate yourself.

**Interactions**
- **Scrollytelling triggers** — scrolling drives every transition; Step 2 reveals
  the temperature curve progressively with your scroll position.
- **Brushing & linking** (Step 6) — drag across the temperature chart to select a
  time range; the map and the bar chart update instantly to that period. Drag the
  selection to move it; click outside it to clear and reset.
- **Details on demand** — hover any bubble or bar segment for a tooltip with exact
  figures (period, inflation-adjusted damage, event counts, share of decade).

---

## Project structure

```
index.html              Markup: hero, 6 story steps, the 3 viz panels, tooltip
styles.css              Dark theme, two-column scrolly layout, dashboard grid
main.js                 The 3 D3 components + scrollama wiring + brushing + tooltips
data/
  disasters.json        Aggregated climate disasters (year x region x type)
  temperature.json      Annual global temperature anomaly, 1900-2026
preprocess.py           Builds the two JSON files from the raw CSVs (dev only)
```

The three D3 components in `main.js`:
- `createAreaChart()` — temperature timeline with a clip-path reveal and the
  Step-6 brush.
- `createBubbleMap()` — `geoNaturalEarth1` world map with damage-sized bubbles,
  one ring of disaster types per continent centroid.
- `createStackedBar()` — damage stacked by decade and disaster type.

---

## Regenerating the data (optional)

`data/disasters.json` and `data/temperature.json` are committed, so you do **not**
need to do this to run the app. Only regenerate if you change the raw sources.

`preprocess.py` is pure Python standard library (no pandas). It expects these raw
files in the project root (they are git-ignored and not shipped):

- `emdat_raw.csv` — EM-DAT International Disaster Database export.
- `global_temp_raw.csv` — monthly global temperature anomalies (1940+).
- `gistemp.csv` — NASA GISTEMP annual series, used to back-fill 1900–1939.

Then run:

```powershell
py preprocess.py
```

It filters EM-DAT to natural climate/weather events (Hydrological,
Meteorological, Climatological), splits the Americas into North/South by ISO
code, buckets disaster types into six categories, aggregates by
(year × region × type), and rebases the back-filled temperatures onto the
observed series. It prints a summary and overwrites the two files in `data/`.

---

## Data sources

- **EM-DAT** — The International Disaster Database (CRED / UCLouvain), filtered to
  climate & weather events. Damage figures are inflation-adjusted (US$).
- **Global surface-temperature anomaly** records; pre-1940 years back-filled from
  **NASA GISTEMP** and rebased to the observed series.
