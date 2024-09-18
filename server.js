
const { google } = require('googleapis');
const axios = require('axios');
const express = require('express');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

// Allow requests from your domain (replace with the exact domain)
app.use(cors({
  origin: 'https://www.kaspercoin.net',
  methods: ['GET']
}));

// Set up Google Sheets authentication using environment variables
const auth = new google.auth.GoogleAuth({
  credentials: {
    private_key: process.env.GOOGLE_PRIVATE_KEY, // Directly using the private key
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

const SPREADSHEET_ID = '1kjddnz-NfGjnhcla3x4_nomt7boTWDmehYM79YmS2Ks'; // Google Sheet ID

// Add a root route to handle GET requests to "/"
app.get('/', (req, res) => {
  res.send('Welcome to Kasper Price Backend API. Use /prices endpoint to fetch data.');
});

// Function to fetch Kasper floor price from the API
async function fetchKasperPrice() {
  const apiUrl = 'https://storage.googleapis.com/kspr-api-v1/marketplace/marketplace.json';
  try {
    const response = await axios.get(apiUrl);
    const kasperData = response.data.KASPER;
    return kasperData ? kasperData.floor_price : null;
  } catch (error) {
    console.error('Error fetching Kasper price:', error);
    return null;
  }
}

// Function to fetch Kaspa price for market cap calculation
async function fetchKaspaPrice() {
  const apiUrl = 'https://api.kaspa.org/price';
  try {
    const response = await axios.get(apiUrl);
    return response.data.price_usd;
  } catch (error) {
    console.error('Error fetching Kaspa price:', error);
    return null;
  }
}

// Function to store price and market cap in Google Sheets
async function storePriceAndMarketCapInSheet(floorPrice) {
  const timestamp = new Date().toISOString();
  const kaspaPrice = await fetchKaspaPrice();
  if (!kaspaPrice) {
    console.error('Kaspa price unavailable');
    return;
  }

  const marketCap = (28700000000 * floorPrice * kaspaPrice).toFixed(5); // 5 decimal places for market cap
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:C', // Adding to third column for market cap
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [[timestamp, floorPrice, marketCap]], // Add timestamp, floor price, and market cap
      },
    });
    console.log('Stored price and market cap in Google Sheets:', floorPrice, marketCap);
  } catch (error) {
    console.error('Error storing data in Google Sheets:', error);
  }
}

// Fetch and store price and market cap every 15 minutes
setInterval(async () => {
  const floorPrice = await fetchKasperPrice();
  if (floorPrice !== null) {
    await storePriceAndMarketCapInSheet(floorPrice);
  }
}, 900000); // 15 minutes

// API to fetch historical prices from Google Sheets
app.get('/prices', async (req, res) => {
  const { range } = req.query;
  let startDate;

  if (range === '1h') {
    startDate = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour
  } else if (range === '3h') {
    startDate = new Date(Date.now() - 3 * 60 * 60 * 1000); // 3 hours
  } else if (range === '1d') {
    startDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // 1 day
  } else if (range === '7d') {
    startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days
  } else if (range === '1m') {
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 1 month
  } else {
    startDate = new Date(0); // All time
  }

  try {
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:C', // Now includes the third column for market cap
    });

    const rows = result.data.values || [];
    const filteredRows = rows.filter(row => new Date(row[0]) >= startDate);
    res.json(filteredRows.map(row => ({ timestamp: row[0], price: row[1], marketCap: row[2] }))); // Return price and market cap
  } catch (error) {
    console.error('Error fetching data from Google Sheets:', error);
    res.status(500).send('Error fetching data');
  }
});

// Function to calculate and backfill market cap for old data
async function backfillMarketCap() {
  const kaspaPrice = await fetchKaspaPrice();
  if (!kaspaPrice) {
    console.error('Kaspa price unavailable');
    return;
  }

  try {
    // Fetch all existing data (timestamps and floor prices)
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:B',
    });

    const rows = result.data.values || [];
    const updatedRows = [];

    // Calculate market cap for each row
    for (let row of rows) {
      const [timestamp, floorPrice] = row;
      if (!row[2]) { // If no market cap exists for this row
        const marketCap = (28700000000 * parseFloat(floorPrice) * kaspaPrice).toFixed(5);
        updatedRows.push([timestamp, floorPrice, marketCap]); // Add market cap to each row
      }
    }

    // Update Google Sheet with the calculated market caps
    if (updatedRows.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Sheet1!A:C',
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: updatedRows,
        },
      });
      console.log('Backfilled market cap for old data.');
    }
  } catch (error) {
    console.error('Error backfilling market cap:', error);
  }
}

// Function to trigger backfilling via an endpoint (you can trigger this when necessary)
app.get('/backfill-marketcap', async (req, res) => {
  try {
    await backfillMarketCap();
    res.send('Backfill completed.');
  } catch (error) {
    res.status(500).send('Error during backfill.');
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
