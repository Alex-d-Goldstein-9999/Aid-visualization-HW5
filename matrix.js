// ============================================================
// Adjacency matrix: donors (columns) x recipients (rows)
// Each cell is colored by the total aid from that donor to that recipient.
// ============================================================

// ------------------------------------------------------------
// Settings
// ------------------------------------------------------------
const CELL = 12;   // width and height of one matrix cell, in pixels
const GAP  = 22;   // extra vertical space between the country rows and the regional/unspecified rows
const margin = { top: 170, right: 30, bottom: 20, left: 190 };   // space around the grid for title, labels and legend

// Sequential color scale, binned by powers of 10 (one hue, light -> dark)
const binEdges  = [1e4, 1e5, 1e6, 1e7];                                       // bin boundaries: 10K, 100K, 1M, 10M
const binColors = ["#b7d3f6", "#6da7ec", "#2a78d6", "#1c5cab", "#0d366b"];    // 5 blues, lightest = smallest amounts
const binLabels = ["< 10K", "10K – 100K", "100K – 1M", "1M – 10M", "≥ 10M"];  // legend text for each bin
const EMPTY     = "#eeede9";   // light gray for cells where a donor gave nothing to a recipient

const color = d3.scaleThreshold()   // a threshold scale maps a number to a bin (not a smooth gradient)
  .domain(binEdges)                 // the 4 boundaries split all values into 5 bins
  .range(binColors);                // each bin gets one of the 5 colors (e.g. color(250000) -> "#2a78d6")

