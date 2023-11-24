const filterData = {
    ivpRangeMin: dataset.ivpRangeMin,
    ivpRangeMax: dataset.ivpRangeMax,
    dwellingsMin: dataset.dwellingsRangeMin,
    dwellingsMax: dataset.dwellingsRangeMax,
    disrepairCategories: ['A', 'B', 'C', 'D', 'E'],
};

var lastLoadedFilter = {};




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

function setUpClusterSwitch() {

    document.getElementById('clusterSwitch').addEventListener(
        'change', async (e) => {
            const currentRadiusValue = Number.parseInt(
                document.getElementById('cluster-range-slider').value
            );
            if (e.target.checked) {
                await updateClusters(cluster=true, clusterRadius=currentRadiusValue);
                document.getElementById('cluster-range-slider').disabled = false;
            }
            else {
                await updateClusters(cluster=false, clusterRadius=currentRadiusValue);
                document.getElementById('cluster-range-slider').disabled = true;
            }

        } 
    )

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
    
    await drawMapLayers(cluster=cluster, clusterRadius=radius) 

}

function setUpFilter() {

    // document.getElementById('ivp-range-slider')
    //     .addEventListener('range-changed', (e) => {
    //         const data = e.detail;
    //         filterData.ivpRangeMin = data.minRangeValue;
    //         filterData.ivpRangeMax = data.maxRangeValue;
    //     });

    document.getElementById('cluster-range-slider')
        .addEventListener('input', async (e) => {
            await updateClusters(cluster=true, clusterRadius=Number.parseInt(e.target.value));
        });
    
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
    setUpFilter();
    setUpClusterSwitch();
    setUpDisrepairStateButtons();
})