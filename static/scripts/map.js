
// Load server data
const dataset = document.currentScript.dataset;

var map;
const lastRenderedBounds = {bounds: null};
var hoveredLotId = null;
var clickedLotId = null;

document.addEventListener("DOMContentLoaded", () => {

    mapboxgl.accessToken = dataset.mapboxToken;
    map = new mapboxgl.Map({
        container: 'mapbox',
        style: 'mapbox://styles/mapbox/light-v11',
        center: [-72.55424486768713, 46.772195471242426], // starting position [lng, lat]
        zoom: 5,
        maxZoom: 19,
        projection: 'globe',
        hash: true
    });
    document.map = map;

    // Add the control to the map.
    map.addControl(
        // https://github.com/mapbox/mapbox-gl-geocoder/blob/main/API.md#mapboxgeocoder
        new MapboxGeocoder({
            accessToken: mapboxgl.accessToken,
            mapboxgl: mapboxgl,
            proximity: true,
        })
    );
    // Add zoom and rotation controls to the map.
    map.addControl(new mapboxgl.NavigationControl());
    map.addControl(new mapboxgl.ScaleControl());

    // //DEBUG Stuff
    // // map.showTileBoundaries = true;
    // // map.showOverdraw = true;
    // document.getElementById('zoom_indicator').innerHTML = `zoom: ${map.getZoom().toFixed(2)}`;
    // updateBounds(map)
    // map.on('move', () => {
    //     document.getElementById('zoom_indicator').innerHTML = `zoom: ${map.getZoom().toFixed(2)}`;
    //     updateBounds(map)
    // })


    map.on('load', () => {

        map.addSource('hlms', {
            type: 'geojson',
            data: `${dataset.dataFolder}/hlms.geojson`,
        });
        
        // Add the HLM points layer
        map.addLayer({
            id: 'hlm_point',
            type: 'circle',
            source: 'hlms',
            paint: {
                'circle-radius': {
                    'base': 2,
                    'stops': [
                        [12, 3],
                        [13, 4],
                        [15, 5],
                        [20, 18]
                    ]
                },
                'circle-color': [
                    'step', ['get', 'ivp'],
                    '#198754',
                    5, '#b1ce3c',
                    10, '#ffd147',
                    15, '#E86430',
                    30, '#de2235'
                ]
            },
        }, "road-label-simple");

        // When a click event occurs on a feature in
        map.on('click', 'hlm_point', (e) => {
            console.debug(e);
            const coordinates = e.features[0].geometry.coordinates.slice();
            const {id, lot_address, ivp, hlm_addresses, num_dwellings} = e.features[0].properties;
            
            const hlm_address_json = JSON.parse(hlm_addresses)
            
            // Ensure that if the map is zoomed out such that
            // multiple copies of the feature are visible, the
            // popup appears over the copy being pointed to.
            while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
                coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
            }

            new mapboxgl.Popup()
                .setLngLat(coordinates)
                .setHTML(
                    `${lot_address}<br/>` +
                    `Avg IVP: ${ivp}<br/>` +
                    `${num_dwellings} dwellings<br/>` +
                    `${hlm_address_json.length} HLM${hlm_address_json.length > 1 ? 's' : ''}: ${hlm_address_json}<br/>`
                )
                .addTo(map);
        });

        map.on('mouseenter', 'hlm_point', () => {
            map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'hlm_point', () => {
            map.getCanvas().style.cursor = '';
        });
        
        renderLots(map, lastRenderedBounds);
    });
    
    // Check if we need to re-render the lots on move end
    map.on('moveend', (e) => {
        console.debug(e);
        renderLots(map, lastRenderedBounds);
    })
});


