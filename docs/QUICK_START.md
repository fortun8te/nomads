# NOMADS - Quick Start

## 5-Minute Setup

### 1. Start Ollama
```bash
ollama serve
```
(or it might already be running)

### 2. Start the App
```bash
cd /Users/mk/Downloads/ad-agent
npm run dev
```

Visit: `http://localhost:5173`

### 3. Create a Campaign
1. Click "Use This Preset" on any preset
2. (Or fill out custom campaign form)
3. Click "START" button

### 4. Watch Cycle Execute
- Research stage runs (~30-60s)
- Taste stage runs (~20-40s)
- Make stage (pending - not implemented yet)
- Test stage (pending - not implemented yet)
- Memories stage archives results

### 5. Done!
Output persists in browser. Reload page = data still there.

---

## Common Commands

| Task | Command |
|------|---------|
| Start dev server | `npm run dev` |
| Production build | `npm run build` |
| Check Ollama | `curl http://localhost:11434/api/tags` |
| Pull new model | `ollama pull mistral` |
| List local models | `ollama list` |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Ollama connection failed" | Make sure `ollama serve` is running |
| Output not showing | Check browser console for errors |
| Campaign not saving | Clear IndexedDB in DevTools, reload |
| Cycle won't start | Check Ollama has `mistral` model (`ollama pull mistral`) |

---

## File to Check First

- **Main docs**: `NOMADS.md` (you're reading the quick version)
- **Most important code**: `src/hooks/useCycleLoop.ts`
- **Prompts**: `src/utils/prompts.ts`
- **State**: `src/context/CampaignContext.tsx`

---

## What's Next?

See `NOMADS.md` → "Next Steps" section
