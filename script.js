// --- Configuration & Global Variables --- //
const CSV_PATH = './data/coverage.csv';
const COLORS = {
    solar: 'var(--solar-color)',
    heatpump: 'var(--heatpump-color)',
    ev: 'var(--ev-color)',
    none: 'var(--inactive-color)'
};
const editPanel = document.getElementById('edit-panel');
let geoJsonLayer;
let serviceDataByArea = new Map();
let currentlyEditingArea = null;

// --- Map Initialization --- //
const bounds = L.latLngBounds(L.latLng(49.5, -8.5), L.latLng(61, 2));
const map = L.map('map', {
    maxBounds: bounds,
    minZoom: 5
}).setView([54.8, -2.5], 6);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// --- Main Application Logic --- //
async function initializeMap() {
    try {
        const csvResponse = await fetch(CSV_PATH);
        if (!csvResponse.ok) throw new Error(`Failed to load coverage.csv. Status: ${csvResponse.status}`);
        
        const csvText = await csvResponse.text();
        processServiceData(csvText);
        
        geoJsonLayer = L.geoJSON(geoJsonData, {
            style: styleFeature,
            onEachFeature: onEachFeature
        }).addTo(map);
        
        setupEventListeners();
        addLegend();
    } catch (error) {
        console.error("Map Initialization Error:", error);
        alert("Error initializing map: " + error.message);
    }
}

function processServiceData(csvString) {
    const parsed = Papa.parse(csvString, { header: true, skipEmptyLines: true });
    if (parsed.errors.length) console.error("CSV Parsing Errors:", parsed.errors);
    
    parsed.data.forEach(row => {
        if (!row.Region) return;
        const match = row.Region.match(/^[A-Z]+/);
        if (!match) return;
        const area = match[0];
        if (!serviceDataByArea.has(area)) {
            serviceDataByArea.set(area, { hasSolar: false, hasHeatPump: false, hasEv: false });
        }
        const currentData = serviceDataByArea.get(area);
        if (row['Solar Panels'] === '1') currentData.hasSolar = true;
        if (row['Heat Pumps'] === '1') currentData.hasHeatPump = true;
        if (row['Ev Chargers'] === '1') currentData.hasEv = true;
    });
}

function styleFeature(feature) {
    const showSolar = document.getElementById('solar-filter').checked;
    const showHeatPump = document.getElementById('heatpump-filter').checked;
    const showEv = document.getElementById('ev-filter').checked;
    const areaCode = feature.properties.name;
    const data = serviceDataByArea.get(areaCode);
    let color = COLORS.none;
    let fillOpacity = 0.15;
    let weight = 0.5;
    let dashArray = '2';
    if (data) {
        if (showSolar && data.hasSolar) { color = COLORS.solar; fillOpacity = 0.65; weight = 1.5; dashArray = ''; } 
        else if (showHeatPump && data.hasHeatPump) { color = COLORS.heatpump; fillOpacity = 0.65; weight = 1.5; dashArray = ''; } 
        else if (showEv && data.hasEv) { color = COLORS.ev; fillOpacity = 0.65; weight = 1.5; dashArray = ''; }
    }
    return { fillColor: color, weight: weight, opacity: 1, color: '#444', dashArray: dashArray, fillOpacity: fillOpacity };
}

function onEachFeature(feature, layer) {
    const areaCode = feature.properties.name;
    layer.bindPopup(generatePopupContent(areaCode));
    layer.on({
        mouseover: e => e.target.setStyle({ weight: 4, color: '#333', dashArray: '' }),
        mouseout: e => geoJsonLayer.resetStyle(e.target),
        click: e => openEditPanel(areaCode, layer)
    });
}

function generatePopupContent(areaCode) {
    const data = serviceDataByArea.get(areaCode);
    let content = `<b>Postcode Area: ${areaCode}</b>`;
    if (data) {
        content += `<br><hr>Services Available:`;
        if (!data.hasSolar && !data.hasHeatPump && !data.hasEv) content += '<br>None';
        if (data.hasSolar) content += `<br>✔️ Solar Panels`;
        if (data.hasHeatPump) content += `<br>✔️ Heat Pumps`;
        if (data.hasEv) content += `<br>✔️ EV Chargers`;
    } else {
         content += `<br><hr>No services defined in your data.`;
    }
    content += `<br><br><i>Click to edit services.</i>`;
    return content;
}

function openEditPanel(areaCode, layer) {
    currentlyEditingArea = { code: areaCode, layer: layer };
    if (!serviceDataByArea.has(areaCode)) {
        serviceDataByArea.set(areaCode, { hasSolar: false, hasHeatPump: false, hasEv: false });
    }
    const data = serviceDataByArea.get(areaCode);
    document.getElementById('edit-panel-title').innerText = `Edit Services for ${areaCode}`;
    document.querySelector('#edit-panel-toggles [data-service="hasSolar"]').checked = data.hasSolar;
    document.querySelector('#edit-panel-toggles [data-service="hasHeatPump"]').checked = data.hasHeatPump;
    document.querySelector('#edit-panel-toggles [data-service="hasEv"]').checked = data.hasEv;
    editPanel.classList.add('visible');
}

function closeEditPanel() {
    editPanel.classList.remove('visible');
    currentlyEditingArea = null;
}

function handleServiceEdit(e) {
    if (!currentlyEditingArea) return;
    const service = e.target.dataset.service;
    const isEnabled = e.target.checked;
    const areaCode = currentlyEditingArea.code;
    const data = serviceDataByArea.get(areaCode);
    data[service] = isEnabled;
    currentlyEditingArea.layer.setStyle(styleFeature(currentlyEditingArea.layer.feature));
    currentlyEditingArea.layer.setPopupContent(generatePopupContent(areaCode));
}

function generateAndDownloadCsv() {
    const dataToExport = [];
    serviceDataByArea.forEach((services, area) => {
        if(services.hasSolar || services.hasHeatPump || services.hasEv) {
            dataToExport.push({
                "Area": area,
                "Solar Panels": services.hasSolar ? '1' : '0',
                "Heat Pumps": services.hasHeatPump ? '1' : '0',
                "Ev Chargers": services.hasEv ? '1' : '0'
            });
        }
    });
    const csv = Papa.unparse(dataToExport);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "updated_service_coverage.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function setupEventListeners() {
    document.querySelectorAll('#filter-controls input').forEach(cb => cb.addEventListener('change', () => geoJsonLayer.setStyle(styleFeature)));
    document.getElementById('close-edit-panel').addEventListener('click', closeEditPanel);
    document.querySelectorAll('#edit-panel-toggles input').forEach(cb => cb.addEventListener('change', handleServiceEdit));
    document.getElementById('download-btn').addEventListener('click', generateAndDownloadCsv);
}
        
function addLegend() {
    const legend = L.control({position: 'bottomright'});
    legend.onAdd = function (map) {
        const div = L.DomUtil.create('div', 'legend');
        let labels = ['<strong>Service Colour Key</strong>(Priority Order)'];
        for (const service in COLORS) {
            if (service !== 'none') {
                let serviceName = service.charAt(0).toUpperCase() + service.slice(1);
                labels.push(`<i style="background:${COLORS[service]}"></i> ${serviceName}`);
            }
        }
        labels.push(`<i style="background:${COLORS.none}; opacity: 0.4;"></i> Inactive/Other`);
        div.innerHTML = labels.join('<br>');
        return div;
    };
    legend.addTo(map);
}