const clickHandler = (e) => {
    // Toggle styles on the lot to shows it's selected
    if (e.features.length > 0) {
        if (clickedLotId !== null) {
            map.setFeatureState(
                { source: "lots", id: clickedLotId },
                { clicked: false }
            );
        }
        clickedLotId = e.features[0].id;
        map.setFeatureState(
            { source: "lots", id: clickedLotId },
            { clicked: true }
        );
    }
    const geometry = e.features[0].geometry;
    console.debug(geometry);

    fetch(dataset.fetchLotInfoUrl, {
        method: "POST",
        mode: "same-origin", 
        cache: "no-cache", 
        credentials: "same-origin", 
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(geometry),
    })
    .then(response => {
        return response.json();
    })
    .then(data => {
        console.debug(data);



    });

    // const {lot_id, util, usage, num_dwel, unit_ids} = e.features[0].properties
    
    // new mapboxgl.Popup()
    //     .setLngLat(e.lngLat)
    //     .setHTML(
    //         `Lot ID: ${lot_id}<br/>` +
    //         `Util: ${util}<br/>` +
    //         `Usage: ${usage}<br/>` + 
    //         `Dwellings: ${num_dwel}<br/>` +
    //         `Eval units: ${JSON.parse(unit_ids)}<br/>`
    //     )
    //     .addTo(map);
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

function renderLots(map, lastRenderedBounds) {
    // Only render lots when zoomed in past a certain level
    if (map.getZoom() < 14.5) return;
    
    const currentBounds = map.getBounds()
    // If the current bounds are fully contained within the last rendered
    // bounds, i.e. if we have zoomed in and eventually panned within 
    // the previously rendered area, then we don't need to re-render.
    if (boundsAContainB(lastRenderedBounds.bounds, currentBounds)) return;
    
    // Show the loader
    document.getElementById('loader').style.display = 'block';
    // Else fetch data spanning the current bounds from the server
    fetch(dataset.fetchLotsUrl, {
        method: "POST",
        mode: "same-origin", 
        cache: "no-cache", 
        credentials: "same-origin", 
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(currentBounds),
    })
    .then(response => {
        return response.json();
    })
    .then(data => {
        console.debug(data);

        // Remove the previous layer and source
        if (map.getLayer("lots_layer")) {
            map.removeLayer("lots_layer");
        }
        if (map.getSource("lots")) {
            map.removeSource("lots");
        }
        map.off("click", "lots_layer", clickHandler);

        // Ideally we could diff or merge the previous source
        // with the new one insted of completely replacing it
        map.addSource("lots", {
            type: "geojson",
            data: data,
            generateId: true
        });
        // Re-render the layer
        map.addLayer({
            id: "lots_layer",
            type: "fill",
            source: "lots",
            paint: {
                "fill-outline-color": "#000",
                "fill-color": "#000",
                'fill-opacity': [
                    'case',
                    ['boolean', ['feature-state', 'hover'], false],
                    0.5,
                    [
                        'case',
                        ['boolean', ['feature-state', 'clicked'], false],
                        0.5,
                        0.15
                    ]
                ]
            },
            minzoom: 14.5,
        }, "hlm_point");

        // hide the loader on successful load
        document.getElementById("loader").style.display = "none";
        map.on("click", "lots_layer", clickHandler);

        // When the user moves their mouse over the layer, we'll update the
        map.on("mousemove", "lots_layer", (e) => {
            map.getCanvas().style.cursor = 'pointer';
            if (e.features.length > 0) {
                if (hoveredLotId !== null) {
                    map.setFeatureState(
                        { source: "lots", id: hoveredLotId },
                        { hover: false }
                    );
                }
                hoveredLotId = e.features[0].id;
                map.setFeatureState(
                    { source: "lots", id: hoveredLotId },
                    { hover: true }
                );
            }
        });

        map.on("mouseleave", "lots_layer", () => {
            map.getCanvas().style.cursor = '';
            if (hoveredLotId !== null) {
                map.setFeatureState(
                    { source: "lots", id: hoveredLotId },
                    { hover: false }
                );
            }
            hoveredLotId = null;
        });
    });
    
    // Update the last rendered bounds
    lastRenderedBounds.bounds = map.getBounds();
}