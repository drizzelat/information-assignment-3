/* ============================================================
   The Cost of Inaction — main.js
   Three D3 v7 components + scrollytelling + brushing/linking + tooltips
   ============================================================ */

"use strict";

// ---- shared config -----------------------------------------------------
const TYPE_COLORS = {
  "Flood":               "#3aa0ff",
  "Storm":               "#9b6bff",
  "Drought":             "#ffb347",
  "Wildfire":            "#ff5a4d",
  "Extreme temperature": "#ff8fb3",
  "Landslide":           "#8d6e63",
};
const TYPE_ORDER = ["Flood", "Storm", "Drought", "Wildfire", "Extreme temperature", "Landslide"];

const WORLD_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// ---- tooltip (details-on-demand) ---------------------------------------
const tooltipEl = document.getElementById("tooltip");
const Tooltip = {
  show(html, event) {
    tooltipEl.innerHTML = html;
    tooltipEl.classList.add("is-visible");
    tooltipEl.setAttribute("aria-hidden", "false");
    this.move(event);
  },
  move(event) {
    const pad = 14;
    let x = event.clientX + pad;
    let y = event.clientY + pad;
    const r = tooltipEl.getBoundingClientRect();
    if (x + r.width > window.innerWidth) x = event.clientX - r.width - pad;
    if (y + r.height > window.innerHeight) y = event.clientY - r.height - pad;
    tooltipEl.style.left = x + "px";
    tooltipEl.style.top = y + "px";
  },
  hide() {
    tooltipEl.classList.remove("is-visible");
    tooltipEl.setAttribute("aria-hidden", "true");
  },
};

// ---- formatting --------------------------------------------------------
// damage is stored in thousands of US$ (EM-DAT "'000 US$")
function fmtMoney(thousands) {
  const usd = thousands * 1000;
  if (usd >= 1e9) return "$" + (usd / 1e9).toFixed(2) + "B";
  if (usd >= 1e6) return "$" + (usd / 1e6).toFixed(1) + "M";
  if (usd >= 1e3) return "$" + (usd / 1e3).toFixed(0) + "K";
  return "$" + Math.round(usd);
}
function fmtBillionsAxis(thousands) {
  // thousands -> billions of US$
  return "$" + (thousands / 1e6).toFixed(0) + "B";
}
function tooltipRow(key, val) {
  return `<div class="tt-row"><span class="tt-key">${key}</span><span class="tt-val">${val}</span></div>`;
}

