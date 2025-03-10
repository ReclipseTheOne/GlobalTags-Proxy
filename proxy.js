const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const http = require('http');

// Configuration
const PORT = 8123;
const OLLAMA_URL = 'http://127.0.0.1:11434';
const API_KEY = 'API KEY'; // Change this to your desired API key

// Create Express app
const app = express();

// Start with debugging info
console.log('=== Starting CORS proxy server with debugging ===');

// Enable CORS for all routes
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Log all incoming requests
app.use((req, res, next) => {
  console.log(`\n>>> [${new Date().toISOString()}] Received ${req.method} request to ${req.url}`);
  console.log('>>> Headers:', JSON.stringify(req.headers, null, 2));
  
  // Continue to next middleware
  next();
});

// Authentication middleware
app.use((req, res, next) => {
  // Skip auth for OPTIONS
  if (req.method === 'OPTIONS') {
    console.log('>>> Skipping auth for OPTIONS request');
    return next();
  }
  
  try {
    const authHeader = req.headers.authorization;
    console.log('>>> Auth header:', authHeader);
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('>>> Missing or invalid Authorization header');
      return res.status(401).json({ error: 'Authentication failed' });
    }
    
    const providedApiKey = authHeader.split(' ')[1];
    console.log('>>> Provided API key:', providedApiKey);
    
    if (providedApiKey !== API_KEY) {
      console.log('>>> Invalid API key');
      return res.status(403).json({ error: 'Invalid API key' });
    }
    
    console.log('>>> Authentication successful');
    next();
  } catch (err) {
    console.error('>>> Authentication error:', err);
    return res.status(500).json({ error: 'Authentication error' });
  }
});

// Handle OPTIONS requests directly
app.options('*', (req, res) => {
  console.log('>>> Handling OPTIONS request directly');
  res.status(200).end();
});

// Manual proxy for /api/generate endpoint
app.post('/api/generate', (req, res) => {
  console.log('>>> Handling POST request to /api/generate');
  
  // Collect request body data
  let bodyData = '';
  req.on('data', chunk => {
    bodyData += chunk;
  });
  
  req.on('end', () => {
    console.log('>>> Request body:', bodyData);
    
    // Prepare the proxied request
    const options = {
      hostname: '127.0.0.1',
      port: 11434,
      path: '/api/generate', // Keep the original path
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyData)
        // Authorization header intentionally omitted
      }
    };
    
    console.log('>>> Sending request to Ollama with options:', options);
    
    const proxyReq = http.request(options, proxyRes => {
      console.log('>>> Received response from Ollama:', proxyRes.statusCode);
      console.log('>>> Response headers:', proxyRes.headers);
      
      // Set response headers
      Object.entries(proxyRes.headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
      
      // Set status code
      res.statusCode = proxyRes.statusCode;
      
      // Collect response data
      let responseData = '';
      proxyRes.on('data', chunk => {
        responseData += chunk;
      });
      
      proxyRes.on('end', () => {
        console.log('>>> Response body from Ollama:', responseData);
        res.end(responseData);
      });
    });
    
    proxyReq.on('error', e => {
      console.error('>>> Error making request to Ollama:', e);
      res.status(500).json({ error: 'Proxy error', message: e.message });
    });
    
    // Send the request
    proxyReq.write(bodyData);
    proxyReq.end();
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  console.log('>>> Health check requested');
  res.json({ status: 'ok', message: 'CORS proxy is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('>>> Express error:', err);
  res.status(500).json({ error: 'Server error', message: err.message });
});

// Start the server
app.listen(PORT, () => {
  console.log(`\n=== CORS proxy running on http://localhost:${PORT} ===`);
  console.log(`=== Proxying requests to ${OLLAMA_URL} ===`);
  console.log(`=== API Key: ${API_KEY} ===\n`);
});