const filterData = {
    ivpRangeMin: dataset.ivpRangeMin,
    ivpRangeMax: dataset.ivpRangeMax,
    dwellingsMin: dataset.dwellingsRangeMin,
    dwellingsMax: dataset.dwellingsRangeMax,
    spatialFilter: {
        'mrc': [],
        'sc': [],
    },
    disrepairCategories: ['A', 'B', 'C', 'D', 'E'],
};
// TODO never check this after setting in updateData
var lastLoadedFilter = {};

/**
 * Enable dynamically switching languages
 * Inspired from https://www.youtube.com/watch?v=OKU08dWK8BA
 */
function setUpText() {
    // Get all elements with a lang attribute
    const containers = document.querySelectorAll('[lang]');
    // Get the selected locale from the dropdown
    const locale = document.getElementById('lang-select').value;

    // For these ones, we have to change the placeholder value
    // This one is loaded in by mapbox so we can't add an ID or data attribute to it
    document.getElementsByClassName('mapboxgl-ctrl-geocoder--input')[0].placeholder = langdata.languages[locale].strings['search-placeholder']; 
    document.getElementById('search-mrc').placeholder = langdata.languages[locale].strings['filters-search'];
    document.getElementById('search-sc').placeholder = langdata.languages[locale].strings['filters-search'];

    // For each container element, get 
    containers.forEach(container => {
        console.debug(container);
        container.querySelectorAll('[data-key]').forEach(el => {
            const key = el.getAttribute('data-key');
            console.debug(key);
            console.debug(langdata["languages"][locale]["strings"])
            if (key) {
                // apply correct translation
                el.textContent = langdata["languages"][locale]["strings"][key];
            }
        })
    });

    if (Object.keys(currentAreaPlotData).length) regeneratePlots();
}

function setUpLanguageSelect() {
    document.getElementById('lang-select').addEventListener('change', e => {
        setUpText();
    })
}

function setUpSettingsTopCategories() {
    
    document.getElementById('cluster-settings-header').addEventListener("click", () => {
        document.getElementById('cluster-settings').classList.toggle('hidden');
        document.getElementById("cluster-settings-icon-up").classList.toggle('hidden');
        document.getElementById("cluster-settings-icon-down").classList.toggle('hidden');
    });

    document.getElementById('filter-settings-header').addEventListener("click", () => {
        document.getElementById('filter-settings').classList.toggle('hidden');
        document.getElementById("filter-settings-icon-up").classList.toggle('hidden');
        document.getElementById("filter-settings-icon-down").classList.toggle('hidden');
    });
}


function setUpMRCFilters() {

    document.getElementById('mrc-filter').addEventListener("click", () => {
        document.getElementById('mrc-filter-buttons').classList.toggle('hidden');
        document.getElementById("mrc-filter-icon-up").classList.toggle('hidden');
        document.getElementById("mrc-filter-icon-down").classList.toggle('hidden');
    });
    document.getElementById('mrc-filter-select-all').addEventListener("click", selectAllClickHandler);
}


function setUpSCFilters() {
    document.getElementById('sc-filter').addEventListener("click", () => {
        document.getElementById('sc-filter-buttons').classList.toggle('hidden');
        document.getElementById("sc-filter-icon-up").classList.toggle('hidden');
        document.getElementById("sc-filter-icon-down").classList.toggle('hidden');
    });
    document.getElementById('sc-filter-select-all').addEventListener("click", selectAllClickHandler);
}

/**
 * For the select all buttons
 */
