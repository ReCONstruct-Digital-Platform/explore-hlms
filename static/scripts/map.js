
// Load server data
const dataset = document.currentScript.dataset;

var map;
const lastRenderedBounds = {bounds: null};
var hoveredLotId = null;
var clickedLotId = null;

const LOT_LAYER_MIN_ZOOM = 15;
const HLM_OVERLAY_EASE_TO_ZOOM = 16.5;

const currentlyLoadedLotIds = new Set();

// objects for caching and keeping track of HTML marker objects (for performance)
var markers = {};
let markersOnScreen = {};

// filters for classifying HLMs into IVP categories
const ivpA = ['<=', ['get', 'ivp'], 5.1];
const ivpB = ['all', ['>', ['get', 'ivp'], 5.1], ['<=', ['get', 'ivp'], 10]];
const ivpC = ['all', ['>', ['get', 'ivp'], 10], ['<=', ['get', 'ivp'], 15.1]];
const ivpD = ['all', ['>', ['get', 'ivp'], 15.1], ['<=', ['get', 'ivp'], 30]];
const ivpE = ['>', ['get', 'ivp'], 30];

const colors = ['#198754', '#b1ce3c', '#ffd147', '#E86430', '#de2235'];



function resetClusterMarkers() {
    Object.entries(markers).forEach(m => m[1].remove());
    Object.entries(markersOnScreen).forEach(m => m[1].remove());
    markers = {};
    markersOnScreen = {};
}

function mapRenderListener() {
    if (!map.getSource('hlms') || !map.isSourceLoaded("hlms")) return;
    renderClusterMarkers();
}

