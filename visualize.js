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

// Global object keeping track of the currently selected lot
const selectedLot = {
    feature: {},
}
let infoWindow;

function onClick(e) {
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
        createInfoWindow(e);
    }
}

function styleFeatures(feature) {
    let fillColor, strokeColor, strokeWeight=1, visible = true, fillOpacity = 0.35; 
    if (feature.getProperty('utilisatio') === null || feature.getProperty('utilisatio') === '9100') {
        visible = false;
    }

    else if (feature.getProperty('utilisatio') === '1000' && feature.getProperty('id_provinc') === 'Multiple')  {
        fillColor = "#red";
        strokeColor = "red";
    }
    else if (feature.getProperty('utilisatio') === '1000')  {
        fillColor = "#55eb34";
        strokeColor = "#2dbf0d";
    }
    else {
        fillColor = "#fff533";
        strokeColor = '#fcfc12';
    }

    if (feature.getProperty("state") === "hover") {
        strokeWeight = 2;
        fillOpacity = 0.65;
    }

    if (feature.getProperty("clicked") === "true") {
        strokeWeight = 2;
        fillOpacity = 0.65;
    }

    return {
        fillColor: fillColor,
        fillOpacity: fillOpacity,
        strokeColor: strokeColor,
        strokeWeight: strokeWeight,
        visible: visible,
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

    const svgMarker = {
        path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
        fillColor: "#55eb34",
        strokeColor: "#2dbf0d",
        fillOpacity: 0.8,
        strokeWeight: 1,
        rotation: 0,
        scale: 4,
      };

    if (!feature.getProperty('points')) {
        feature.setProperty('points', []);
    }

    const addPoint = (coords) => {
        console.log(`creating point at ${coords}`)

        feature.getProperty('points').push(new Marker({
            position: coords,
            map: window.map,
            icon: svgMarker,
        }))
        feature.getProperty('points').push(new Marker({
            position: coords,
            map: window.sv,
            icon: svgMarker,
        }))
    }
    feature.getGeometry().forEachLatLng(addPoint);
    console.log(feature.getProperty('points'));
}


// Helper function for the infowindow.
async function createInfoWindow(event) {
    let feature = event.feature;

    let content =
        '<span style="font-size:small">Usage: ' + feature.getProperty('usag_predo') +
        '(' + feature.getProperty('utilisatio') + ')' +
        '<br/> Provinc. ID: ' + feature.getProperty('id_provinc') + 
        '<br/> Area: ' + feature.getProperty('sup_totale') + ' m2' +
        '<br/> Lot ID: ' + feature.getProperty('no_lot') +
        '<br/> Num dwellings: ' + feature.getProperty('nb_logemen') + 
        '<br/> Num locals: ' + feature.getProperty('nb_locaux') + '</span>';
  
    updateInfoWindow(content, event.latLng);
}

  // Helper function to create an info window.
function updateInfoWindow(content, center) {
    infoWindowMap.setContent(content);
    infoWindowMap.setPosition(center);
    infoWindowMap.open({
        map: window.map,
        shouldFocus: false,
    });
    // Streetview Infowindow
    // infoWindowSv.setContent(content);
    // infoWindowSv.setPosition(center);
    // infoWindowSv.open({
    //   map: window.sv,
    //   shouldFocus: false,
    // });
}

async function findPanorama(svService, panoRequest, coordinates) {
    const { Map, InfoWindow } = await google.maps.importLibrary("maps");
    const { event } = await google.maps.importLibrary("core");
    const { spherical } = await google.maps.importLibrary("geometry");
    const { StreetViewStatus, StreetViewPanorama } = await google.maps.importLibrary("streetView");

    infoWindowMap = new InfoWindow({});
    infoWindowSv = new InfoWindow({});

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
    
            // load the data
            map.data.loadGeoJson(
                "./data/lots_subset_verdun.geojson",
                { idPropertyName: "OBJECTID" },
            );

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
