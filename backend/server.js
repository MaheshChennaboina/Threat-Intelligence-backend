const express = require('express');
const cors = require('cors');
const xlsx = require('xlsx');
const Parser = require('rss-parser');
const parser = new Parser({ timeout: 120000 }); // Increase timeout to 120 seconds
const path = require('path');
const app = express();
const PORT = process.env.PORT || 5000; // Use environment variable for port

app.use(cors());

// Function to fetch RSS feeds
const fetchRSSFeeds = async (url) => {
  try {
    const feed = await parser.parseURL(url);
    console.log(`Fetched ${feed.items.length} items from ${url}`);
    return feed.items.map(item => ({
      ...item,
      sourceName: new URL(url).hostname.replace(/^www\./, '').split('.')[0] // Extract main domain name
    }));
  } catch (error) {
    console.error(`Error fetching RSS feed from ${url}:`, error);
    return [];
  }
};

// Function to extract unique source names from Excel data
const extractSourceNames = async () => {
  try {
    const workbook = xlsx.readFile(path.join(__dirname, 'articles.xlsx'));
    const sheet_name_list = workbook.SheetNames;
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheet_name_list[0]]);
    const sourceNamesSet = new Set();
    
    data.forEach(row => {
      if (row.RSSLink) {
        const hostname = new URL(row.RSSLink).hostname.replace(/^www\./, '').split('.')[0];
        sourceNamesSet.add(hostname);
      }
    });

    return Array.from(sourceNamesSet);
  } catch (error) {
    console.error('Error extracting source names:', error);
    return [];
  }
};

// API endpoint to fetch RSS feed source names
app.get('/api/sourceNames', async (req, res) => {
  try {
    const sourceNames = await extractSourceNames();
    console.log('Fetched RSS feed source names:', sourceNames);
    res.json(sourceNames);
  } catch (error) {
    console.error('Error fetching RSS feed source names:', error);
    res.status(500).json({ error: 'Error fetching RSS feed source names' });
  }
});

// API endpoint to fetch articles
app.get('/api/articles', async (req, res) => {
  try {
    const { startDate, endDate, sourceName } = req.query;
    const workbook = xlsx.readFile(path.join(__dirname, 'articles.xlsx'));
    const sheet_name_list = workbook.SheetNames;
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheet_name_list[0]]);
    let allFeeds = [];

    console.log('Starting to fetch RSS feeds from Excel data...');

    // Fetch all feeds concurrently
    const feedPromises = data.map(async (row) => {
      const rssLink = row.RSSLink; // Assuming the column is named 'RSSLink'
      if (rssLink) {
        console.log(`Fetching RSS feed from: ${rssLink}`);
        const feeds = await fetchRSSFeeds(rssLink);
        console.log(`Fetched ${feeds.length} feeds from ${rssLink}`);
        return feeds;
      } else {
        console.log('No RSS link found in row:', row);
        return [];
      }
    });

    // Wait for all feed fetching promises to resolve
    const feedsArray = await Promise.all(feedPromises);
    allFeeds = feedsArray.flat();

    // Filter articles by date range if provided
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (start.toDateString() === end.toDateString()) {
        console.log("Both start and end dates are the same");
        allFeeds = allFeeds.filter(feed => {
          const feedDate = new Date(feed.isoDate);
          return feedDate.toDateString() === start.toDateString();
        });
      } else {
        allFeeds = allFeeds.filter(feed => {
          const feedDate = new Date(feed.isoDate);
          return feedDate >= start && feedDate <= end;
        });
      }
    }

    // Filter articles by source name if provided
    if (sourceName) {
      allFeeds = allFeeds.filter(feed => {
        const feedSourceName = feed.sourceName.toLowerCase();
        return feedSourceName.includes(sourceName.toLowerCase());
      });
    }

    // Sort all feeds by published date in descending order
    allFeeds.sort((a, b) => new Date(b.isoDate) - new Date(a.isoDate));
    console.log('Total articles fetched:', allFeeds.length);
    res.json(allFeeds);
  } catch (error) {
    console.error('Error fetching articles:', error);
    res.status(500).json({ error: 'Error fetching articles' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