// =======================================================================
//  COMPONENT 1 — Temperature Timeline (Area Chart)
// =======================================================================
function createAreaChart(selector, tempData) {
  const root = d3.select(selector);
  const series = tempData.series;
  const years = d3.extent(series, (d) => d.year);

  let svg, x, y, clip, areaPath, linePath, brushG, brush;
  let brushEnabled = false;
  let onBrushCb = null;
  let revealYear = years[1];        // remembered state for resize
  let width = 0, height = 0;
  const margin = { top: 16, right: 24, bottom: 34, left: 48 };

  function draw() {
    const node = root.node();
    width = node.clientWidth;
    height = node.clientHeight;
    if (width <= 0 || height <= 0) return;

    root.selectAll("*").remove();

    const iw = width - margin.left - margin.right;
    const ih = height - margin.top - margin.bottom;

    svg = root.append("svg").attr("viewBox", `0 0 ${width} ${height}`);
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    x = d3.scaleLinear().domain(years).range([0, iw]);
    const yPad = 0.15;
    y = d3.scaleLinear()
      .domain([d3.min(series, (d) => d.anomaly) - yPad, d3.max(series, (d) => d.anomaly) + yPad])
      .range([ih, 0]);

    // gradient fill
    const defs = svg.append("defs");
    const grad = defs.append("linearGradient").attr("id", "area-grad").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 1);
    grad.append("stop").attr("offset", "0%").attr("stop-color", "#ff6b4a").attr("stop-opacity", 0.85);
    grad.append("stop").attr("offset", "100%").attr("stop-color", "#ff6b4a").attr("stop-opacity", 0.05);

    // reveal clip
    clip = defs.append("clipPath").attr("id", "area-clip").append("rect")
      .attr("x", 0).attr("y", -margin.top).attr("height", height).attr("width", x(revealYear));

    // gridlines
    g.append("g").attr("class", "grid")
      .call(d3.axisLeft(y).ticks(5).tickSize(-iw).tickFormat(""));

    // zero baseline
    g.append("line").attr("class", "zero-line")
      .attr("x1", 0).attr("x2", iw).attr("y1", y(0)).attr("y2", y(0));
    g.append("text").attr("class", "axis-label")
      .attr("x", 4).attr("y", y(0) - 5).text("baseline (0°C)");

    const area = d3.area()
      .x((d) => x(d.year))
      .y0(ih)
      .y1((d) => y(d.anomaly))
      .curve(d3.curveMonotoneX);
    const line = d3.line()
      .x((d) => x(d.year))
      .y((d) => y(d.anomaly))
      .curve(d3.curveMonotoneX);

    const clipped = g.append("g").attr("clip-path", "url(#area-clip)");
    areaPath = clipped.append("path").datum(series).attr("class", "area-fill")
      .attr("fill", "url(#area-grad)").attr("d", area);
    linePath = clipped.append("path").datum(series).attr("class", "area-line").attr("d", line);

    // axes
    g.append("g").attr("class", "axis").attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).ticks(8).tickFormat(d3.format("d")));
    g.append("g").attr("class", "axis")
      .call(d3.axisLeft(y).ticks(5).tickFormat((d) => d.toFixed(1) + "°"));

    // brush layer (added on demand)
    brushG = g.append("g").attr("class", "brush");
    brush = d3.brushX().extent([[0, 0], [iw, ih]]).on("end", brushed);

    if (brushEnabled) attachBrush(iw, ih);
  }

  function attachBrush(iw, ih) {
    brushG.call(brush);
    brushG.append("text").attr("class", "brush-hint")
      .attr("x", 6).attr("y", 14).text("↔ drag to select a period");
  }

  function brushed(event) {
    if (!onBrushCb) return;
    if (!event.selection) { onBrushCb(null); return; }
    const [x0, x1] = event.selection;
    const y0 = Math.round(x.invert(x0));
    const y1 = Math.round(x.invert(x1));
    onBrushCb([Math.min(y0, y1), Math.max(y0, y1)]);
  }

  return {
    draw,
    revealTo(year, duration = 1200) {
      revealYear = year;
      if (!clip) return;
      if (duration === 0) {            // instant — used for scroll-progress scrubbing
        clip.interrupt().attr("width", x(year));
        return;
      }
      clip.transition().duration(duration).ease(d3.easeCubicInOut)
        .attr("width", x(year));
    },
    enableBrush(cb) {
      onBrushCb = cb;
      brushEnabled = true;
      const iw = width - margin.left - margin.right;
      const ih = height - margin.top - margin.bottom;
      if (brushG) attachBrush(iw, ih);
    },
    disableBrush() {
      brushEnabled = false;
      onBrushCb = null;
      if (brushG) brushG.selectAll("*").remove();
    },
    resize() { draw(); },
  };
}

