# Render Logs Viewer

A simple web app to view Render deployment logs. Enter your Render API key to browse your services and their deploy logs.

## How it works

1. Enter your Render API key
2. Browse your services
3. Click a service to see its recent deploys
4. Click a deploy to view its build logs

## Development

```bash
npm install
npm run dev
```

## Deploy to Render

Push to the connected GitHub repo. Render will use the `Dockerfile` and `render.yaml` to build and deploy.
