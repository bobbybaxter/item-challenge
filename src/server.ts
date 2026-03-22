/**
 * Local Development Server
 *
 * A simple HTTP server for testing your handlers locally.
 * Run with: pnpm dev
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { createItemHandler, getAllItemsHandler, getItemHandler } from './handlers/item.js';

const PORT = process.env.PORT || 3000;

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const { method, url } = req;

  // Parse request body
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  await new Promise((resolve) => req.on('end', resolve));

  const parsedBody = body ? JSON.parse(body) : null;

  console.log(`${method} ${url}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    let result;

    // Example routes - implement your own routing logic
    // TODO: make this more scalable
    if (method === 'GET' && url === '/api/items') {
      result = await getAllItemsHandler();
    } else if (method === 'POST' && url === '/api/items') {
      result = await createItemHandler(parsedBody);
    } else if (method === 'GET' && url?.startsWith('/api/items/')) {
      const id = url.split('/').pop();
      result = await getItemHandler(id!);
    } else {
      result = {
        statusCode: 404,
        body: { error: 'Route not found' },
      };
    }

    if (!result) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
      return;
    }

    res.writeHead(result.statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result.body));
  } catch (error) {
    console.error('Server error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
}

const server = createServer(handleRequest);

server.listen(PORT, () => {
  console.log(`\n🚀 Server running at http://localhost:${PORT}`);
  console.log(`\nExample endpoints:`);
  console.log(`  GET    http://localhost:${PORT}/api/items - Get all items`);
  console.log(`  POST   http://localhost:${PORT}/api/items - Create a new item`);
  console.log(`  GET    http://localhost:${PORT}/api/items/:id - Get an item by ID`);
  console.log(`\nPress Ctrl+C to stop\n`);
});
