import { subscribeChanges } from '@mindlog/core';
import { Router } from 'express';
import { requireAuth, userId } from '../middleware/auth.js';

// Server-Sent Events stream of data changes for the authenticated user. Both the
// REST API and the MCP server emit through the core change bus, so the web UI can
// refresh in real time regardless of which client made the change.
export const eventsRouter = Router();

eventsRouter.get('/', requireAuth, (req, res) => {
  const uid = userId(req);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Defensive: also tells nginx not to buffer this response.
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  res.write('retry: 3000\n\n');

  const unsubscribe = subscribeChanges(uid, (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  // Heartbeat keeps the connection alive through proxies/load balancers.
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
});
