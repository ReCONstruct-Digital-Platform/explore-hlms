
Array.prototype.diff = function(arr2) { 
    return this.filter(x => !arr2.includes(x)); 
}

// Load server data
const dataset = document.currentScript.dataset;

var map;
const lastRenderedBounds = {bounds: null};
var hoveredLotId = null;
var clickedLotId = null;
const hlmSources = []
const hiddenSources = {}

const LOT_LAYER_MIN_ZOOM = 15;
const HLM_OVERLAY_EASE_TO_ZOOM = 16.5;

const currentlyLoadedLotIds = new Set();

const polygonsDisplayed = {
    'mrc': [],
    'sc': []
}

const clusterSources = {
    'mrc': [],
    'sc': []
}
const SCSources = [];
const MRCSources = [];

const dataLoaded = {};
var filtersChanged = false;

const clusterMarkers = {
    'mrc': {},
    'sc': {},
};

const allMRCs = [];
const allSCs = [];

// filters for classifying HLMs into IVP categories
const ivpA = ['<', ['get', 'ivp'], 5.1];
const ivpB = ['all', ['>', ['get', 'ivp'], 5.1], ['<=', ['get', 'ivp'], 10]];
const ivpC = ['all', ['>', ['get', 'ivp'], 10], ['<=', ['get', 'ivp'], 15.1]];
const ivpD = ['all', ['>', ['get', 'ivp'], 15.1], ['<=', ['get', 'ivp'], 30]];
const ivpE = ['>', ['get', 'ivp'], 30];



/**
 * Load MRC and Service Center outline, polygon and label layers
 * All except MRC outline are hidden by default and will be displayed
 * based on user selected filters/cluster settings
 */
async function loadBaseLayers() {
    const mrcs = await fetch("/mrc_polygons").then(resp => resp.json());
    const sc = await fetch("/service_center_polygons").then(resp => resp.json());

    map.addSource("mrcs", {
        type: "geojson",
        data: mrcs
    });

    map.addSource("sc", {
        type: "geojson",
        data: sc
    });

    createFilterButtons('mrc-filter-buttons', mrcs.features, 'mrc');
    createFilterButtons('sc-filter-buttons', sc.features, 'sc');
    
    // MRC outline is currently always visible
    map.addLayer({
        id: 'mrc_outlines',
        type: 'line',
        source: 'mrcs',
        layout: {
            'visibility': 'visible',
        },
        paint: {
            'line-color': '#222',
            'line-width': 0.5
        }
    });

    map.addLayer({
        id: 'mrc_polygons',
        type: 'fill',
        source: 'mrcs',
        layout: {
            'visibility': 'visible',
        },
        paint: {
            'fill-color': MRCPolygonColors,
            'fill-opacity': 0.3
        }
    });

    // Add the MRC labels
    map.addLayer({
        id: "mrc_labels",
        type: "symbol",
        source: "mrcs",
        layout: {
            'visibility': 'visible',
            "text-field": ["get", "name"],
            "text-allow-overlap": false,
            "text-size": 14
        },
        paint: {
            "text-color": "#222222"
        }
    });


    map.addLayer({
        id: 'sc_outlines',
        type: 'line',
        source: 'sc',
        layout: {
            'visibility': 'visible',
        },
        paint: {
            'line-color': '#222',
            'line-width': 0.5
        }
    });

    // Add a black outline around the polygon.
    map.addLayer({
        id: 'sc_polygons',
        type: 'fill',
        source: 'sc',
        layout: {
            'visibility': 'visible',
        },
        paint: {
            'fill-color': serviceCenterPolygonColors,
            'fill-opacity': 0.3
        }
    });

    map.addLayer({
        id: "sc_labels",
        type: "symbol",
        source: "sc",
        layout: {
            'visibility': 'visible',
            "text-field": ["get", "name"],
            "text-allow-overlap": false,
            "text-size": 14
        },
        paint: {
            "text-color": "#222222"
        }
    });

    // Initialize empty filters for all layers
    ['mrc_polygons', 'mrc_labels', 'sc_polygons', 'sc_labels', 'sc_outlines'].forEach(layer => {
        map.setFilter(layer, ['in', 'id', ''])
    });

}


/**
 * Populate the filter button sections with a button for each of `featuresToFilter`.
 */
