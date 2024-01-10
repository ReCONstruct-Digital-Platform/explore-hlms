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
        const uncheckedFilters = filterButtonContainer.querySelectorAll('input:not(:checked)');
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
        const checkedFilters = filterButtonContainer.querySelectorAll('input:checked');
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

    // Only if we're not clustering
    if (reloadHLMs) {
        filtersChanged = true;
        filterData.spatialFilter[type] = displayList;
        loadDataLayers(e);
    } 
    
    console.debug(`should display ${type}`, displayList);

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
        const activeButtons = document.querySelectorAll('.button-disrepair.active');
        const activeDisrepairCategories = []
        for (const btn of activeButtons) {
            activeDisrepairCategories.push(btn.getAttribute('data-value'));
        }
        // console.debug(activeDisrepairCategories);
        return activeDisrepairCategories;
    }

    const ivpButtons = document.querySelectorAll('.button-disrepair');
    for (const btn of ivpButtons) {
        btn.addEventListener('click', async (e) => {
            const disrepairCategories = getActiveDisrepairCategories();
            filterData.disrepairCategories = disrepairCategories;
            filtersChanged = true;
            loadDataLayers(e);
            // await updateData(filterData);
        })
    }

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
        loadDataLayers(e);
    });

    document.querySelectorAll('input[name="cluster-by"]').forEach(el => {
        el.addEventListener('change', loadDataLayers);
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
            console.log('changed!')
            const data = e.detail;
            filterData.dwellingsMin = data.minRangeValue;
            filterData.dwellingsMax = data.maxRangeValue;
            filtersChanged = true;
            loadDataLayers(e);
            // dwellingsFilterChanged = true;
            // await updateData(filterData);
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


document.addEventListener('DOMContentLoaded', () => {
    setUpSettingsTopCategories();
    setUpMenuButton();
    setUpFilter();
    setUpClusterSettings();
    setUpDisrepairStateButtons();
    setUpMRCFilters();
    setUpSCFilters();
    setUpSearchFilters();
})