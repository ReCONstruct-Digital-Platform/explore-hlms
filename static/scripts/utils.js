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
    return x * (1 - a) + y * a;}


// code for creating an SVG donut chart from feature properties
// From https://docs.mapbox.com/mapbox-gl-js/example/cluster-html/ 
function createDonutChart(props, colors) {
    const offsets = [];
    const counts = [props.ivpA, props.ivpB, props.ivpC, props.ivpD, props.ivpE];

    total = 0
    for (const count of counts) {
        offsets.push(total);
        total += count;
    }

    const num_dwellings = props.num_dwellings
    const fontSize = 
        num_dwellings >= 1000 ? 22 : 
        num_dwellings >= 100 ? 20 : 
        num_dwellings >= 10 ? 18 :
        16;
    
    const r = 
        num_dwellings >= 10_000 ? 60 : 
        num_dwellings >= 1000 ? interpolate(40, 60, (num_dwellings - 1000) / 9000) : 
        num_dwellings >= 200 ? interpolate(28, 40, (num_dwellings - 200) / 1000) : 
        interpolate(18, 28, num_dwellings / 200);

    // const r = total_hlms >= 1000 ? 80 : total_hlms >= 100 ? interpolate(50, 80, (total_hlms - 100) / 900) : 
    //     total_hlms >= 40 ? interpolate(32, 50, (total_hlms - 40) / 60) : interpolate(18, 24, total_hlms / 40);

    const r0 = Math.round(r * 0.6);
    const w = r * 2;

    let html = `<div>
        <svg width="${w}" height="${w}" viewbox="0 0 ${w} ${w}" 
            text-anchor="middle" style="font: ${fontSize}px sans-serif; display: block";>`;

    for (let i = 0; i < counts.length; i++) {
        html += donutSegment(
            offsets[i] / num_dwellings,
            (offsets[i] + counts[i]) / num_dwellings,
            r,
            r0,
            colors[i]
        );
    }
    html += `<circle cx="${r}" cy="${r}" r="${r0}" fill="white" style="opacity: .5;"/>
        <text dominant-baseline="central" transform="translate(${r}, ${r})">
        ${num_dwellings > 1000 ? (num_dwellings / 1000).toFixed(1).toLocaleString() + 'K' : num_dwellings.toLocaleString()}
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
    return `<path d="M ${r + r0 * x0} ${r + r0 * y0} L ${r + r * x0} ${
        r + r * y0
    } A ${r} ${r} 0 ${largeArc} 1 ${r + r * x1} ${r + r * y1} L ${
        r + r0 * x1
    } ${r + r0 * y1} A ${r0} ${r0} 0 ${largeArc} 0 ${r + r0 * x0} ${
        r + r0 * y0
    }" fill="${color}" style="opacity: .85;"/>`;
}


const hlmPointRadiusInterpolate = [
    "interpolate",
    ["exponential", 1],
    ["get", "num_dwellings"],
    1, 5,
    50, 7,
    100, 12,
    150, 18,
]

const hlmStyles = {
    ivpColorSteps: [
        "step",
        ["get", "ivp"],
        "#198754",
        5.2, "#b1ce3c",
        10, "#ffd147",
        15, "#E86430",
        30, "#de2235",
    ],
    circleRadius: [
        "interpolate", ["linear"], ["zoom"],
        0, ["*", hlmPointRadiusInterpolate, 1 ],
        5, ["*",
        [
            "interpolate",
            ["exponential", 1],
            ["get", "num_dwellings"],
            1, 3,
            50, 12,
            100, 15,
            150, 21,
        ],
        1.1,
    ],
    10, ["*",
        [
            "interpolate",
            ["exponential", 1],
            ["get", "num_dwellings"],
            1, 8,
            50, 12,
            150, 18,
        ],
        1.4,
    ],
    16, ["*", [ "interpolate",
                ["exponential", 1],
                ["get", "num_dwellings"],
                1, 8,
                50, 15,
                100, 20,
                150, 20,
            ], 1,
        ],
    17, 20
],

}