function createFilterButtons(filterButtonElementId, featuresToFilter, type) {
    const filterButtons = document.getElementById(filterButtonElementId);

    const layersToFilter = [`${type}_polygons`, `${type}_outlines`, `${type}_labels`];

    for (const feature of featuresToFilter) {

        const {id, name} = feature.properties;

        // Initialize MRC filter with all IDs
        type === 'mrc' && filterData.spatialFilter[type].push(id);

        // Generate a filter button for the SC
        const button = document.createElement('div');
        button.innerHTML+= `
        <input id="${name}_checkbox" type="checkbox" value=${id} class="peer hidden">
        <label for="${name}_checkbox" class="select-none cursor-pointer rounded-lg border-2 border-gray-200
        py-2 px-3 text-sm text-gray-200 transition-colors duration-200 ease-in-out 
        peer-checked:bg-blue-500 peer-checked:text-gray-50 peer-checked:border-blue-500
        peer-checked:hover:bg-blue-600 peer-checked:hover:border-blue-600"> 
        ${name}</label>`
        filterButtons.appendChild(button);

        
        // The buttons are used to toggle the visibility of the marker and polygon layers
        // Thanks to closures each function has access to its marker element. 
        document.getElementById(`${name}_checkbox`).addEventListener('change', e => {

            // Get the current values of all the following
            // if we're clustering and clustering by the filter type,
            // we should show/hide the cluster marker as well
            const cluster = document.getElementById('cluster-switch').checked;
            const clusterBy = document.querySelector('input[name="cluster-by"]:checked').value;
            const reloadHLMs = (!cluster)
            const displayList = polygonsDisplayed[type];
            const toggleClusterMarker = (cluster && clusterBy === type && id in clusterMarkers[type]);
            
            if (e.currentTarget.checked) {
                displayList.push(id);
                if (toggleClusterMarker) clusterMarkers[type][id]._element.style.visibility = 'visible';
            }
            else {
                const i = displayList.indexOf(id);
                if (i > -1) {
                    displayList.splice(i, 1);
                }
                if (toggleClusterMarker) clusterMarkers[type][id]._element.style.visibility = 'hidden';
            }
            

            filtersChanged = true;
            filterData.spatialFilter[type] = displayList;

            // Only if we're not clustering
            if (reloadHLMs) {
                console.debug('reloading HLMs')
                loadDataLayers(e);
            } 
            
            // Update the layer filter to show/hide polygons
            if (displayList.length > 0) {
                // Filter using the updated service center filter
                layersToFilter.forEach(l => 
                    {   
                        console.log(`filtering ${l} `)
                        map.setFilter(l, ['in', 'id', ...displayList])
                    });
            }
            else {
                layersToFilter.forEach(l => map.setFilter(l, ['in', 'id', '']));
            }
        })
    }
}




function resetAll() {

    const clusterBy = document.querySelector('input[name="cluster-by"]:checked').value;

    // Remove all existing sources and markers
    Object.values(clusterSources).forEach(cs => {
        Object.values(cs).forEach(s => {
            map.getSource(s) && map.removeSource(s);
        })
        cs.length = 0;
    })

    Object.values(clusterMarkers).forEach(cm => Object.values(cm).forEach(m => m.remove()));

    
    // Unselect all MRCs and select all SCs
    const selectAllMRCs = document.getElementById('mrc-filter-select-all');
    const selectAllSCs = document.getElementById('sc-filter-select-all');
    const filterButtonsMRCs = document.getElementById(selectAllMRCs.getAttribute('data-target-id'));
    const filterButtonsSCs = document.getElementById(selectAllSCs.getAttribute('data-target-id'));

    
    if (clusterBy === 'mrc') {
        // Resetting any SCs selected 
        polygonsDisplayed['sc'].length = 0;
        // Unselect all SCs and select all MRCs
        if (!selectAllMRCs.hasAttribute('checked')) {
            console.debug('selectall mrcs NOT checked, clicking to select all')
            selectAllMRCs.click()
        }
        if (selectAllSCs.hasAttribute('checked')) {
            console.debug('selectall scs checked, clicking to UNselect all')
            selectAllSCs.click()
        }
        // After checking the 'select all' buttons above, go through each button
        // and check/uncheck any leftover buttons
        filterButtonsMRCs.querySelectorAll('input:not(:checked)').forEach(input => {
            console.debug(input)
            input.checked = false;
            input.dispatchEvent(new Event('change', {bubbles: true}));
        })
        filterButtonsSCs.querySelectorAll('input:checked').forEach(input => {
            input.checked = false;
            input.dispatchEvent(new Event('change', {bubbles: true}));
        })

    }
    else {
        polygonsDisplayed['mrc'].length = 0;
            
        // Unselect all MRCs and select all SCs
        if (selectAllMRCs.hasAttribute('checked')) {
            console.debug('selectall mrcs checked, clicking to UNselect all')
            selectAllMRCs.click()
        }
        
        if (!selectAllSCs.hasAttribute('checked')) {
            console.debug('selectall SCs NOT checked, clicking to select all')
            selectAllSCs.click()
        }
        
        // After checking the 'select all' buttons above, go through each button
        // and check/uncheck any leftover buttons
        filterButtonsMRCs.querySelectorAll('input:checked').forEach(input => {
            input.checked = false;
            input.dispatchEvent(new Event('change', {bubbles: true}));
        })
        filterButtonsSCs.querySelectorAll('input:not(:checked)').forEach(input => {
            input.checked = false;
            input.dispatchEvent(new Event('change', {bubbles: true}));
        })
    }        
}



