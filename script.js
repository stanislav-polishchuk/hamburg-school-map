const stateShapes = {
    'SH': 'circle',
    'HH': 'square'
};

let allSchools = [];
let map;
let markersLayer;
let cityChoices;

document.addEventListener('DOMContentLoaded', () => {
    // Initialize Map centered between SH and HH
    map = L.map('map').setView([53.8, 10.0], 9);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    markersLayer = L.layerGroup().addTo(map);

    // Filter Elements
    const searchInput = document.getElementById('search-input');
    const citySelectElement = document.getElementById('city-select');
    const resetBtn = document.getElementById('reset-filters');

    // Fetch and plot schools
    fetch('/api/schools')
        .then(response => response.json())
        .then(schools => {
            console.log(`Loaded ${schools.length} schools`);
            allSchools = schools;

            // Populate City Select
            const cities = [...new Set(schools.map(s => s.ort).filter(Boolean).map(c => c.trim()))].sort();

            // Init Choices
            cityChoices = new Choices(citySelectElement, {
                removeItemButton: true,
                placeholder: true,
                placeholderValue: 'Filter by City',
                searchPlaceholderValue: 'Search cities...',
                shouldSort: false, // already sorted
            });

            const choices = cities.map(city => ({
                value: city,
                label: city
            }));

            cityChoices.setChoices(choices, 'value', 'label', true);

            renderSchools(allSchools);

            // Event Listeners
            searchInput.addEventListener('input', filterSchools);
            citySelectElement.addEventListener('change', filterSchools);
            resetBtn.addEventListener('click', () => {
                searchInput.value = '';
                cityChoices.removeActiveItems();
                filterSchools();
            });
        })
        .catch(err => console.error('Error loading schools:', err));
});

function filterSchools() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const citySelectElement = document.getElementById('city-select');
    // Choices.js hides original, but updates it? Or checks 'getValue'?
    // Standard select element tracking usually works if library updates it.
    // Let's use the element options

    const selectedOptions = Array.from(citySelectElement.selectedOptions).map(o => o.value);
    const filterCity = selectedOptions.length > 0;

    const filtered = allSchools.filter(school => {
        const matchesSearch = !searchTerm ||
            school.name.toLowerCase().includes(searchTerm) ||
            (school.ort && school.ort.toLowerCase().includes(searchTerm));

        const matchesCity = !filterCity || selectedOptions.includes(school.ort);

        return matchesSearch && matchesCity;
    });

    renderSchools(filtered);
}

function renderSchools(schools) {
    markersLayer.clearLayers();
    const coordinateMap = new Map();

    schools.forEach(school => {
        if (school.lat && school.lng) {
            let lat = school.lat;
            let lng = school.lng;
            const key = `${lat},${lng}`;

            // Add jitter if coordinates already exist
            if (coordinateMap.has(key)) {
                const count = coordinateMap.get(key);
                const angle = count * (Math.PI * 2 / 5);
                const radius = 0.0002;
                lat += Math.cos(angle) * radius;
                lng += Math.sin(angle) * radius;
                coordinateMap.set(key, count + 1);
            } else {
                coordinateMap.set(key, 1);
            }

            const state = school.state || 'SH';
            const color = getRatingColor(school.rating, state);
            const shape = (state === 'HH') ? 'square' : 'circle';

            let marker;
            if (shape === 'circle') {
                marker = L.circleMarker([lat, lng], {
                    radius: 8,
                    fillColor: color,
                    color: '#fff',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.8
                });
            } else {
                const icon = L.divIcon({
                    className: 'custom-square-marker',
                    html: `<div style="width:14px; height:14px; background:${color}; border:2px solid #fff; box-shadow: 0 0 2px rgba(0,0,0,0.5);"></div>`,
                    iconSize: [16, 16],
                    iconAnchor: [8, 8]
                });
                marker = L.marker([lat, lng], { icon: icon });
            }

            const popupContent = `
                <div class="school-popup">
                    <h3>${school.name}</h3>
                    <p>${school.schulform}</p>
                    <p>${school.ort}, ${school.kreis}</p>
                    <span class="rating-badge" style="background-color: ${color}">
                        Index: ${school.rating} (${state})
                    </span>
                </div>
            `;

            marker.bindPopup(popupContent);
            marker.addTo(markersLayer);
        }
    });
}

function getRatingColor(rating, state) {
    if (state === 'SH') {
        if (rating <= 3) return '#2ecc71';
        if (rating <= 6) return '#f1c40f';
        return '#e74c3c';
    }
    else {
        if (rating >= 5) return '#2ecc71';
        if (rating >= 3) return '#f1c40f';
        return '#e74c3c';
    }
}
