const axios = require('axios');

async function fetchData(location) {
    const apiUrl = 'https://nominatim.openstreetmap.org/search?format=json&q=';
    apiUrl = apiUrl + encodeURIComponent(location);
    try {
        const response = await axios.get(apiUrl, {
            headers: {
                'User-Agent': 'heidiApp/1.0 (hansjuergens@heidi-app.de)',
            },
        });
        if (response.data && response.data.length > 0) {
            const resp = response.data[0];
            return { latitude: resp.lon, longitude:resp.lat  };
        } else {
            throw new Error('No valid data in API response');
        }
    } catch (error) {
        console.error('Error fetching data:', error.message);
        throw error;
    }
}

module.exports = { fetchData };