async function clusterHLMsByMRC(clusterValue) {

    resetAll();

    if (filtersChanged || !('hlm_clusters_by_mrc' in dataLoaded)) 
    {
        dataLoaded['hlm_clusters_by_mrc'] = await fetch("/hlm_clusters_by_mrc", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                filter: filterData
            })
        }).then(resp => resp.json());
        // Reset 
        filtersChanged = false;
    }

    for (const mrc_data of dataLoaded['hlm_clusters_by_mrc']) {
        // The unpacked variable names must match the field names returned by server
        const {id, name, point, disrepair_states, num_hlms, num_dwellings} = mrc_data;

        const ivpCounts = {};
        for (const ivpCategory of disrepair_states) {
            ivpCounts[ivpCategory] = ivpCounts[ivpCategory] ? ivpCounts[ivpCategory] + 1 : 1;
        }
        // Initialize the filter with all visible
        // MRCsDisplayed.push(id);
        const src = `mrc_${id}_hlms`;

        // We add one source per service center
        map.addSource(src, {
            type: "geojson",
            data: point,
            cluster: false
        });
        clusterSources['mrc'].push(src);
            
        // Add a custom marker for each Service Center
        const el = createPieChart(name, ivpCounts, clusterValue, num_hlms, num_dwellings);
        // const el = createClusterMarkerElement(name, ivpCounts, num_hlms, num_dwellings);

        clusterMarkers['mrc'][id] = new mapboxgl.Marker({
            element: el,
        }).setLngLat(point.geometry.coordinates);

        clusterMarkers['mrc'][id].addTo(map);

    }
}



async function clusterHLMsByServiceCenter(clusterValue) {

    resetAll()

    // Get current filter values before creating the sources
    if (filtersChanged || !('hlm_clusters_by_sc' in dataLoaded)) {
        dataLoaded['hlm_clusters_by_sc'] = await fetch("/hlm_clusters_by_service_center", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                filter: filterData
            })
        }).then(resp => resp.json());
        // Reset 
        filtersChanged = false;
    }

    for (const sc_data of dataLoaded['hlm_clusters_by_sc']) {
        // The unpacked variable names must match the field names returned by server
        const {id, name, point, disrepair_states, num_hlms, num_dwellings} = sc_data;

        const ivpCounts = {};
        for (const ivpCategory of disrepair_states) {
            ivpCounts[ivpCategory] = ivpCounts[ivpCategory] ? ivpCounts[ivpCategory] + 1 : 1;
        }
        
        const src = `sc_${id}_hlms`;
        
        // We add one source per service center
        map.addSource(src, {
            type: "geojson",
            data: point,
            cluster: false
        });
        clusterSources['sc'].push(src);

        // Add a custom marker for each Service Center
        const el = createClusterMarkerElement(name, ivpCounts, clusterValue, num_hlms, num_dwellings);

        clusterMarkers['sc'][id] = new mapboxgl.Marker({
            element: el,
        }).setLngLat(point.geometry.coordinates);

        clusterMarkers['sc'][id].addTo(map);
    }
}





