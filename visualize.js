(async function initMap() {
    const { StreetViewService } = await google.maps.importLibrary("streetView");
    const svService = new StreetViewService();

    let coordinates = {
        lat: 45.4580915864,
        lng: -73.5754052827,
    };
    let panoRequest = {
        radius: 25,
        location: coordinates,
    };
    findPanorama(svService, panoRequest, coordinates);
})();


const selectedLot = {
    feature: {},
}

function onClick(e) {
    console.log('click');
    if (e.feature.getProperty('clicked') === 'true') {
        e.feature.setProperty('clicked', 'false');
        deletePoints(e.feature);
    }
    else {
        // If another feature is currently clicked
        if (Object.keys(selectedLot.feature).length) {
            selectedLot.feature.setProperty('clicked', 'false');
            deletePoints(selectedLot.feature);
        }
        e.feature.setProperty('clicked', 'true');
        showLotPoints(e.feature);
        selectedLot.feature = e.feature;
    }
}

function styleFeatures(feature) {
    let fillColor, strokeColor, strokeWeight=1; 
    if (feature.getProperty('CO_TYPE_PO') === 'LO') {
        fillColor = 'green';
    }
    else if (feature.getProperty('CO_TYPE_PO') === 'PB') {
        fillColor = 'red';
    }
    else {
        console.log(feature.getProperty('CO_TYPE_PO'))
        fillColor = 'blue';
    }

    if (feature.getProperty('CO_TYPE_DI') === 'V') {
        strokeColor = 'red';
    }
    else if (feature.getProperty('CO_TYPE_DI') === 'H') {
        strokeColor = 'green';
    }
    else {
        console.log(feature.getProperty('CO_TYPE_DI'))
        strokeColor = 'blue';
    }

    if (feature.getProperty("state") === "hover") {
        strokeWeight = 2;
    }

    if (feature.getProperty("clicked") === "true") {
        strokeWeight = 2;
    }

    return {
        fillColor: fillColor,
        strokeColor: strokeColor,
        strokeWeight: strokeWeight
    }
}

async function deletePoints(feature) {
    feature.getProperty('points').forEach((marker) => {
        marker.setMap(null);
    })
    feature.getProperty('points').length = 0;
}

async function showLotPoints(feature) {
    const { Marker } = await google.maps.importLibrary("marker");

    if (!feature.getProperty('points')) {
        feature.setProperty('points', []);
    }

    const addPoint = (coords) => {
        console.log(`creating point at ${coords}`)

        feature.getProperty('points').push(new Marker({
            position: coords,
            map: window.map
        }))
        feature.getProperty('points').push(new Marker({
            position: coords,
            map: window.sv
        }))
    }
    feature.getGeometry().forEachLatLng(addPoint);
    console.log(feature.getProperty('points'));
}



async function findPanorama(svService, panoRequest, coordinates) {
    const { Map } = await google.maps.importLibrary("maps");
    const { event } = await google.maps.importLibrary("core");
    const { spherical } = await google.maps.importLibrary("geometry");
    const { Marker } = await google.maps.importLibrary("marker");
    const { StreetViewStatus, StreetViewPanorama } = await google.maps.importLibrary("streetView");

    // Send a request to the panorama service
    svService.getPanorama(panoRequest, function (data, status) {
        if (status === StreetViewStatus.OK) {
            console.debug(`Status ${status}: panorama found.`);

            // Compute the heading towards the coordinates
            const heading = spherical.computeHeading(
                data.location.latLng,
                coordinates
            );

            const sv = new StreetViewPanorama(
                document.getElementById("streetview"),
                {
                    pano: data.location.pano,
                    position: coordinates,
                    zoom: 0,
                    pov: {
                        heading: heading,
                        pitch: 0,
                    },
                    imageDateControl: true,
                    fullscreenControl: false,
                    motionTracking: false,
                    motionTrackingControl: false,
                }
            );
            sv.setPano(data.location.pano);

            const map = new Map(document.getElementById("satellite"), {
                center: coordinates,
                zoom: 18,
                controlSize: 25,
                fullscreenControl: false,
                mapTypeControl: false,
            });
            map.setStreetView(sv);

            // visualize.js:99 creating point at (45.45793510100003, -73.57552645699995)
            // visualize.js:99 creating point at (45.458137699000076, -73.57550824799993)
            // visualize.js:99 creating point at (45.45813354400008, -73.57541490999995)
    
            // load the data
            map.data.loadGeoJson(
                "./data/lots_reproj.geojson",
                { idPropertyName: "NO_LOT" },
            );
            // wait for the request to complete by listening for the first feature to be
            event.addListener(map.data, "addfeature", () => {
                console.log(`Feauture added`)
            });

            map.data.setStyle(styleFeatures)
            map.data.addListener("mouseover", e => e.feature.setProperty("state", "hover"));
            map.data.addListener("mouseout", e => e.feature.removeProperty("state"));
            map.data.addListener("click", onClick);

            // Make these available globally so we can access them later
            window.sv = sv;
            window.map = map;
            
        }
        else {
            document.getElementById("streetview").innerText = "Could not find panorama within 25m of coordinates"
        }
    });
}
