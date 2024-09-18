const { google } = require('googleapis');
const axios = require('axios');
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// Set up Google Sheets authentication using environment variables
const auth = new google.auth.GoogleAuth({
  credentials: {
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Handle line breaks in the private key
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

const SPREADSHEET_ID = '1kjddnz-NfGjnhcla3x4_nomt7boTWDmehYM79YmS2Ks'; // Google Sheet ID

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

// Function to store price in Google Sheets
async function storePriceInSheet(price) {
  const timestamp = new Date().toISOString();
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:B',
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [[timestamp, price]],
      },
    });
    console.log('Stored price in Google Sheets:', price);
  } catch (error) {
    console.error('Error storing data in Google Sheets:', error);
  }
}

// Fetch and store price every 15 minutes
setInterval(async () => {
  const price = await fetchKasperPrice();
  if (price !== null) {
    await storePriceInSheet(price);
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
      range: 'Sheet1!A:B',
    });

    const rows = result.data.values || [];
    const filteredRows = rows.filter(row => new Date(row[0]) >= startDate);
    res.json(filteredRows.map(row => { return { timestamp: row[0], price: row[1] }; }));
  } catch (error) {
    console.error('Error fetching data from Google Sheets:', error);
    res.status(500).send('Error fetching data');
  }
};

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