// =======================================================================
//  COMPONENT 2 — Geographic Impact (Bubble Map)
// =======================================================================
function createBubbleMap(selector, disasterData, world) {
  const root = d3.select(selector);
  const records = disasterData.records;
  const regions = disasterData.regions;

  // global max per (region,type) over all time -> stable radius scale
  const allAgg = aggregateByRegionType(records, -Infinity, Infinity);
  const maxDamage = d3.max(allAgg, (d) => d.damage) || 1;

  let svg, gMap, gBubbles, projection, path, rScale;
  let width = 0, height = 0;
  let state = { y0: 1900, y1: 1990 };  // remembered for resize

  function aggregateByRegionType(recs, y0, y1) {
    const map = new Map();
    for (const r of recs) {
      if (r.year < y0 || r.year > y1) continue;
      const k = r.region + "|" + r.type;
      let e = map.get(k);
      if (!e) { e = { region: r.region, type: r.type, damage: 0, count: 0 }; map.set(k, e); }
      e.damage += r.damage;
      e.count += r.count;
    }
    return [...map.values()].filter((d) => d.damage > 0);
  }

  // place each (region,type) bubble in a small ring around the continent centroid
  function bubblePosition(d) {
    const c = regions[d.region];
    const base = projection([c.lon, c.lat]);
    const ti = TYPE_ORDER.indexOf(d.type);
    const ang = (ti / TYPE_ORDER.length) * 2 * Math.PI - Math.PI / 2;
    const ringR = Math.min(width, height) * 0.035;
    return [base[0] + Math.cos(ang) * ringR, base[1] + Math.sin(ang) * ringR];
  }

  function draw() {
    const node = root.node();
    width = node.clientWidth;
    height = node.clientHeight;
    if (width <= 0 || height <= 0) return;

    root.selectAll("*").remove();
    svg = root.append("svg").attr("viewBox", `0 0 ${width} ${height}`);

    const land = topojson.feature(world, world.objects.countries);
    projection = d3.geoNaturalEarth1().fitExtent([[4, 4], [width - 4, height - 4]], land);
    path = d3.geoPath(projection);

    gMap = svg.append("g");
    gMap.append("path").datum(d3.geoGraticule10()).attr("class", "graticule").attr("d", path);
    gMap.selectAll("path.country").data(land.features).join("path")
      .attr("class", "country").attr("d", path);

    rScale = d3.scaleSqrt().domain([0, maxDamage]).range([0, Math.min(width, height) * 0.11]);

    gBubbles = svg.append("g");
    update(state.y0, state.y1, 0);
  }

  function update(y0, y1, duration = 900) {
    state = { y0, y1 };
    if (!gBubbles) return;
    const data = aggregateByRegionType(records, y0, y1)
      .sort((a, b) => b.damage - a.damage);  // big bubbles drawn first (under)

    const sel = gBubbles.selectAll("circle.bubble")
      .data(data, (d) => d.region + "|" + d.type);

    sel.exit().transition().duration(duration / 2).attr("r", 0).remove();

    const enter = sel.enter().append("circle")
      .attr("class", "bubble")
      .attr("fill", (d) => TYPE_COLORS[d.type])
      .attr("cx", (d) => bubblePosition(d)[0])
      .attr("cy", (d) => bubblePosition(d)[1])
      .attr("r", 0)
      .on("mouseenter", function (event, d) {
        Tooltip.show(
          `<div class="tt-title">${d.region} &middot; ${d.type}</div>` +
          tooltipRow("Period", `${state.y0 < 1900 ? "all" : state.y0}–${state.y1}`) +
          tooltipRow("Damage", fmtMoney(d.damage)) +
          tooltipRow("Events", d.count),
          event
        );
      })
      .on("mousemove", (event) => Tooltip.move(event))
      .on("mouseleave", () => Tooltip.hide());

    enter.merge(sel)
      .attr("cx", (d) => bubblePosition(d)[0])
      .attr("cy", (d) => bubblePosition(d)[1])
      .transition().duration(duration).ease(d3.easeCubicOut)
      .attr("r", (d) => rScale(d.damage))
      .attr("fill", (d) => TYPE_COLORS[d.type]);
  }

  return {
    draw,
    update,
    resize() { draw(); },
  };
}

