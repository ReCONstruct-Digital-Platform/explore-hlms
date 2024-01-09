
function showLoading() {
    document.getElementById('loader').style.display = 'block';
}

function hideLoading() {
    document.getElementById('loader').style.display = 'none';
}

function updateBounds(map) {
    let bounds = map.getBounds();
    document.getElementById("bounds_indicator").innerHTML =
        `bounds:<br>&nbsp;` +
        `NE:${bounds._ne.lng.toFixed(6)} ${bounds._ne.lat.toFixed(
            6
        )}<br>&nbsp;` +
        `SW:${bounds._sw.lng.toFixed(6)} ${bounds._sw.lat.toFixed(6)}`;
}

/**
 * Check if the A bounds fully contain the B bounds.
 * For this we check the south west and north east corners of B
 * for inclusion in A.
 */
function boundsAContainB(A, B) {
    if (!A || !B) return false;
    // Check if new bounds are within last rendered bounds
    if (!A.contains(B.getSouthWest())) return false;
    if (!A.contains(B.getNorthEast())) return false;
    return true;
}

// https://www.trysmudford.com/blog/linear-interpolation-functions/
const interpolate = (x, y, a) => {
    return x * (1 - a) + y * a;
}


/** 
 * Create a custom SVG element for our cluster markers
 * They show the cluster name, number of HLMs and number of dwellings
 * as well as the distribution of disrepair states of hlms within.
 * 
 * From https://docs.mapbox.com/mapbox-gl-js/example/cluster-html/ 
*/
function createClusterMarkerElement(name, ivpCounts, clusterValue, num_hlms, num_dwellings) {
    
    const counts = []
    const categories = ['A', 'B', 'C', 'D', 'E'];
    categories.forEach(k => {
        counts.push(ivpCounts[k] ? ivpCounts[k] : 0)
    });
    const total = counts.reduce((a, b) => a + b);   
    
    // Adjust the box width based on the name length
    const boxW = Math.max(name.length * 7 + 20, 125);

    let html = `
    <svg viewBox="0 0 ${boxW} 67" width="${boxW}" height="67">
        <rect width="${boxW}" height="67" x="0" y="0" fill="white" style="opacity: .75;" />
        <text font-size="12" text-fill="black" text-anchor="start" x="5" y='12'>
            <tspan font-size="13" x='5' dy='0'>${name}</tspan>
            <tspan x='5' dy='16'>${num_hlms.toLocaleString()} HLMs</tspan>
            <tspan x='5' dy='16'>${num_dwellings.toLocaleString()} dwellings</tspan>
        </text>
    `
    const width = boxW - 13;
    let xOffset = 5;
    for (let i = 0; i < counts.length; i++) {
        const count = counts[i];
        const frac = count / total;
        const subW = Math.ceil(width * frac);
        html += `
            <rect width="${subW}" height="12" x="${xOffset}" y="50" fill="${ivpColors[i]}" />
        `
        xOffset += subW;
    }
    html += `</svg>`;

    const el = document.createElement("div");
    el.innerHTML = html;
    return el;
}

// code for creating an SVG donut chart from feature properties
// From https://docs.mapbox.com/mapbox-gl-js/example/cluster-html/ 
function createPieChart(name, ivpCounts, clusterValue, num_hlms, num_dwellings) {
    const offsets = [];
    const counts = []
    const categories = ['A', 'B', 'C', 'D', 'E'];
    categories.forEach(k => {
        counts.push(ivpCounts[k] ? ivpCounts[k] : 0)
    });

    total = 0
    for (const count of counts) {
        offsets.push(total);
        total += count;
    }

    const fontSize = 
        num_dwellings >= 1000 ? 20 : 
        num_dwellings >= 100 ? 18 : 
        num_dwellings >= 10 ? 16 :
        14;

    // Radius of the marker as a function of the number of dwellings in the cluster
    const r = 
        num_dwellings >= 10_000 ? 40 : 
        num_dwellings >= 1000 ? interpolate(35, 40, (num_dwellings - 1000) / 9000) : 
        num_dwellings >= 200 ? interpolate(23, 35, (num_dwellings - 200) / 1000) : 
        interpolate(16, 23, num_dwellings / 200);

    const w = r * 2;

    // Increase r0 to show an inner circle in the pie chart - a donut chart if you will
    const r0 = 0;

    let html = `<div>
        <svg width="${w}" height="${w}" viewbox="0 0 ${w} ${w}" 
            text-anchor="middle" style="font: ${fontSize}px sans-serif; display: block";>`;

    for (let i = 0; i < counts.length; i++) {
        html += donutSegment(
            offsets[i] / num_hlms,
            (offsets[i] + counts[i]) / num_hlms,
            r,
            r0,
            ivpColors[i]
        );
    }

    const value = clusterValue === 'dwellings' ? num_dwellings : num_hlms;
    // Format the value to be displayed
    const displayValue = value > 1000 ? (value / 1000).toFixed(1).toLocaleString() + 'K' : value.toLocaleString()

    html += `<circle cx="${r}" cy="${r}" r="${r0}" fill="white" style="opacity: .5;"/>
        <text dominant-baseline="central" transform="translate(${r}, ${r})">
        ${displayValue}
        </text>
        </svg>
    </div>`;

    const el = document.createElement("div");
    el.innerHTML = html;
    return el.firstChild;
}

function donutSegment(start, end, r, r0, color) {
    if (end - start === 1) end -= 0.00001;
    const a0 = 2 * Math.PI * (start - 0.25);
    const a1 = 2 * Math.PI * (end - 0.25);
    const x0 = Math.cos(a0),
        y0 = Math.sin(a0);
    const x1 = Math.cos(a1),
        y1 = Math.sin(a1);
    const largeArc = end - start > 0.5 ? 1 : 0;

    // draw an SVG path
    return `<path d="M ${r + r0 * x0} ${r + r0 * y0} L 
        ${r + r * x0}  ${r + r * y0} A ${r} ${r} 0 ${largeArc} 1 ${r + r * x1} ${r + r * y1} L 
        ${r + r0 * x1} ${r + r0 * y1} A ${r0} ${r0} 0 ${largeArc} 0 ${r + r0 * x0} ${r + r0 * y0}" 
        fill="${color}" style="opacity: .85;"/>`;
}
