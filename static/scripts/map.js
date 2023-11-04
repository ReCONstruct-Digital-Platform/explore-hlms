
// Load server data
const dataset = document.currentScript.dataset;

var map;
const lastRenderedBounds = {bounds: null};
var hoveredLotId = null;
var clickedLotId = null;

const LOT_LAYER_MIN_ZOOM = 15

const currentlyLoadedLotIds = new Set();

// filters for classifying HLMs into IVP categories
const ivpA = ['<=', ['get', 'ivp'], 5];
const ivpB = ['all', ['>', ['get', 'ivp'], 5], ['<=', ['get', 'ivp'], 10]];
const ivpC = ['all', ['>', ['get', 'ivp'], 10], ['<=', ['get', 'ivp'], 15]];
const ivpD = ['all', ['>', ['get', 'ivp'], 15], ['<=', ['get', 'ivp'], 30]];
const ivpE = ['>', ['get', 'ivp'], 30];

const colors = ['#198754', '#b1ce3c', '#ffd147', '#E86430', '#de2235'];


function drawMapLayers() {
    console.debug("Adding HLMs layer and Events");

    map.addSource("hlms", {
        type: "geojson",
        data: `${dataset.dataFolder}/hlms.geojson`,
        cluster: true,
        clusterMaxZoom: 13,
        clusterMinPoints: 5,
        clusterRadius: 80,
        clusterProperties: {
            num_dwellings: ["+", ["get", "num_dwellings"]],
            // keep counts of the number of dwelling in each IVP category
            ivpA: ["+", ['*', ['get', 'num_dwellings'], ["case", ivpA, 1, 0]]],
            ivpB: ["+", ['*', ['get', 'num_dwellings'], ["case", ivpB, 1, 0]]],
            ivpC: ["+", ['*', ['get', 'num_dwellings'], ["case", ivpC, 1, 0]]],
            ivpD: ["+", ['*', ['get', 'num_dwellings'], ["case", ivpD, 1, 0]]],
            ivpE: ["+", ['*', ['get', 'num_dwellings'], ["case", ivpE, 1, 0]]],
        },
    });

    // Add the HLM points layer
    map.addLayer({
        id: "hlm_point",
        type: "circle",
        source: "hlms",
        filter: ["!=", "cluster", true],
        layout: {
            'visibility': 'visible',
        },
        paint: {
            "circle-radius": [
                "interpolate", ["linear"], ["zoom"],
                0,
                [
                    "*",
                    [
                        "interpolate",
                        ["exponential", 1],
                        ["get", "num_dwellings"],
                        1, 3,
                        50, 12,
                        100, 15,
                        150, 21,
                    ],
                    1,
                ],
                5,
                [
                    "*",
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
                10,
                [
                    "*",
                    [
                        "interpolate",
                        ["exponential", 1],
                        ["get", "num_dwellings"],
                        1, 6,
                        50, 15,
                        100, 20,
                        150, 25,
                    ],
                    1.4,
                ],
                22,
                [
                    "*",
                    [
                        "interpolate",
                        ["exponential", 1],
                        ["get", "num_dwellings"],
                        1, 3,
                        50, 12,
                        100, 15,
                        150, 21,
                    ], 2,
                ],
            ],
            "circle-color": [
                "step",
                ["get", "ivp"],
                "#198754",
                5,
                "#b1ce3c",
                10,
                "#ffd147",
                15,
                "#E86430",
                30,
                "#de2235",
            ],
            "circle-opacity": 0.6,
            "circle-stroke-width": 0,
            "circle-stroke-opacity": 1,
            "circle-stroke-color": [
                "step",
                ["get", "ivp"],
                "#198754",
                5, "#b1ce3c",
                10, "#ffd147",
                15, "#E86430",
                30, "#de2235",
            ],
        },
    });

    // Add the HLM points labels
    map.addLayer({
        id: "hlm_point_labels",
        type: "symbol",
        source: "hlms",
        filter: ["!=", "cluster", true],
        layout: {
            "text-field": ["get", "num_dwellings"],
            "text-allow-overlap": true,
        },
    });

    // objects for caching and keeping track of HTML marker objects (for performance)
    const markers = {};
    let markersOnScreen = {};

    function renderClusterMarkers() {
        const newMarkers = {};
        const features = map.querySourceFeatures("hlms");

        // for every cluster on the screen, create an HTML marker for it (if we didn't yet),
        // and add it to the map if it's not there already
        for (const feature of features) {
            const coords = feature.geometry.coordinates;
            const props = feature.properties;
            // If feature is not part of cluster return
            if (!props.cluster) continue;

            const id = props.cluster_id;

            let marker = markers[id];
            if (!marker) {
                const el = createDonutChart(props, colors);
                marker = markers[id] = new mapboxgl.Marker({
                    element: el,
                }).setLngLat(coords);

                el.addEventListener('click',  () => {
                    map.getSource('hlms').getClusterExpansionZoom(
                        id,
                        (err, zoom) => {
                            if (err) return;
                            map.easeTo({
                                center: coords,
                                zoom: zoom
                            });
                        }
                    );
                })
            }
            newMarkers[id] = marker;
            

            if (!markersOnScreen[id]) marker.addTo(map);
        }

        // for every marker we've added previously, remove those that are no longer visible
        for (const id in markersOnScreen) {
            if (!newMarkers[id]) markersOnScreen[id].remove();
        }
        markersOnScreen = newMarkers;
    }

    // after the GeoJSON data is loaded, update markers on the screen on every frame
    map.on("render", () => {
        if (!map.isSourceLoaded("hlms")) return;
        renderClusterMarkers();
    });

    // When a click event occurs on a feature in
    map.on("click", "hlm_point", hlmPointClickHandler);

    map.on("mouseenter", "hlm_point", () => {
        map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "hlm_point", () => {
        map.getCanvas().style.cursor = "";
    });

    renderLots(map, lastRenderedBounds, true);
}


const hlmPointClickHandler = (e) => {
    map.easeTo({
        center: e.lngLat,
        zoom: 16,
    })
    // TODO: Trigger a click on the underlying lot

    // const coordinates = e.features[0].geometry.coordinates.slice();
    // const {id, lot_address, ivp, hlm_addresses, num_dwellings} = e.features[0].properties;
    
    // const hlm_address_json = JSON.parse(hlm_addresses)
    
    // // Ensure that if the map is zoomed out such that
    // // multiple copies of the feature are visible, the
    // // popup appears over the copy being pointed to.
    // while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
    //     coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
    // }

    // new mapboxgl.Popup()
    //     .setLngLat(coordinates)
    //     .setHTML(
    //         `${lot_address}<br/>` +
    //         `Avg IVP: ${ivp}<br/>` +
    //         `${num_dwellings} dwellings<br/>` +
    //         `${hlm_address_json.length} HLM${hlm_address_json.length > 1 ? 's' : ''}: ${hlm_address_json}<br/>`
    //     )
    //     .addTo(map);
}


document.addEventListener("DOMContentLoaded", () => {

    mapboxgl.accessToken = dataset.mapboxToken;
    map = new mapboxgl.Map({
        container: 'mapbox',
        style: 'mapbox://styles/mapbox/light-v11',
        center: [-72.55424486768713, 46.772195471242426], // starting position [lng, lat]
        zoom: 5.5,
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
    // map.addControl(new mapboxgl.ScaleControl());

    // //DEBUG Stuff
    // // map.showTileBoundaries = true;
    // // map.showOverdraw = true;
    document.getElementById('zoom_indicator').innerHTML = `zoom: ${map.getZoom().toFixed(2)}`;
    map.on('move', () => {
        document.getElementById('zoom_indicator').innerHTML = `zoom: ${map.getZoom().toFixed(2)}`;
    })
    // updateBounds(map)
    // map.on('move', () => {
    //     updateBounds(map);
    // })
    

    map.on('load', () => {
        drawMapLayers();
    });
    
    // Check if we need to re-render the lots on move end
    map.on('moveend', (e) => {
        renderLots(map, lastRenderedBounds);
        // Make the Point layer visible if needed
        if (map.getZoom() < LOT_LAYER_MIN_ZOOM && 
            map.getLayoutProperty('hlm_point', 'visibility') === 'none') 
        {
            map.setLayoutProperty('hlm_point', 'visibility', 'visible');
        }
    });

    
    // // Layer select
    // const mapTypeList = document.getElementById('map-type-select');
    // const mapTypeInputs = mapTypeList.getElementsByTagName('input');
     
    // for (const input of mapTypeInputs) {
    //     input.onclick = (layer) => {
    //         const layerId = layer.target.id;
    //         map.setStyle('mapbox://styles/mapbox/' + layerId);
    //         // redraw map layers
    //         map.once('render', () => {
    //             drawMapLayers();
    //         });
    //     };
    // }
    
    // // Layer select
    // const dataLayerSelect = document.getElementById('data-layer-select');
    // const dataLayerInputs = dataLayerSelect.getElementsByTagName('input');
     
    // for (const input of dataLayerInputs) {
    //     input.onclick = (layer) => {
    //         const layerId = layer.target.id;

    //         // redraw map layers
    //         map.once('render', () => {
    //             console.debug('map rendered')
    //             drawMapLayers();
    //         });
    //     };
    // }

});


const lotClickHandler = (e) => {
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

    map.easeTo({
        center: e.lngLat,
        zoom: map.getZoom() < 16.5 ? 16.5 : map.getZoom()
    })

    const evalUnitId = e.features[0].properties.id;
    console.debug(evalUnitId);

    fetch(dataset.fetchLotInfoUrl, {
        method: "POST",
        mode: "same-origin", 
        cache: "no-cache", 
        credentials: "same-origin", 
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
            id: evalUnitId
        }),
    })
    .then(response => response.text())
    .then(html => {
        console.debug(html);
        document.getElementById('info-overlay').innerHTML = html;
        document.getElementById('info-overlay').style.display = 'flex';
    });

}


function renderLots(map, lastRenderedBounds, forceRender = false) {
    // Only render lots when zoomed in past a certain level
    if (map.getZoom() < LOT_LAYER_MIN_ZOOM) return;
    
    const currentBounds = map.getBounds();
    // If the current bounds are fully contained within the last rendered
    // bounds, i.e. if we have zoomed in and eventually panned within 
    // the previously rendered area, then we don't need to re-render.
    if (!forceRender && boundsAContainB(lastRenderedBounds.bounds, currentBounds)) {
        console.debug('Bounds within previous bounds, returning')
        return;
    }

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
        
        // If the source already exists we will add to the existing source
        // instead of overwriting it
        if (map.getSource('lots')) {

            const currData = map.getSource('lots')._data.features;

            // Add all feature that we don't already display
            for (const feature of data.features) {
                const id = feature.properties.id;
                if (currentlyLoadedLotIds.has(id)) {
                    console.debug(`feature id ${id} already present` )
                    continue;
                };
                currData.push(feature)
            }

            const updatedData = {
                type: 'FeatureCollection',
                features:  currData
            }
            console.debug(updatedData)
            map.getSource('lots').setData(updatedData);
        }
        // First load
        else {
            map.addSource("lots", {
                type: "geojson",
                data: data,
                generateId: true
            });
            // Render the layer
            map.addLayer({
                id: "lots_layer",
                type: "fill",
                source: "lots",
                paint: {
                    "fill-outline-color": [
                        'step', ['get', 'ivp'],
                        '#198754',
                        5, '#b1ce3c',
                        10, '#ffd147',
                        15, '#E86430',
                        30, '#de2235'
                    ],
                    "fill-color": [
                        'step', ['get', 'ivp'],
                        '#198754',
                        5, '#b1ce3c',
                        10, '#ffd147',
                        15, '#E86430',
                        30, '#de2235'
                    ],
                    'fill-opacity': [
                        'case',
                        ['boolean', ['feature-state', 'hover'], false],
                        0.75,
                        [
                            'case',
                            ['boolean', ['feature-state', 'clicked'], false],
                            0.75,
                            0.5
                        ]
                    ]
                },
                minzoom: LOT_LAYER_MIN_ZOOM,
            }, "hlm_point");

            map.on("click", "lots_layer", lotClickHandler);
    
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
        }
        
        // hide the loader on successful load
        document.getElementById("loader").style.display = "none";
        
        if (map.getLayoutProperty('hlm_point', 'visibility') === 'visible') {
            // remove the point layer if visible
            map.setLayoutProperty('hlm_point', 'visibility', 'none');
        }

        // Add the IDs of the lots that got loaded
        for (const feature of data.features) {
            console.debug(feature);
            currentlyLoadedLotIds.add(feature.properties.id);
        }

        console.debug(currentlyLoadedLotIds);
    })
    .catch(error => {
        console.log(error);
        // hide the loader on successful load
        document.getElementById("loader").style.display = "none";

        // TODO: Show a error notification to user
    });
    
    // Update the last rendered bounds
    lastRenderedBounds.bounds = map.getBounds();
}