// Function to fetch price data from your backend API
async function fetchPriceData(range) {
    const apiUrl = `https://your-heroku-app-url/prices?range=${range}`; // Replace with your actual backend URL

    try {
        const response = await fetch(apiUrl);
        const data = await response.json();

        return data.map(p => ({ timestamp: p.timestamp, price: parseFloat(p.price).toFixed(3) }));
    } catch (error) {
        console.error('Error fetching price data:', error);
        return [];
    }
}

// Initialize Chart.js
const ctx = document.getElementById('priceChart').getContext('2d');
const priceChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: [], // Time labels
        datasets: [{
            label: 'KASPER Floor Price (KAS)',
            data: [], // Prices
            borderColor: 'rgba(75, 192, 192, 1)',
            borderWidth: 2,
            fill: false,
        }]
    },
    options: {
        responsive: true,
        scales: {
            x: {
                display: true,
                title: {
                    display: true,
                    text: 'Time'
                }
            },
            y: {
                display: true,
                title: {
                    display: true,
                    text: 'Floor Price (KAS)'
                }
            }
        }
    }
});

// Function to update the chart with new data
async function updateChart(range) {
    const data = await fetchPriceData(range);

    if (data.length > 0) {
        const labels = data.map(d => new Date(d.timestamp).toLocaleTimeString());
        const prices = data.map(d => d.price);

        priceChart.data.labels = labels; // Add time labels
        priceChart.data.datasets[0].data = prices; // Add prices

        priceChart.update(); // Update the chart
    }
}

// Load data for the selected range
function loadData(range) {
    updateChart(range);
}

// Initial chart load (1 hour data)
loadData('1h');