// ------------------------------------------------------------
// Load the data, then draw everything inside the callback
// ------------------------------------------------------------
d3.json("aid_network.json").then(data => {   // fetch the JSON file; .then runs once it has loaded
  const donors     = data.donors;      // array of {name, total}, already sorted by total given (largest first)
  const recipients = data.recipients;  // array of {name, type, total}: countries by total received, then regional/unspecified
  const links      = data.links;       // array of {source, target, amount, records}: one per donor -> recipient pair

  const nCountries = recipients.filter(r => r.type === "country").length;   // how many rows are real countries (used to place the gap)
  const width  = donors.length * CELL;                                      // grid width = number of donor columns x cell size
  const height = recipients.length * CELL + GAP;                            // grid height = number of recipient rows x cell size + the gap

  // ---------- Scales / positions ----------
  // x: one column per donor
  const x = d3.scaleBand()               // a band scale divides a range into equal slots, one per category
    .domain(donors.map(d => d.name))     // the categories: donor names, in sorted order
    .range([0, width]);                  // spread them from 0 to the grid width, so x("Germany") = 0, x("United States") = 12, ...

  // y: one row per recipient, plus a gap before the regional/unspecified band
  const rowIndex = new Map(recipients.map((r, i) => [r.name, i]));   // lookup table: recipient name -> row number (0, 1, 2, ...)
  const y = name => {                                                // function that turns a recipient name into a y pixel position
    const i = rowIndex.get(name);                                    // find the row number for this recipient
    return i * CELL + (i >= nCountries ? GAP : 0);                   // row number x cell size, shifted down by GAP for regional rows
  };                                                                 // end of y()

  // ---------- SVG ----------
  const svg = d3.select("#chart").append("svg")              // find <div id="chart"> in the HTML and add an <svg> inside it
    .attr("width",  margin.left + width + margin.right)      // total SVG width = left margin + grid + right margin
    .attr("height", margin.top + height + margin.bottom)     // total SVG height = top margin + grid + bottom margin
    .attr("font-size", 10);                                  // default font size for all text inside the SVG

  // Title
  svg.append("text").attr("x", 10).attr("y", 22)              // add a <text> element near the top-left corner
    .attr("font-size", 15).attr("font-weight", 600)           // make it larger and bold
    .text("Total aid from each donor to each recipient");     // the title text
  svg.append("text").attr("x", 10).attr("y", 40).attr("font-size", 11).attr("fill", "#6b6a66")   // a smaller gray subtitle under the title
    .text("1991–2010, summed per pair. Rows and columns sorted by total amount.");                // the subtitle text

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);   // a group <g> shifted by the margins; the grid is drawn inside it, so (0,0) = top-left cell

  // 1) Background: an empty gray cell for every possible donor–recipient pair
  g.append("g").selectAll("rect")             // add a group for the background cells, and select all (not yet existing) rects in it
    .data(d3.cross(recipients, donors))       // bind data: d3.cross makes every [recipient, donor] combination (129 x 25 = 3,225 pairs)
    .join("rect")                             // create one <rect> per pair (the "data join")
      .attr("x", ([r, d]) => x(d.name))       // column position comes from the donor
      .attr("y", ([r, d]) => y(r.name))       // row position comes from the recipient
      .attr("width",  CELL - 1)               // 1px smaller than the cell so a thin white grid line shows between cells
      .attr("height", CELL - 1)               // same for the height
      .attr("fill", EMPTY);                   // fill with light gray = "no aid"

  // 2) One colored cell per link (donor -> recipient)
  g.append("g").selectAll("rect")             // a second group, drawn after (= on top of) the gray background
    .data(links)                              // bind data: one entry per donor -> recipient pair that actually has aid (366)
    .join("rect")                             // create one <rect> per link
      .attr("x", d => x(d.source))            // column of the donor (source)
      .attr("y", d => y(d.target))            // row of the recipient (target)
      .attr("width",  CELL - 1)               // same size as the background cell it covers
      .attr("height", CELL - 1)               // same size as the background cell it covers
      .attr("fill", d => color(d.amount));    // fill color from the binned amount

  // 3) Row labels (recipients); regional/unspecified ones in italics
  g.append("g").selectAll("text")                                     // a group for the row labels
    .data(recipients)                                                 // bind one recipient to each label
    .join("text")                                                     // create one <text> per recipient
      .attr("x", -6)                                                  // 6px to the left of the grid
      .attr("y", r => y(r.name) + CELL / 2)                           // vertically at the middle of that recipient's row
      .attr("text-anchor", "end")                                     // right-align the text so it ends at x = -6
      .attr("dominant-baseline", "middle")                            // center the text vertically on y
      .attr("font-style", r => r.type === "country" ? null : "italic") // italic for regional/unspecified, normal for countries
      .text(r => r.name);                                             // the recipient's name

  // 4) Column labels (donors), rotated
  g.append("g").selectAll("text")                                                     // a group for the column labels
    .data(donors)                                                                     // bind one donor to each label
    .join("text")                                                                     // create one <text> per donor
      .attr("transform", d => `translate(${x(d.name) + CELL / 2}, -6) rotate(-90)`)   // move to the column's center, 6px above the grid, then rotate to read bottom-to-top
      .attr("dominant-baseline", "middle")                                            // center the text on the column
      .text(d => d.name);                                                             // the donor's name

  // 5) Axis titles and band label
  g.append("text").attr("x", 0).attr("y", -100)                  // "Donors →" above the rotated column labels
    .attr("font-size", 11).attr("font-weight", 600)              // slightly larger, bold
    .text("Donors →");                                           // the axis title text
  g.append("text").attr("x", -6).attr("y", -6)                   // "Recipients ↓" just above the first row label
    .attr("text-anchor", "end").attr("font-size", 11).attr("font-weight", 600)   // right-aligned with the row labels, bold
    .text("Recipients ↓");                                       // the axis title text
  g.append("text").attr("x", 0).attr("y", nCountries * CELL + GAP / 2 + 1)        // placed in the middle of the gap between the two row groups
    .attr("dominant-baseline", "middle").attr("font-style", "italic").attr("fill", "#6b6a66")   // vertically centered, italic, gray
    .text("Regional and unspecified recipients");                // the band label text

  // 6) Legend (top-left corner)
  const legend = svg.append("g").attr("transform", "translate(10, 66)");   // a group for the legend, positioned under the subtitle
  legend.append("text").attr("font-size", 11).attr("font-weight", 600).text("Total amount");   // legend title
  const items = binLabels.map((label, i) => ({ label, fill: binColors[i] }))   // turn the 5 bins into {label, fill} objects
    .concat([{ label: "No aid", fill: EMPTY }]);                                // and add a 6th item for the gray "no aid" cells
  const row = legend.selectAll("g.item")                                        // select all (not yet existing) legend rows
    .data(items)                                                                // bind the 6 legend items
    .join("g")                                                                  // create one <g> per item
      .attr("class", "item")                                                    // give it a class so the selectAll above matches it
      .attr("transform", (d, i) => `translate(0, ${10 + i * 14})`);             // stack the rows 14px apart below the title
  row.append("rect").attr("width", CELL - 1).attr("height", CELL - 1).attr("fill", d => d.fill);   // a color swatch the same size as a matrix cell
  row.append("text").attr("x", CELL + 5).attr("y", CELL / 2)                    // the label, just to the right of the swatch
    .attr("dominant-baseline", "middle").text(d => d.label);                    // vertically centered on the swatch, showing the bin text
});   // end of d3.json(...).then