// =======================================================================
//  COMPONENT 3 — Financial Breakdown (Stacked Bar Chart)
// =======================================================================
function createStackedBar(selector, disasterData) {
  const root = d3.select(selector);
  const records = disasterData.records;

  const decades = [...new Set(records.map((d) => d.decade))].sort((a, b) => a - b);

  // stable y-domain: max stacked total over full record
  const fullByDecade = rollup(records, -Infinity, Infinity);
  const yMax = d3.max(decades, (dec) =>
    TYPE_ORDER.reduce((s, t) => s + (fullByDecade.get(dec)?.[t] || 0), 0)
  ) || 1;

  let svg, gPlot, x, y, width = 0, height = 0;
  const margin = { top: 16, right: 18, bottom: 40, left: 64 };
  let state = { y0: -Infinity, y1: Infinity };

  function rollup(recs, y0, y1) {
    const m = new Map();
    for (const r of recs) {
      if (r.year < y0 || r.year > y1) continue;
      let e = m.get(r.decade);
      if (!e) { e = {}; m.set(r.decade, e); }
      e[r.type] = (e[r.type] || 0) + r.damage;
    }
    return m;
  }

  function buildSeries(byDecade) {
    const rows = decades.map((dec) => {
      const o = { decade: dec };
      for (const t of TYPE_ORDER) o[t] = byDecade.get(dec)?.[t] || 0;
      return o;
    });
    return d3.stack().keys(TYPE_ORDER)(rows);
  }

  function draw() {
    const node = root.node();
    width = node.clientWidth;
    height = node.clientHeight;
    if (width <= 0 || height <= 0) return;

    root.selectAll("*").remove();
    const iw = width - margin.left - margin.right;
    const ih = height - margin.top - margin.bottom;

    svg = root.append("svg").attr("viewBox", `0 0 ${width} ${height}`);
    gPlot = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    x = d3.scaleBand().domain(decades).range([0, iw]).padding(0.18);
    y = d3.scaleLinear().domain([0, yMax]).range([ih, 0]);

    gPlot.append("g").attr("class", "grid")
      .call(d3.axisLeft(y).ticks(5).tickSize(-iw).tickFormat(""));

    gPlot.append("g").attr("class", "axis").attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).tickFormat((d) => d + "s"))
      .selectAll("text").attr("transform", "rotate(-35)").style("text-anchor", "end");

    gPlot.append("g").attr("class", "axis")
      .call(d3.axisLeft(y).ticks(5).tickFormat(fmtBillionsAxis));

    gPlot.append("text").attr("class", "axis-label")
      .attr("transform", "rotate(-90)").attr("x", -ih / 2).attr("y", -margin.left + 14)
      .attr("text-anchor", "middle").text("Total adjusted damage (US$)");

    // render instantly at current state (keeps bars correct across resizes;
    // the animated "slide up" for Step 5 is triggered explicitly via reveal())
    update(state.y0, state.y1, 0);
  }

  function update(y0, y1, duration = 800) {
    state = { y0, y1 };
    if (!gPlot) return;
    const ih = y.range()[0];
    const stacked = buildSeries(rollup(records, y0, y1));

    const layers = gPlot.selectAll("g.layer").data(stacked, (d) => d.key);
    const layersEnter = layers.enter().append("g")
      .attr("class", "layer").attr("fill", (d) => TYPE_COLORS[d.key]);
    const layersAll = layersEnter.merge(layers);

    const segs = layersAll.selectAll("rect.bar-seg")
      .data((d) => d.map((v) => ({ ...v, key: d.key })), (d) => d.data.decade);

    segs.exit().remove();

    segs.enter().append("rect")
      .attr("class", "bar-seg")
      .attr("x", (d) => x(d.data.decade))
      .attr("width", x.bandwidth())
      .attr("y", ih).attr("height", 0)
      .on("mouseenter", function (event, d) {
        const val = d[1] - d[0];
        const total = TYPE_ORDER.reduce((s, t) => s + (d.data[t] || 0), 0);
        const share = total > 0 ? ((val / total) * 100).toFixed(0) : 0;
        Tooltip.show(
          `<div class="tt-title">${d.data.decade}s &middot; ${d.key}</div>` +
          tooltipRow("Damage", fmtMoney(val)) +
          tooltipRow("Decade total", fmtMoney(total)) +
          tooltipRow("Share", share + "%"),
          event
        );
      })
      .on("mousemove", (event) => Tooltip.move(event))
      .on("mouseleave", () => Tooltip.hide())
      .merge(segs)
      .attr("x", (d) => x(d.data.decade))
      .attr("width", x.bandwidth())
      .transition().duration(duration).ease(d3.easeCubicOut)
      .attr("y", (d) => y(d[1]))
      .attr("height", (d) => Math.max(0, y(d[0]) - y(d[1])));
  }

  return {
    draw,
    update,
    // clear segments and re-grow from the baseline -> the Step 5 "slide up"
    reveal(duration = 1000) {
      if (!gPlot) return;
      gPlot.selectAll("g.layer").remove();
      update(state.y0, state.y1, duration);
    },
    resize() { draw(); },
  };
}

// =======================================================================
//  LEGEND
// =======================================================================
function buildLegend() {
  const el = document.getElementById("legend");
  el.innerHTML = TYPE_ORDER.map((t) =>
    `<div class="legend-row"><span class="legend-swatch" style="background:${TYPE_COLORS[t]}"></span>${t}</div>`
  ).join("");
}

