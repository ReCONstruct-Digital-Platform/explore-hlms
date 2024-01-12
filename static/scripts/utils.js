
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


function createSVGHistograms(data) {
    const {id, name, ivps} = data;

    const ivpCountsDwellings = {
        'A': 0,
        'B': 0,
        'C': 0,
        'D': 0,
        'E': 0,
    };
    const ivpCountsHLMs = {
        'A': 0,
        'B': 0,
        'C': 0,
        'D': 0,
        'E': 0,
    };
    
    ivps.forEach(entry => {
        const {dwel: dwellings, s: ivpCategory} = entry;
        ivpCountsHLMs[ivpCategory] += 1
        ivpCountsDwellings[ivpCategory] += dwellings;
    })
    const countsHLMs = Object.values(ivpCountsHLMs);
    const totalHLMs = ivps.length;
    const countsDwellings = Object.values(ivpCountsDwellings);
    const totalDwellings = countsDwellings.reduce((a,b) => a + b);

    // Adjust the box width based on the name length
    const boxWidth = Math.max(name.length * 7 + 25, 125);
    const boxHeight = 50;
    

    let histogramHLMs = `
    <svg viewBox="0 0 ${boxWidth} ${boxHeight}" width="${boxWidth}" height="${boxHeight}">
    <rect width="${boxWidth}" height="${boxHeight}" x="0" y="0" fill="white" style="opacity: .75;" />`

    histogramHLMs += (clusterValue === 'hlms') ? ` HLMs</text>` : ` habitations </text>`;
    
    let xOffset = 5;
    const maxBarHeight = 50;

    counts.forEach((count, i) => {
        const frac = count / total;
        const subW = Math.ceil(maxBarHeight * frac);
        histogramHLMs += `<rect width="${subW}" height="12" x="${xOffset}" y="34" fill="${ivpColors[i]}" />`
        xOffset += subW;
    });

    histogramHLMs += `</text></svg>`;

    const el = document.createElement("div");
    el.innerHTML = histogramHLMs;
    return el;

}


/** 
 * Create a custom SVG element for our cluster markers
 * They show the cluster name, number of HLMs and number of dwellings
 * as well as the distribution of disrepair states of hlms within.
 * 
 * From https://docs.mapbox.com/mapbox-gl-js/example/cluster-html/ 
*/
function createClusterBoxElement(name, ivps, clusterValue) {
    
    const ivpCounts = {
        'A': 0,
        'B': 0,
        'C': 0,
        'D': 0,
        'E': 0,
    };
    
    ivps.forEach(entry => {
        const {dwel: dwellings, s: ivpCategory} = entry;
        // If we're counting hlms, add 1 for each entry
        // else add the number of dwellings to the category total
        clusterValue === 'hlms' ? ivpCounts[ivpCategory] += 1
            : ivpCounts[ivpCategory] += dwellings;
    })
    const counts = Object.values(ivpCounts);
    const total = counts.reduce((a,b) => a + b);
    
    // Adjust the box width based on the name length
    const boxWidth = Math.max(name.length * 7 + 25, 125);
    const boxHeight = 50;
    
    let html = `
    <svg viewBox="0 0 ${boxWidth} ${boxHeight}" width="${boxWidth}" height="${boxHeight}">
    <rect width="${boxWidth}" height="${boxHeight}" x="0" y="0" fill="white" style="opacity: .75;" />
    <text font-size="15" text-fill="black" text-anchor="start" x="5" y='14'>${name}</text>
    <text font-size="14" text-fill="black" text-anchor="start" x='5' y='30'>${total.toLocaleString()}`

    html += (clusterValue === 'hlms') ? ` HLMs</text>` : ` habitations </text>`;
    
    let xOffset = 5;
    const barWidth = boxWidth - 13;

    counts.forEach((count, i) => {
        const frac = count / total;
        const subW = Math.ceil(barWidth * frac);
        html += `<rect width="${subW}" height="12" x="${xOffset}" y="34" fill="${ivpColors[i]}" />`
        xOffset += subW;
    });

    html += `</text></svg>`;

    const el = document.createElement("div");
    el.innerHTML = html;
    return el;
}


/**
 * Creating an SVG pie chart for the cluster
 * From https://docs.mapbox.com/mapbox-gl-js/example/cluster-html/ 
 */ 
function createPieChart(name, ivps, clusterValue) {
    const ivpCounts = {
        'A': 0,
        'B': 0,
        'C': 0,
        'D': 0,
        'E': 0,
    };
    
    ivps.forEach(entry => {
        const {dwel: dwellings, s: ivpCategory} = entry;
        // If we're counting hlms, add 1 for each entry
        // else add the number of dwellings to the category total
        clusterValue === 'hlms' ? ivpCounts[ivpCategory] += 1
            : ivpCounts[ivpCategory] += dwellings;
    })
    const counts = Object.values(ivpCounts);
    
    
    // Push a rolling total to offsets to draw the pie chart
    const offsets = [];
    total = 0
    for (const count of counts) {
        offsets.push(total);
        total += count;
    }
    const value = total;
    const fontSize = 16;

    // Adjust the box width based on the name length
    const boxWidth = Math.max(name.length * 7 + 20, 125);

    // Radius of the marker scales based on the value
    var r;
    if (clusterValue === 'dwellings') {
        r = value >= 10_000 ? 40
            : value >= 1000 ? interpolate(35, 40, (value - 1000) / 9000)
            : value >= 200 ? interpolate(23, 35, (value - 200) / 1000) 
            : interpolate(16, 23, value / 200);
    }
    else {
        r = value >= 300 ? 40
            : value >= 100 ? interpolate(35, 40, (value - 100) / 300)
            : value >= 50 ? interpolate(23, 35, (value - 50) / 100) 
            : interpolate(16, 23, value / 20);
    }

    const boxHeight = r * 2 + 25;

    // Increase r0 to show an inner circle in the pie chart - a donut chart if you will
    const r0 = 0;

    let html = `<div>
        <svg width="${boxWidth}" height="${boxHeight}" viewbox="0 0 ${boxWidth} ${boxHeight}" 
            text-anchor="middle" style="font: ${fontSize}px sans-serif; display: block";>
            <text font-size="14" text-fill="black" text-anchor="middle" x="50%" y='12'>
                <tspan>${name}</tspan>
            </text>
            <g transform="translate(${boxWidth / 2 - r}, 20)">
        `;

    for (let i = 0; i < counts.length; i++) {
        html += donutSegment(
            offsets[i] / value,
            (offsets[i] + counts[i]) / value,
            r,
            r0,
            ivpColors[i]
        );
    }

    // Format the value to be displayed
    const displayValue = value > 1000 ? (value / 1000).toFixed(1).toLocaleString() + 'K' : value.toLocaleString()

    html += `<circle cx="${r}" cy="${r}" r="${r0}" fill="white" style="opacity: .5;"/>
            <text dominant-baseline="central" transform="translate(${r}, ${r})">
            ${displayValue}
            </text>
        </g>
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