function selectAllClickHandler(e) {
    const filterButtonContainer = document.getElementById(e.currentTarget.getAttribute('data-target-id'));
    // We're toggling the checked attribute here
    // This returns true if checked is present after toggling
    // i.e. if we want to select all filters
    const selectingAll = e.currentTarget.toggleAttribute('checked');
    // MRC or SC
    const type = e.currentTarget.getAttribute('data-category');
    const displayList = polygonsDisplayed[type]; 
    const layersToFilter = [`${type}_polygons`, `${type}_outlines`, `${type}_labels`];

    const cluster = document.getElementById('cluster-switch').checked;
    const clusterBy = document.querySelector('input[name="cluster-by"]:checked').value;
    const reloadHLMs = (!cluster)
    
    if (selectingAll) {
        e.currentTarget.innerText = 'Unselect all';
        const uncheckedFilters = filterButtonContainer.querySelectorAll('input[type="checkbox"]:not(:checked)');
        // Go through all filters and check all those that are NOT checked
        // We'll collect the polygon ids and perform a single filter update at the end
        uncheckedFilters.forEach(btn => {
            const id = parseInt(btn.value);
            btn.checked = true;
            displayList.push(id);

            const toggleClusterMarker = (cluster && clusterBy === type && id in clusterMarkers[type]);
            if (toggleClusterMarker) clusterMarkers[type][id]._element.style.visibility = 'visible';
        });

        // 
    }
    else {
        // HERE select all was checked - so we want to UNSELECT all
        e.currentTarget.innerText = 'Select all';
        const checkedFilters = filterButtonContainer.querySelectorAll('input[type="checkbox"]:checked');
        // go through all buttons and click all those that are checked
        checkedFilters.forEach(btn => {
            const id = parseInt(btn.value);
            btn.checked = false;

            const i = displayList.indexOf(id);
            if (i > -1) {
                displayList.splice(i, 1);
            }
            const toggleClusterMarker = (cluster && clusterBy === type && id in clusterMarkers[type]);
            if (toggleClusterMarker) clusterMarkers[type][id]._element.style.visibility = 'hidden';
        });
    }

    filterData.spatialFilter[type] = displayList;

    // Only if we're not clustering
    if (reloadHLMs) {
        filtersChanged = true;
        // filterData.spatialFilter[type] = displayList;
        loadDataLayers(e);
    } 
    
    // console.debug(`should display ${type}`, displayList);

    // Update the layer filter to show/hide polygons
    if (displayList.length > 0) {
        // Filter using the updated service center filter
        layersToFilter.forEach(l => map.setFilter(l, ['in', 'id', ...displayList]));
    }
    else {
        layersToFilter.forEach(l => map.setFilter(l, ['in', 'id', '']));
    }

}



function setUpDisrepairStateButtons() {

    function getActiveDisrepairCategories() {
        const activeDisrepairCategories = []
        const activeButtons = document.getElementById('disrepair-buttons').querySelectorAll('input:checked');
        activeButtons.forEach(b => activeDisrepairCategories.push(b.value))
        return activeDisrepairCategories;
    }

    const buttons = document.getElementById('disrepair-buttons').querySelectorAll('input');
    buttons.forEach(btn => {
        btn.addEventListener('change', e => {
            filterData.disrepairCategories = getActiveDisrepairCategories();
            filtersChanged = true;
            loadDataLayers(e);
        })
    })

}

