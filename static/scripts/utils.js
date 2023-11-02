
function updateBounds(map) {
    let bounds = map.getBounds()
    document.getElementById('bounds_indicator').innerHTML = 
        `bounds:<br>&nbsp;` +
        `NE:${bounds._ne.lng.toFixed(6)} ${bounds._ne.lat.toFixed(6)}<br>&nbsp;` +
        `SW:${bounds._sw.lng.toFixed(6)} ${bounds._sw.lat.toFixed(6)}`;
}
