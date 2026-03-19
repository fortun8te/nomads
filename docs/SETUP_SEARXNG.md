# SearXNG Local Setup Guide

## What We Have
- **SearXNG** (local metasearch engine): http://localhost:8888
- **Ollama** (remote LLM): http://100.74.135.83:11434
- **Ad Agent System** (React frontend): http://localhost:5173

## Starting SearXNG

### Option 1: Docker Compose (Recommended)
```bash
cd /Users/mk/Downloads/ad-agent
docker-compose up -d
```

Verify it's running:
```bash
curl http://localhost:8888/status
```

### Option 2: Manual Docker
```bash
docker run -d \
  --name searxng \
  -p 8888:8080 \
  -v $(pwd)/searxng-settings.yml:/etc/searxng/settings.yml \
  -e SEARXNG_SECRET=your-secret-key-change-me \
  searxng/searxng:latest
```

## Testing the Setup

### 1. Test SearXNG Directly
```bash
curl "http://localhost:8888/search?q=test&format=json"
```

Should return JSON with search results.

### 2. Test from the App
- Start the React dev server: `npm run dev`
- Open http://localhost:5173
- Create a campaign (e.g., "Sneaker Brand", "Gen Z")
- Click "Start" and watch the Research stage
- You should see:
  - "Searching for: ..." messages
  - Real search results being retrieved
  - SearXNG sources being cited
  - Ollama (lfm-2.5) synthesizing findings

## How It Works

### Research Flow:
1. **Orchestrator (glm-4.7)** evaluates what research is needed
2. **Researcher Agents (lfm-2.5)** deployed to investigate topics
3. **For each research task:**
   - Query SearXNG for real web results
   - Pass results to Ollama for synthesis
   - Return structured findings with completeness score
4. **Orchestrator** evaluates if 95% threshold met
5. **If incomplete:** Deploy more researchers to cover gaps
6. **If complete:** Move to Taste stage

### Fallback Behavior:
- If SearXNG unavailable → LLM-only research (less grounded)
- If Ollama unavailable → Error (can't proceed)
- Research auto-retries 3 iterations before giving up

## Configuration

### searxng-settings.yml
- Located in project root (same as docker-compose.yml)
- Defines which search engines to use
- Currently configured for: Google, Bing, DuckDuckGo, Wikipedia, GitHub, arXiv
- Can edit and restart container to apply changes:
  ```bash
  docker restart searxng
  ```

### Search Engine Options
To add/remove search engines, edit `searxng-settings.yml`:
```yaml
engines:
  - name: google
    engine: google
    enabled: true
    weight: 100   # Higher = prioritized
```

## Troubleshooting

### SearXNG not responding
```bash
# Check if container is running
docker ps | grep searxng

# View logs
docker logs searxng

# Restart
docker restart searxng
```

### Search returns no results
1. Check internet connection
2. Verify search engines in settings.yml are enabled
3. Try searching in browser: http://localhost:8888

### Ollama connection issues
- Verify remote Ollama is running
- Check models available: `curl http://100.74.135.83:11434/api/tags`
- Required models:
  - `lfm-2.5:q4_K_M` (researcher synthesis)
  - `glm-4.7-flash:q4_K_M` (orchestrator)

## Stopping Services

### Stop SearXNG
```bash
docker-compose down
# or
docker stop searxng
```

### Stop Everything
```bash
# Kill React dev server (Ctrl+C in terminal)
# Stop Docker
docker-compose down
# Ollama runs remotely, no action needed
```

## Performance Notes
- First search ~3-5 seconds (SearXNG network latency)
- Ollama synthesis ~2-3 seconds per researcher
- Full research cycle typically 30-60 seconds depending on depth
- Set `timeout: 10` in SearXNG for max wait per search

## Next Steps
1. Verify SearXNG runs locally
2. Test the complete research flow with a campaign
3. Monitor console/network for actual API calls
4. Adjust search engine weights if needed
5. Phase 2: Integrate Figma MCP for Make stage