// =======================================================================
//  BOOTSTRAP + SCROLLYTELLING
// =======================================================================
Promise.all([
  d3.json("data/disasters.json"),
  d3.json("data/temperature.json"),
  d3.json(WORLD_URL),
]).then(([disasterData, tempData, world]) => {
  buildLegend();

  const area = createAreaChart("#chart-area", tempData);
  const map = createBubbleMap("#chart-map", disasterData, world);
  const bar = createStackedBar("#chart-bar", disasterData);

  area.draw();
  map.draw();
  bar.draw();

  const stage = document.getElementById("stage");
  const legend = document.getElementById("legend");
  const panels = {
    area: document.getElementById("panel-area"),
    map: document.getElementById("panel-map"),
    bar: document.getElementById("panel-bar"),
  };

  function showOnly(...keys) {
    for (const k of Object.keys(panels)) {
      panels[k].classList.toggle("is-visible", keys.includes(k));
    }
  }
  function setExplore(on) {
    stage.classList.toggle("explore", on);
  }
  function setLegend(on) {
    legend.classList.toggle("is-visible", on);
  }

  // brushing & linking callback used in step 6
  function onBrush(range) {
    if (!range) {  // cleared -> show everything
      map.update(-Infinity, Infinity, 400);
      bar.update(-Infinity, Infinity, 400);
      return;
    }
    map.update(range[0], range[1], 400);
    bar.update(range[0], range[1], 400);
  }

  let inExplore = false;
  function leaveExploreIfNeeded() {
    if (inExplore) {
      inExplore = false;
      area.disableBrush();
      setExplore(false);
      // panels resized back to full-stage size
      area.resize(); map.resize(); bar.resize();
    }
  }

  function activateStep(i) {
    switch (i) {
      case 0: // The Baseline
        leaveExploreIfNeeded();
        setLegend(false);
        showOnly("area");
        area.revealTo(1950);
        break;
      case 1: // The Shift — the line is drawn out by scroll progress (see onStepProgress)
        leaveExploreIfNeeded();
        setLegend(false);
        showOnly("area");
        break;
      case 2: // Emergence of Extremes
        leaveExploreIfNeeded();
        setLegend(true);
        showOnly("map");
        map.update(1900, 1990, 900);
        break;
      case 3: // The Modern Crisis
        leaveExploreIfNeeded();
        setLegend(true);
        showOnly("map");
        map.update(1900, 2026, 1100);
        break;
      case 4: // The Economic Toll
        leaveExploreIfNeeded();
        setLegend(true);
        showOnly("bar");
        bar.update(-Infinity, Infinity, 0); // ensure full range, no anim
        bar.reveal(1000);                   // animated slide-up from baseline
        break;
      case 5: // Explore the Data
        setLegend(true);
        showOnly("area", "map", "bar");
        if (!inExplore) {
          inExplore = true;
          setExplore(true);
          // panels just changed size -> re-render charts to fit dashboard
          area.resize(); map.resize(); bar.resize();
          area.revealTo(2026, 600);
          map.update(-Infinity, Infinity, 600);
          bar.update(-Infinity, Infinity, 600);
          area.enableBrush(onBrush);
        }
        break;
    }
  }

  // initial state before scroll
  activateStep(0);

  // Step 2 reveals the temperature line progressively as the user scrolls:
  // 1950 (continuing from Step 1) -> present, completing before Step 3 (the map).
  const SHIFT_FROM = 1950, SHIFT_TO = 2026;
  function shiftYear(progress) {
    const p = Math.min(progress / 0.85, 1);   // fully drawn at 85% through the step
    return SHIFT_FROM + p * (SHIFT_TO - SHIFT_FROM);
  }

  const scroller = scrollama();
  scroller
    .setup({ step: "#scrolly .step", offset: 0.55, progress: true })
    .onStepEnter((response) => {
      response.element.classList.add("is-active");
      activateStep(response.index);
      if (response.index === 1) {
        // sensible starting point so there is no flash before progress fires
        area.revealTo(response.direction === "up" ? SHIFT_TO : SHIFT_FROM, 300);
      }
    })
    .onStepProgress((response) => {
      if (response.index === 1) area.revealTo(shiftYear(response.progress), 0);
    })
    .onStepExit((response) => {
      response.element.classList.remove("is-active");
    });

  // debounced resize
  let rt;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      area.resize(); map.resize(); bar.resize();
      scroller.resize();
    }, 200);
  });
}).catch((err) => {
  console.error("Failed to load data:", err);
  document.getElementById("stage").innerHTML =
    '<div style="padding:2rem;color:#ff8f7a">Could not load data or map. ' +
    'Serve this folder over HTTP (e.g. <code>py -m http.server</code>) and check your connection for the CDN map.</div>';
});
