import express from 'express';
import cors from 'cors';
import path from 'path';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const RENDER_API_BASE = 'https://api.render.com/v1';

app.use(cors());
app.use(express.json());

// Serve static frontend in production
const clientDist = path.join(__dirname, '../../web/dist');
app.use(express.static(clientDist));

async function proxyToRender(
  apiKey: string,
  endpoint: string,
  method: string = 'GET',
  body?: unknown
) {
  const url = `${RENDER_API_BASE}${endpoint}`;
  const res = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = data?.message || data?.error || res.statusText;
    throw new Error(`Render API error: ${message} (${res.status})`);
  }
  return data;
}

// GET /api/services - list all services
app.get('/api/services', async (req, res) => {
  const apiKey = req.headers['x-api-key'] as string;
  if (!apiKey) {
    return res.status(400).json({ error: 'API key is required' });
  }
  try {
    const data = await proxyToRender(apiKey, '/services?limit=100');
    // data is a list of { service: {...}, cursor: string }
    const services = data.map((item: any) => item.service || item);
    res.json(services);
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/services/:id/deploys - list deploys for a service
app.get('/api/services/:id/deploys', async (req, res) => {
  const apiKey = req.headers['x-api-key'] as string;
  if (!apiKey) {
    return res.status(400).json({ error: 'API key is required' });
  }
  try {
    const data = await proxyToRender(
      apiKey,
      `/services/${req.params.id}/deploys?limit=20`
    );
    const deploys = data.map((item: any) => item.deploy || item);
    res.json(deploys);
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/services/:id/deploys/:deployId/logs - get deploy logs
app.get('/api/services/:id/deploys/:deployId/logs', async (req, res) => {
  const apiKey = req.headers['x-api-key'] as string;
  if (!apiKey) {
    return res.status(400).json({ error: 'API key is required' });
  }
  try {
    const data = await proxyToRender(
      apiKey,
      `/services/${req.params.id}/deploys/${req.params.deployId}/logs`
    );
    res.json(data);
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/services/:id/logs - get runtime/service logs
app.get('/api/services/:id/logs', async (req, res) => {
  const apiKey = req.headers['x-api-key'] as string;
  if (!apiKey) {
    return res.status(400).json({ error: 'API key is required' });
  }
  try {
    const direction = (req.query.direction as string) || 'backward';
    const limit = (req.query.limit as string) || '500';
    const data = await proxyToRender(
      apiKey,
      `/services/${req.params.id}/logs?direction=${direction}&limit=${limit}`
    );
    res.json(data);
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
});

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
