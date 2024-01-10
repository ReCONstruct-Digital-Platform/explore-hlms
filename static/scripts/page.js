const filterData = {
    ivpRangeMin: dataset.ivpRangeMin,
    ivpRangeMax: dataset.ivpRangeMax,
    dwellingsMin: dataset.dwellingsRangeMin,
    dwellingsMax: dataset.dwellingsRangeMax,
    disrepairCategories: ['A', 'B', 'C', 'D', 'E'],
};

var lastLoadedFilter = {};


function setUpMRCFilters() {
    const buttonSection = document.getElementById('mrc-filter-buttons');
    const iconUp = document.getElementById("mrc-filter-icon-up");
    const iconDown = document.getElementById("mrc-filter-icon-down");

    document.getElementById('mrc-filter').addEventListener("click", () => {
        buttonSection.classList.toggle('hidden');
        iconUp.classList.toggle('hidden');
        iconDown.classList.toggle('hidden');
    });
    document.getElementById('mrc-filter-select-all').addEventListener("click", selectAllClickHandler);
}


function setUpServiceCenterFilters() {
    const buttonSection = document.getElementById('sc-filter-buttons');
    const iconUp = document.getElementById("sc-filter-icon-up");
    const iconDown = document.getElementById("sc-filter-icon-down");

    document.getElementById('sc-filter').addEventListener("click", () => {
        buttonSection.classList.toggle('hidden');
        iconUp.classList.toggle('hidden');
        iconDown.classList.toggle('hidden');
    });
    document.getElementById('sc-filter-select-all').addEventListener("click", selectAllClickHandler);
}

/**
 * For the select all buttons
 */
function selectAllClickHandler(e) {
    const allCheckboxes = document.getElementById(e.currentTarget.getAttribute('data-target-id')).querySelectorAll('input');
    console.log(e.currentTarget, 'select all clicked')

    if (e.currentTarget.toggleAttribute('checked')) {
        // If not checked - we want to select all 
        // change the text to unselect for next time
        e.currentTarget.innerText = 'Unselect all';

        // Go through all buttons and check all those that are NOT checked
        allCheckboxes.forEach(btn => {
            if (!btn.checked) {
                // I don't know why triggering a click was not working consistently
                // not was just dispatching the change event - I had to manually set
                // the checked state
                btn.checked = true;
                btn.dispatchEvent(new Event('change', {bubbles: true}));
            }
        });
    }
    else {
        // HERE select all was checked - so we want to UNSELECT all

        // change the text for next click
        e.currentTarget.innerText = 'Select all';

        // go through all buttons and click all those that are checked
        allCheckboxes.forEach(btn => {
            if (btn.checked) {
                btn.checked = false;
                btn.dispatchEvent(new Event('change', {bubbles: true}));
            }
        });
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

    const buttons = document.querySelectorAll('.button-disrepair');
    for (const button of buttons) {
        button.addEventListener('click', async () => {
            const disrepairCategories = getActiveDisrepairCategories();
            filterData.disrepairCategories = disrepairCategories;
            await updateData(filterData);
        })
    }

}

async function updateData(filterData) {
    resetClusterMarkers();

    // Need to fetch filtered hlms from server, so clusters regenerate properly
    const hlms = await fetch("/get_hlms", {
        method: 'POST',
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({filter: filterData})
    }).then(resp => resp.json());
    
    map.getSource('hlms').setData(hlms);

    if (map.getSource('lots')) {
        const lots = await fetch(dataset.fetchLotsUrl, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                bounds: map.getBounds(),
                filter: filterData
            })
        }).then(resp => resp.json());
        
        lots.features = lots.features ?? [];

        map.getSource('lots').setData(lots);
        renderClusterMarkers();
    }

    lastLoadedFilter = structuredClone(filterData);
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
            const data = e.detail;
            filterData.dwellingsMin = data.minRangeValue;
            filterData.dwellingsMax = data.maxRangeValue;
            // dwellingsFilterChanged = true;
            await updateData(filterData);
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
    setUpMenuButton();
    // setUpFilter();
    setUpClusterSettings();
    setUpDisrepairStateButtons();
    setUpMRCFilters();
    setUpServiceCenterFilters();
})