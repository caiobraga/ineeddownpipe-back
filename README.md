# ineeddownpipe-back

BMW downpipe price comparison API. Scrapes multiple retailers and Amazon, exposes REST endpoints, and caches results.

**Standalone GitHub repository** — deploy with its own AWS CodeBuild pipeline (ECS + ECR recommended).

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/products` | List products (filters: `search`, `source`, `model`, `brand`, `minPrice`, `maxPrice`, `sort`) |
| GET | `/api/meta` | Filter metadata |
| POST | `/api/refresh` | Re-run scrapers |

## Local development

```bash
cp .env.example .env
npm install
npx playwright install chromium
npm run dev
```

API: http://localhost:3001

Refresh catalog: `npm run refresh`

## Environment variables

| Variable | Description |
|----------|-------------|
| `PORT` | HTTP port (default `3001`) |
| `CORS_ORIGIN` | Allowed frontend origin(s), comma-separated |
| `NODE_ENV` | `production` in AWS |

## AWS deployment (CodeBuild → ECR → ECS)

1. Create an **ECR** repository (e.g. `ineeddownpipe-api`).
2. Create a **CodeBuild** project connected to this GitHub repo.
3. Use `buildspec.yml` (Docker path).
4. Set environment variables:
   - `AWS_ACCOUNT_ID`
   - `AWS_DEFAULT_REGION`
   - `IMAGE_REPO_NAME` (ECR repo name)
5. CodeBuild role needs: ECR push, CloudWatch Logs.
6. **ECS** service:
   - Task port `3001`
   - Mount EFS or host volume at `/app/data` for scrape cache
   - Env: `CORS_ORIGIN=https://your-cloudfront-domain`
7. Pipeline **Deploy** stage: use `imagedefinitions.json` artifact.

### Compile-only build (no Docker)

Use `buildspec.compile.yml` if you run Node on EC2/Elastic Beanstalk instead of containers.

## Docker (manual)

```bash
docker build -t ineeddownpipe-api .
docker run -p 3001:3001 -e CORS_ORIGIN=http://localhost:5173 -v $(pwd)/data:/app/data ineeddownpipe-api
```

## Repo layout

```
.
├── buildspec.yml          # CodeBuild → ECR
├── buildspec.compile.yml  # CodeBuild → artifacts only
├── Dockerfile
├── src/
│   ├── index.ts
│   ├── scrapers/
│   └── data/seed.json
└── data/                  # runtime cache (gitignored)
```
