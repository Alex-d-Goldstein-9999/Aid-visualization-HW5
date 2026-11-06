// ============================================================
// Bipartite node-link diagram: donors (left column) -> recipients (right column)
// Node area = total amount; link width and color = amount from that donor to that recipient.
// The smallest recipient countries are combined into one "Other" node to keep the chart readable.
// ============================================================

// ------------------------------------------------------------
// Settings
// ------------------------------------------------------------
const TOP_N    = 30;    // number of recipient countries shown individually; the rest become one "Other" node
const ROW      = 14;    // vertical spacing between recipient nodes, in pixels
const GAP      = 20;    // extra vertical space between the groups of recipients
const X_DONOR  = 0;     // x position of the donor column (inside the plot area)
const X_RECIP  = 330;   // x position of the recipient column (inside the plot area)
const R_MAX    = 8;     // radius of the largest node, in pixels
const W_MAX    = 10;    // stroke width of the largest link, in pixels
const margin = { top: 130, right: 190, bottom: 20, left: 120 };   // space around the plot for title, legend and labels

// Same binned sequential color scale as the matrix, used for the links
const binEdges  = [1e4, 1e5, 1e6, 1e7];                                       // bin boundaries: 10K, 100K, 1M, 10M
const binColors = ["#b7d3f6", "#6da7ec", "#2a78d6", "#1c5cab", "#0d366b"];    // 5 blues, lightest = smallest amounts
const binLabels = ["< 10K", "10K – 100K", "100K – 1M", "1M – 10M", "≥ 10M"];  // legend text for each bin
const color = d3.scaleThreshold().domain(binEdges).range(binColors);          // maps an amount to its bin's color

const NODE_COLOR     = "#3d3d3a";   // dark gray: donors and recipient countries
const NODE_COLOR_REG = "#a8a69f";   // light gray: regional / unspecified recipients