// https://github.com/mapbox/mapbox-gl-js/issues/2613
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
                map.getSource('hlms').getClusterExpansionZoom(id,
                    (err, zoom) => {
                        if (err) return;
                        map.easeTo({
                            center: coords,
                            zoom: zoom + 2
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


async function drawMapLayers(cluster=true, clusterRadius=60) {
    console.debug("Adding HLMs layer and Events");
    
    // Get the HLMs from the server
    const hlms = await fetch("/get_hlms", {
        method: 'POST',
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({filter: filterData})
    }).then(resp => resp.json());

    map.addSource("hlms", {
        type: "geojson",
        data: hlms,
        // Conditionally add the following properties for clustering
        ...(cluster && {
                cluster: true,
                clusterMaxZoom: 16,
                clusterMinPoints: 2,
                clusterRadius: clusterRadius,
                clusterProperties: {
                num_dwellings: ["+", ["get", "num_dwellings"]],
                // keep counts of the number of dwelling in each IVP category
                ivpA: ["+", ['*', ['get', 'num_dwellings'], ["case", ivpA, 1, 0]]],
                ivpB: ["+", ['*', ['get', 'num_dwellings'], ["case", ivpB, 1, 0]]],
                ivpC: ["+", ['*', ['get', 'num_dwellings'], ["case", ivpC, 1, 0]]],
                ivpD: ["+", ['*', ['get', 'num_dwellings'], ["case", ivpD, 1, 0]]],
                ivpE: ["+", ['*', ['get', 'num_dwellings'], ["case", ivpE, 1, 0]]],
            },
        }
        )
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
            "circle-radius": hlmStyles.circleRadius,
            "circle-color": hlmStyles.ivpColorSteps,
            "circle-stroke-color": hlmStyles.ivpColorSteps,
            "circle-opacity": [
                "interpolate",  ["linear"], ["zoom"],
                16, .6,
                17, 1,
            ],
            "circle-stroke-width": 0,
            "circle-stroke-opacity": 1,
            "circle-blur": [
                "interpolate",  ["linear"], ["zoom"],
                0, 0,
                14, 0,
                16, .5,
                17, 1,
            ]
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
            "text-allow-overlap": false,
        },
        maxzoom: HLM_OVERLAY_EASE_TO_ZOOM
    });

    // Add the HLM address label when sufficiently zoomed in
    map.addLayer({
        id: "hlm_addresses_labels",
        type: "symbol",
        source: "hlms",
        filter: ["!=", "cluster", true],
        layout: {
            "text-field": ["concat", ["get", "address"], " (", ["get", "num_dwellings"], ")"],
            "text-allow-overlap": false,
            "text-variable-anchor": ["bottom-left", "top-left", "top", "bottom-right", "top-right", "left", "right", "bottom"]
        },
        minzoom: HLM_OVERLAY_EASE_TO_ZOOM
    });
    
    // Reset markes on Screen if it exists
    if (markers || markersOnScreen) {
        resetClusterMarkers();
    }

        
    // after the GeoJSON data is loaded, update markers on the screen on every frame
    map.on("render", mapRenderListener);
    
    // When a click event occurs on a feature in
    map.on("click", "hlm_point", hlmPointClickHandler);
    
    map.on("mouseenter", "hlm_point", () => {
        map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "hlm_point", () => {
        map.getCanvas().style.cursor = "";
    });

    renderLots(map, lastRenderedBounds);
}


function hlmPointClickHandler(e) {
    const evalUnitId = e.features[0].properties.eval_unit_id;
    console.debug(`HLM Point clicked. ID: ${evalUnitId}`);
    // Trigger the overlay 
    triggerHLMOverlay(evalUnitId, e.features[0].geometry.coordinates);

    // TODO (Optional): Set the lot polygon as selected
    // Hard to do because the polygon is most likely not loaded
    // in a source or rendered when the HLM point is clicked.
}


document.addEventListener("DOMContentLoaded", () => {

    mapboxgl.accessToken = dataset.mapboxToken;
    map = new mapboxgl.Map({
        container: 'mapbox',
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [-72.55424486768713, 46.772195471242426], // starting position [lng, lat]
        zoom: 5.5,
        maxZoom: 18,
        projection: 'globe',
        hash: true
    });
    document.map = map;

    // Search bar
    // https://github.com/mapbox/mapbox-gl-geocoder/blob/main/API.md#mapboxgeocoder
    map.addControl(
        new MapboxGeocoder({
            accessToken: mapboxgl.accessToken,
            mapboxgl: mapboxgl,
            proximity: true,
        })
    );
    map.addControl(new mapboxgl.ScaleControl());

    // // //DEBUG Stuff
    // document.getElementById('zoom_indicator').innerHTML = `zoom: ${map.getZoom().toFixed(2)}`;
    // map.on('move', () => {
    //     document.getElementById('zoom_indicator').innerHTML = `zoom: ${map.getZoom().toFixed(2)}`;
    // })
    

    map.on('load', () => {
        if (map.getStyle().name === 'Mapbox Streets') {
            // Hide some layers in the streets-v12 map to unclutter
            map.removeLayer('poi-label');
            map.removeLayer('road-path');
            map.removeLayer('road-path-bg');
            map.removeLayer('crosswalks');
            map.removeLayer('road-oneway-arrow-blue');
            map.removeLayer('road-oneway-arrow-white');
            map.removeLayer('road-number-shield');
            map.removeLayer('road-exit-shield');
        }
        drawMapLayers();
    });
    
    // Check if we need to re-render the lots on move end
    map.on('moveend', (e) => {
        renderLots(map, lastRenderedBounds);
    });

    map.on('click', () => {
        // Hide the info overlay
        document.getElementById('info-overlay').setAttribute('data-visible', false);

        // Unselect the currently clicked lot, if applicable
        if (clickedLotId !== null) {
            map.setFeatureState(
                { source: "lots", id: clickedLotId },
                { clicked: false }
            );
        }
    })

    
    // // Layer select
    // const dataLayerSelect = document.getElementById('data-layer-select');
    // const dataLayerInputs = dataLayerSelect.getElementsByTagName('input');
     
    // for (const input of dataLayerInputs) {
    //     input.onclick = (layer) => {
    //         const layerId = layer.target.id;

    //         // redraw map layers
    //         map.once('render', () => {
    //             drawMapLayers();
    //         });
    //     };
    // }

});


async function triggerHLMOverlay(evalUnitId, centerLngLat) {
    const overlayElement = document.getElementById('info-overlay');
    const overlayHTMLContent = await fetch(
        dataset.fetchLotInfoUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", },
            body: JSON.stringify({ id: evalUnitId }),
        })
        // Text instead of JSON because we're getting the rendered HTML from the server
        .then(response => response.text());
    
    overlayElement.innerHTML = overlayHTMLContent;

    // Execute all scripts contained within the HTML
    var scripts = overlayElement.querySelectorAll("script");
    for (var i = 0; i < scripts.length; i++) {
        if (scripts[i].innerText) {
        eval(scripts[i].innerText);
    }}

    overlayElement.setAttribute('data-visible', true);
    // Hide the menu if it is currently visible
    document.getElementById('menu-overlay-button').setAttribute('aria-pressed', false);
    document.getElementById('menu-overlay').setAttribute('data-visible', false);
    
    if (map.getZoom() >= 16.5) return;

    // Quick Maff to position the lot in the middle of screen space
    // left over after showing the overlay. 
    // Semi complicated because we have to give an offset from the center.
    const mapWidth = map._containerWidth;
    const overlayWidth = overlayElement.offsetWidth;
    const remainingWidth = mapWidth - overlayWidth

    const isOverlayLargerThanHalfScreen = (0.5 * map._containerWidth) < overlayWidth;
    const deltaOffset = Math.abs((0.5 * mapWidth) - overlayWidth)
    
    const offset = isOverlayLargerThanHalfScreen ?
        0.5 * (remainingWidth + deltaOffset) :
        (0.5 * remainingWidth) - deltaOffset;

    map.easeTo({
        duration: 1000,
        center: centerLngLat,
        zoom: map.getZoom() < HLM_OVERLAY_EASE_TO_ZOOM ? HLM_OVERLAY_EASE_TO_ZOOM : map.getZoom(),
        offset: [-offset, 0] // Offset is negative to move left from center
    })
}

const lotClickHandler = (e) => {
    // e is of type Mapbox::MapMouseEvent
    e.originalEvent.stopPropagation();

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

    const evalUnitId = e.features[0].properties.id;
    triggerHLMOverlay(evalUnitId, e.lngLat);
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

    // Else fetch data spanning the current bounds from the server
    fetch(dataset.fetchLotsUrl, {
        method: "POST",
        mode: "same-origin", 
        cache: "default", 
        credentials: "same-origin", 
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
            bounds: currentBounds,
            filter: filterData
        }),
    })
    .then(response => response.json())
    .then(data => { 
        // If the source already exists we will add to the existing source
        // instead of overwriting it
        if (map.getSource('lots')) {
            // Get the loaded lots or empty array if nullish
            const currData = map.getSource('lots')._data.features ?? [];

            // Add all feature that we don't already display
            for (const feature of data.features) {
                const id = feature.properties.id;
                if (currentlyLoadedLotIds.has(id)) {
                    // console.debug(`feature id ${id} already present` )
                    continue;
                };
                currData.push(feature);
            }

            const updatedData = {
                type: 'FeatureCollection',
                features:  currData
            }
            // console.debug(updatedData)
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
                    "fill-color": hlmStyles.ivpColorSteps,
                    "fill-outline-color": hlmStyles.ivpColorSteps,
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

        // Add the IDs of the lots that got loaded
        for (const feature of data.features) {
            // console.debug(feature);
            currentlyLoadedLotIds.add(feature.properties.id);
        }

        console.debug(currentlyLoadedLotIds);
    })
    .catch(error => {
        console.log(error);
        // TODO: Show a error notification to user
    });
    
    // Update the last rendered bounds
    lastRenderedBounds.bounds = map.getBounds();
}