/**
 * Load the HLM data based on user cluster and filter settings
 */
async function loadDataLayers() {

    showLoading();

    // Get the current clustering and filter settings
    const cluster = document.getElementById('cluster-switch').checked;
    const clusterBy = document.querySelector('input[name="cluster-by"]:checked').value;
    const clusterValue = document.querySelector('input[name="cluster-value"]:checked').value;

    if (cluster) {
        // Remove the individual HLM layers
        ['hlm_point', 'hlm_point_labels', 'hlm_addresses_labels'].forEach(
            (layer) => map.getLayer(layer) && map.removeLayer(layer)
        )
        
        if (clusterBy === 'mrc') {
            clusterHLMsByMRC(clusterValue)
        }
        else if (clusterBy === 'sc') {
            clusterHLMsByServiceCenter(clusterValue);
        }
        else {
            throw new Error('Invalid cluster by value');
        }
    }
    else {
        // Reset all existing cluster markers
        Object.values(clusterMarkers).forEach(cm => Object.values(cm).forEach(m => m.remove()));
        // Remove all cluster sources
        Object.values(clusterSources).forEach(cs => {
            Object.values(cs).forEach(s => {
                map.getSource(s) && map.removeSource(s);
            })
            cs.length = 0;
        });


        ['hlm_point', 'hlm_point_labels', 'hlm_addresses_labels'].forEach(
            (layer) => {
                map.getLayer(layer) && map.removeLayer(layer);
            }
        )

        console.log(filterData.spatialFilter)
        
        // Get the HLMs from the server
        dataLoaded['hlms'] = await fetch("/get_hlms", {
            method: 'POST',
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({filter: filterData})
        }).then(resp => resp.json());
        
        if (map.getSource('hlms')) {
            map.getSource('hlms').setData(dataLoaded['hlms']);
        }
        else {
            map.addSource("hlms", {
                type: "geojson",
                data: dataLoaded['hlms'],
                cluster: false,
            });
        }


        // Add the HLM points layer
        map.addLayer({
            id: "hlm_point",
            type: "circle",
            source: "hlms",
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
            layout: {
                "text-field": ["concat", ["get", "address"], " (", ["get", "num_dwellings"], ")"],
                "text-allow-overlap": false,
                "text-variable-anchor": ["bottom-left", "top-left", "top", "bottom-right", "top-right", "left", "right", "bottom"]
            },
            minzoom: HLM_OVERLAY_EASE_TO_ZOOM
        });
        
        // When a click event occurs on a feature in
        map.on("click", "hlm_point", hlmPointClickHandler);
        
        map.on("mouseenter", "hlm_point", () => {
            map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "hlm_point", () => {
            map.getCanvas().style.cursor = "";
        });
    }

    renderLots(map, lastRenderedBounds);

    hideLoading();
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
        style: 'mapbox://styles/mapbox/light-v11',
        // style: 'mapbox://styles/mapbox/streets-v12',
        center: [-72.55424486768713, 46.772195471242426], // starting position [lng, lat]
        zoom: 5.5,
        maxZoom: 18,
        projection: 'globe',
        hash: true,
        maxBounds: [ // Restrict map bounds
            [-80.7611573606566, 40.4149546276178], // Southwest coordinates
            [-45.66154984256363, 56.81374802328887] // Northeast coordinates
        ]
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
    

    map.on('load', async () => {
        // Hide some layers to unclutter
        if (map.getStyle().name === 'Mapbox Light') {
            map.removeLayer('poi-label');
            map.removeLayer('road-path');
            map.removeLayer('continent-label');
            map.removeLayer('country-label');
            map.removeLayer('state-label');
            // map.removeLayer('settlement-subdivision-label');
            map.removeLayer('settlement-major-label');
            // map.removeLayer('settlement-minor-label');
            map.removeLayer('airport-label');
            map.removeLayer('natural-line-label');
            map.removeLayer('natural-point-label');
        }
        // Load layers that we'll always need
        await loadBaseLayers();
        // Load data depending on current clustering and filter settings
        await loadDataLayers();
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
});


async function triggerHLMOverlay(evalUnitId, centerLngLat) {
    const overlayElement = document.getElementById('info-overlay');
    // Get the overlay from the server as HTML
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