// ------------------------------------------------------------
// Load the data, then draw everything inside the callback
// ------------------------------------------------------------
d3.json("aid_network.json").then(data => {   // fetch the JSON file; .then runs once it has loaded
  const donors = data.donors;   // array of {name, total}, already sorted by total given (largest first)

  // ---------- Aggregate the long tail of small recipient countries ----------
  const countries = data.recipients.filter(r => r.type === "country");   // recipient countries, sorted by total received
  const regional  = data.recipients.filter(r => r.type !== "country");   // regional / unspecified recipients, sorted by total
  const topCountries = countries.slice(0, TOP_N);                        // the first 30 countries are shown individually
  const tail         = countries.slice(TOP_N);                           // every country after that goes into "Other"

  const OTHER = `Other ${tail.length} countries`;                                        // name of the combined node, e.g. "Other 87 countries"
  const otherNode = { name: OTHER, type: "other", total: d3.sum(tail, r => r.total) };   // the combined node; its total is the sum of the tail

  // Recipients shown, top to bottom: top countries, "Other", regional/unspecified
  const recipients = [...topCountries, otherNode, ...regional];   // the final list of recipient nodes, in display order

  // Re-point every link that goes to a tail country at "Other", then sum per donor -> recipient
  const tailNames = new Set(tail.map(r => r.name));                // a set of tail country names, for fast "is this in the tail?" checks
  const links = d3.flatRollup(                                     // group the links and sum each group
      data.links,                                                  // input: all 366 original links
      v => d3.sum(v, d => d.amount),                               // what to compute per group: the total amount
      d => d.source,                                               // group key 1: the donor
      d => tailNames.has(d.target) ? OTHER : d.target              // group key 2: the recipient, or "Other" if it is a tail country
    ).map(([source, target, amount]) => ({ source, target, amount }));   // flatRollup returns [donor, recipient, sum] arrays; turn them into objects

  // ---------- Positions ----------
  // Recipients: one row each, with a gap before "Other" and before the regional band
  const group  = r => r.type === "country" ? 0 : r.type === "other" ? 1 : 2;   // which group a recipient is in: 0 = country, 1 = other, 2 = regional
  const recipY = new Map(recipients.map((r, i) => [r.name, i * ROW + ROW / 2 + group(r) * GAP]));   // lookup table: recipient name -> y position (row x spacing, plus one GAP per group above it)
  const height = recipients.length * ROW + 2 * GAP;                            // plot height = all rows + the two gaps

  // Donors: spread evenly over the same height
  const donorY = d3.scalePoint()           // a point scale places categories at evenly spaced points
    .domain(donors.map(d => d.name))       // the categories: donor names, in sorted order
    .range([ROW / 2, height - ROW / 2]);   // spread them from the top row to the bottom row of the recipient column

  // ---------- Size scales ----------
  // Node AREA proportional to total amount -> square-root scale on the radius
  const maxTotal = d3.max([...donors, ...recipients], d => d.total);   // largest total of any node (Germany)
  const rScale = d3.scaleSqrt().domain([0, maxTotal]).range([0, R_MAX]);   // square-root scale: doubling the amount doubles the circle's area, not its radius
  const radius = v => Math.max(1.5, rScale(v));                        // never smaller than 1.5px, so tiny nodes stay visible

  // Link width: square-root scale so small flows stay visible next to huge ones
  const wScale = d3.scaleSqrt().domain([0, d3.max(links, d => d.amount)]).range([0, W_MAX]);   // largest link gets W_MAX pixels
  const linkWidth = v => Math.max(0.5, wScale(v));                     // never thinner than 0.5px, so small links stay visible

  // ---------- SVG ----------
  const svg = d3.select("#chart").append("svg")              // find <div id="chart"> in the HTML and add an <svg> inside it
    .attr("width",  margin.left + X_RECIP + margin.right)    // total SVG width = left margin + distance between the columns + right margin
    .attr("height", margin.top + height + margin.bottom)     // total SVG height = top margin + plot + bottom margin
    .attr("font-size", 10);                                  // default font size for all text inside the SVG

  svg.append("text").attr("x", 10).attr("y", 22)             // add a <text> element near the top-left corner
    .attr("font-size", 15).attr("font-weight", 600)          // make it larger and bold
    .text("Aid flows from donors to recipients");            // the title text
  svg.append("text").attr("x", 10).attr("y", 40).attr("font-size", 11).attr("fill", "#6b6a66")   // a smaller gray subtitle under the title
    .text(`1991–2010, summed per pair. Top ${TOP_N} recipient countries shown; the other ${tail.length} are combined.`);   // subtitle text, filled in from the settings

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);   // a group <g> shifted by the margins; the plot is drawn inside it

  // 1) Links: curved paths from donor (left) to recipient (right).
  //    Sorted small -> large so the biggest flows are drawn on top.
  const linkPath = d3.linkHorizontal()                          // a generator that draws a smooth S-curve between two points
    .source(d => [X_DONOR, donorY(d.source)])                   // start point: the donor's [x, y]
    .target(d => [X_RECIP, recipY.get(d.target)]);              // end point: the recipient's [x, y]

  g.append("g")                                                 // a group for all the links (drawn first, so nodes sit on top)
      .attr("fill", "none")                                     // paths are lines only; without this SVG would fill the curve's shape black
    .selectAll("path")                                          // select all (not yet existing) paths in the group
    .data(links.slice().sort((a, b) => a.amount - b.amount))    // bind the links, sorted smallest first (slice() copies so the original order is kept)
    .join("path")                                               // create one <path> per link
      .attr("d", linkPath)                                      // the curve's shape, from the link generator
      .attr("stroke", d => color(d.amount))                     // line color from the binned amount
      .attr("stroke-width", d => linkWidth(d.amount))           // line width from the square-root scale
      .attr("stroke-opacity", 0.8);                             // slightly see-through so crossing lines stay visible

  // 2) Donor nodes + labels (left column)
  const donorNode = g.append("g").selectAll("g")                               // a group for donors; select all (not yet existing) per-donor groups
    .data(donors)                                                              // bind one donor to each group
    .join("g")                                                                 // create one <g> per donor (holds its circle and label)
      .attr("transform", d => `translate(${X_DONOR}, ${donorY(d.name)})`);     // move the group to the donor's position, so its contents can use (0,0)
  donorNode.append("circle")                     // add a circle to each donor group
    .attr("r", d => radius(d.total))             // radius from the donor's total given
    .attr("fill", NODE_COLOR)                    // dark gray fill
    .attr("stroke", "#fff");                     // white outline to separate the circle from the links behind it
  donorNode.append("text")                       // add a label to each donor group
    .attr("x", -R_MAX - 5)                       // to the left of the circle, clear of even the biggest one
    .attr("text-anchor", "end")                  // right-align so the text ends just before the circle
    .attr("dominant-baseline", "middle")         // center the text vertically on the circle
    .text(d => d.name);                          // the donor's name

  // 3) Recipient nodes + labels (right column)
  const recipNode = g.append("g").selectAll("g")                                    // a group for recipients; select all (not yet existing) per-recipient groups
    .data(recipients)                                                               // bind one recipient to each group
    .join("g")                                                                      // create one <g> per recipient
      .attr("transform", d => `translate(${X_RECIP}, ${recipY.get(d.name)})`);      // move the group to the recipient's position
  recipNode.append("circle")                                                                          // add a circle to each recipient group
    .attr("r", d => radius(d.total))                                                                  // radius from the recipient's total received
    .attr("fill", d => d.type === "country" ? NODE_COLOR : d.type === "other" ? "#fff" : NODE_COLOR_REG)   // dark for countries, white (hollow) for "Other", light gray for regional
    .attr("stroke", d => d.type === "other" ? NODE_COLOR : "#fff")                                    // dark outline for "Other", white outline otherwise
    .attr("stroke-dasharray", d => d.type === "other" ? "2 2" : null);                                // dashed outline marks "Other" as a combined group
  recipNode.append("text")                                         // add a label to each recipient group
    .attr("x", R_MAX + 5)                                          // to the right of the circle, clear of even the biggest one
    .attr("dominant-baseline", "middle")                           // center the text vertically on the circle
    .attr("font-style", d => d.type === "country" ? null : "italic")   // italic for "Other" and regional/unspecified
    .text(d => d.type === "other" ? `${d.name} (each < ${d3.format(".3~s")(topCountries[TOP_N - 1].total)})` : d.name);   // name; "Other" also says each is below the 30th country's total

  // 4) Column headers and band label
  g.append("text").attr("x", X_DONOR - R_MAX - 5).attr("y", -14)   // "Donors" header above the donor labels
    .attr("text-anchor", "end").attr("font-size", 11).attr("font-weight", 600)   // right-aligned with the donor labels, bold
    .text("Donors");                                               // header text
  g.append("text").attr("x", X_RECIP + R_MAX + 5).attr("y", -14)   // "Recipients" header above the recipient labels
    .attr("font-size", 11).attr("font-weight", 600)                // bold
    .text("Recipients");                                           // header text
  g.append("text").attr("x", X_RECIP + R_MAX + 5)                  // band label, lined up with the recipient labels
    .attr("y", recipY.get(regional[0].name) - ROW / 2 - GAP / 2)   // placed in the middle of the gap just above the first regional row
    .attr("dominant-baseline", "middle").attr("font-style", "italic").attr("fill", "#6b6a66")   // vertically centered, italic, gray
    .text("Regional and unspecified");                             // band label text

  // 5) Legend: link color/width per bin, and node size/type
  const legend = svg.append("g").attr("transform", "translate(10, 64)");   // a group for the legend, positioned under the subtitle

  legend.append("text").attr("font-size", 11).attr("font-weight", 600).text("Link: amount");   // title of the link legend row
  const sampleAmounts = [3e3, 3e4, 3e5, 3e6, 3e7];   // one example amount inside each bin, used to size the sample lines
  const linkItem = legend.selectAll("g.link-item")                     // select all (not yet existing) link legend items
    .data(binLabels)                                                   // bind the 5 bin labels
    .join("g")                                                         // create one <g> per bin
      .attr("class", "link-item")                                      // give it a class so the selectAll above matches it
      .attr("transform", (d, i) => `translate(${95 + i * 92}, -4)`);   // lay the items out left to right, 92px apart
  linkItem.append("line")                                              // a short sample line for each bin
    .attr("x2", 22)                                                    // 22px long (it starts at x = 0)
    .attr("stroke", (d, i) => binColors[i])                            // the bin's color
    .attr("stroke-width", (d, i) => linkWidth(sampleAmounts[i]));      // the width a link of that size would have
  linkItem.append("text").attr("x", 27).attr("dominant-baseline", "middle").text(d => d);   // the bin label to the right of the line

  legend.append("text").attr("y", 30).attr("font-size", 11).attr("font-weight", 600).text("Node: total amount");   // title of the node legend row
  const nodeSamples = [1e6, 1e7, 1e8];                                 // example totals: 1M, 10M, 100M
  const nodeItem = legend.selectAll("g.node-item")                     // select all (not yet existing) node legend items
    .data(nodeSamples)                                                 // bind the 3 example totals
    .join("g")                                                         // create one <g> per example
      .attr("class", "node-item")                                      // give it a class so the selectAll above matches it
      .attr("transform", (d, i) => `translate(${140 + i * 64}, 26)`);  // lay them out left to right, 64px apart
  nodeItem.append("circle").attr("r", d => radius(d)).attr("fill", NODE_COLOR);   // a circle sized with the same scale as the real nodes
  nodeItem.append("text").attr("x", R_MAX + 4).attr("dominant-baseline", "middle")   // label to the right of the circle
    .text(d => d3.format("~s")(d).replace("G", "B"));                  // format 1000000 as "1M" (d3 uses "G" for billions, so swap it for "B")
  legend.append("circle").attr("cx", 344).attr("cy", 26).attr("r", 4).attr("fill", NODE_COLOR_REG);   // light gray sample circle
  legend.append("text").attr("x", 352).attr("y", 26).attr("dominant-baseline", "middle")              // its label, to the right
    .attr("font-style", "italic").text("regional / unspecified");                                     // italic, like the real labels
  legend.append("circle").attr("cx", 480).attr("cy", 26).attr("r", 4)                                // hollow dashed sample circle
    .attr("fill", "#fff").attr("stroke", NODE_COLOR).attr("stroke-dasharray", "2 2");                 // same style as the "Other" node
  legend.append("text").attr("x", 488).attr("y", 26).attr("dominant-baseline", "middle")              // its label, to the right
    .attr("font-style", "italic").text("combined countries");                                         // italic, like the "Other" label
});   // end of d3.json(...).then
