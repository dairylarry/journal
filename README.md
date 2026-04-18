# journal-app

A personal journaling PWA built with React + Vite, backed by AWS Cognito (auth) and DynamoDB (storage).

## Running locally

```bash
cd frontend
npm install        # first time only
npm run dev
```

Open [http://localhost:5173/journal/](http://localhost:5173/journal/) in your browser.

## Environment variables

Create `frontend/.env.local` with your AWS credentials:

```
VITE_AWS_REGION=us-east-1
VITE_AWS_ACCESS_KEY_ID=...
VITE_AWS_SECRET_ACCESS_KEY=...
VITE_COGNITO_CLIENT_ID=...
```

## Building for production

```bash
cd frontend
npm run build
```

Output goes to `frontend/dist/`. The app is deployed to GitHub Pages at `dairylarry.github.io/journal/`.
