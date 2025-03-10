const express = require("express");
const cors = require("cors");
const { createProxyMiddleware } = require("http-proxy-middleware");
const http = require("http");

// Configuration
const OLLAMA_PORT = 8011;
const GLOBALTAGS_PORT = 8010;
const OLLAMA_URL = "http://127.0.0.1:11434";
const GLOBALTAGS_URL = "http://127.0.0.1:8000"; // Change this to the actual GlobalTags URL
const OLLAMA_API_KEY = "";

// Create Ollama Proxy with Authentication
const ollamaApp = express();

// Enable CORS for all routes
ollamaApp.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Log all incoming requests
ollamaApp.use((req, res, next) => {
  console.log(`\n>>> [${new Date().toISOString()}] Received ${req.method} request to ${req.url}`);
  console.log('>>> Headers:', JSON.stringify(req.headers, null, 2));
  
  // Continue to next middleware
  next();
});

// Authentication middleware
ollamaApp.use((req, res, next) => {
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
    
    if (providedApiKey !== OLLAMA_API_KEY) {
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
ollamaApp.options('*', (req, res) => {
  console.log('>>> Handling OPTIONS request directly');
  res.status(200).end();
});

// Manual proxy for /api/generate endpoint
ollamaApp.post('/api/generate', (req, res) => {
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
ollamaApp.get('/health', (req, res) => {
  console.log('>>> Health check requested');
  res.json({ status: 'ok', message: 'CORS proxy is running' });
});

// Error handling middleware
ollamaApp.use((err, req, res, next) => {
  console.error('>>> Express error:', err);
  res.status(500).json({ error: 'Server error', message: err.message });
});

// --------------------------------------------------------

// Create GlobalTags Proxy (No Auth, Just Pass-Through)
const globalTagsApp = express();
globalTagsApp.use(cors());

// Log requests for debugging
globalTagsApp.use((req, res, next) => {
  console.log(`\n>>> [${new Date().toISOString()}] GlobalTags: ${req.method} ${req.url}`);
  next();
});

// Proxy all requests to GlobalTags
globalTagsApp.use(
  "/",
  createProxyMiddleware({
    target: GLOBALTAGS_URL,
    changeOrigin: true,
    logLevel: "debug",
  })
);

// Health check
globalTagsApp.get("/health", (req, res) => {
  res.json({ status: "ok", message: "GlobalTags proxy is running" });
});




// Start both

ollamaApp.listen(OLLAMA_PORT, () => {
  console.log(`\n=== Ollama Proxy running on http://localhost:${OLLAMA_PORT} ===\n`);
});


globalTagsApp.listen(GLOBALTAGS_PORT, () => {
  console.log(`\n=== GlobalTags Proxy running on http://localhost:${GLOBALTAGS_PORT} ===\n`);
});