function normalizeText(text) {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function setUpSearchFilters() {

    ['mrc', 'sc'].forEach(type => {
        const search = document.getElementById(`search-${type}`);
        
        search.addEventListener('input', (e) => {
            const allFilters = document.getElementById(`${type}-filter-buttons`).querySelectorAll('label');
            e.stopPropagation();
            const searchText = normalizeText(e.target.value);
            allFilters.forEach(filter => {
                if (!normalizeText(filter.innerText).includes(searchText)) filter.parentNode.style.display = 'none';
                else filter.parentNode.style.display = '';
            })
        })
    })
}


/**
 * 
 */
function setUpClusterSettings() {

    document.getElementById('cluster-switch').addEventListener('change', (e) => {
        const disabled = !e.target.checked;
        document.querySelectorAll('input[name="cluster-by"]').forEach(el => el.disabled = disabled);
        document.querySelectorAll('input[name="cluster-value"]').forEach(el => el.disabled = disabled);
        document.querySelectorAll('input[name="cluster-marker-type"]').forEach(el => el.disabled = disabled);
        loadDataLayers(e);
    });

    document.querySelectorAll('input[name="cluster-by"]').forEach(el => {
        el.addEventListener('change', loadDataLayers);
    })
    // When the marker type changes, disable the value for the box type (as both are shown)
    document.querySelectorAll('input[name="cluster-marker-type"]').forEach(el => {
        el.addEventListener('change', e => {
            if (e.target.id === 'cluster-marker-type-box' && e.target.checked) {
                document.querySelectorAll('input[name="cluster-value"]').forEach(el => el.disabled = true);
            }
            else if (e.target.id === 'cluster-marker-type-pie' && e.target.checked) {
                document.querySelectorAll('input[name="cluster-value"]').forEach(el => el.disabled = false);
            }
            loadDataLayers(e);
        });
    })
    document.querySelectorAll('input[name="cluster-value"]').forEach(el => {
        el.addEventListener('change', loadDataLayers);
    })

}

async function updateClusters(cluster=true, radius=60) {
    // Need to remove every layer related to lots
    // recreate the source, and re-add the layers
    const eventTypes = ['click', 'mouseenter', 'mouseleave']
    for (const eventType of eventTypes) {
        map.off('hlm_point', eventType);
    }
    map.off('render', mapRenderListener);

    ['hlm_point', 'hlm_point_labels', 'hlm_addresses_labels'].forEach(
        (layer) => {
            map.getLayer(layer) && map.removeLayer(layer)
        }
    )

    map.getSource('hlms') && map.removeSource('hlms');
    
    await loadDataLayers(cluster=cluster, clusterRadius=radius) 

}

function setUpFilter() {

    document.getElementById('dwellings-range-slider')
        .addEventListener('range-changed', async (e) => {
            const data = e.detail;
            filterData.dwellingsMin = data.minRangeValue;
            filterData.dwellingsMax = data.maxRangeValue;
            filtersChanged = true;
            loadDataLayers(e);
        });
}


function setUpMenuButton() {
    const menu = document.getElementById('menu-overlay');
    const menuButton = document.getElementById('menu-overlay-button');

    menuButton.addEventListener('click', () => {
        menuButton.setAttribute('aria-pressed', menuButton.matches('[aria-pressed=true]') ? false : true);
        menu.setAttribute('data-visible', menu.matches('[data-visible=true]') ? false : true);
    });
}

function closeAreaInfo() {
    // Hide the overlay
    document.getElementById('area-info-overlay').setAttribute('data-visible', false);
    // Delete all plots - we set a timeout to account for the closing transition length
    // Otherwise we see the plots disappear before the overlay
    setTimeout(() => {
        ['hlms-per-disrepair-category', 'dwellings-per-disrepair-category', 'dwellings-per-hlms'].forEach(
            id => document.getElementById(id).innerHTML = ''
            )
        }, 250);
}

function setUpCloseAreaInfoButton() {
    document.getElementById('area-info-close-button').addEventListener('click', closeAreaInfo);
}
function setUpCloseOverlayOnEscapeKey() {

    document.addEventListener('keyup', (e) => {
        e.stopPropagation();
        if (e.key !== 'Escape') return;
        // hide any visible overlay
        document.getElementById('info-overlay').setAttribute('data-visible', false);
        if (clickedLotId !== null) {
            map.setFeatureState(
                { source: "lots", id: clickedLotId },
                { clicked: false }
                );
            }
        closeAreaInfo();
    })
}

document.addEventListener('DOMContentLoaded', () => {
    setUpText();
    setUpLanguageSelect();
    setUpSettingsTopCategories();
    setUpMenuButton();
    setUpFilter();
    setUpClusterSettings();
    setUpDisrepairStateButtons();
    setUpMRCFilters();
    setUpSCFilters();
    setUpSearchFilters();
    setUpCloseAreaInfoButton();
    setUpCloseOverlayOnEscapeKey();
})