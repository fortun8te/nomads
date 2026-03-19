# NOMADS - Known Blockers & Issues

## Critical Blockers (Can't Continue Without These)

### 1. Figma Make Stage Integration
**Status**: 🔴 BLOCKED
**Impact**: Can't generate visual designs - Make stage is not implemented
**Root Cause**: No programmatic way to create designs in Figma with available tools

**Details**:
- `generate_figma_design` tool only available in Claude Code (not here)
- Figma MCP can **read** designs but not **create** them
- Available alternatives are manual/workaround-based

**Workarounds** (in priority order):
1. **Option A**: Use Claude Code's "Code to Canvas" feature
   - Run ad-agent locally
   - Use Claude Code to capture running UI → Figma
   - Manual workflow but most direct

2. **Option B**: Implement API-based design generation
   - Use Claude API to generate SVG/HTML
   - Have users manually import into Figma
   - Works but less integrated

3. **Option C**: Manual Figma workflow
   - Use Research/Taste output as brief
   - Have designer manually create in Figma
   - Then use Figma MCP to read back the design

**Next Step**: Decide which approach to take

---

### 2. Test Stage - No Vision LLM
**Status**: 🔴 BLOCKED
**Impact**: Can't evaluate designs - Test stage placeholder only
**Root Cause**: No Vision model integrated

**Details**:
- Test stage needs to analyze visual designs
- Requires Claude 4V or similar Vision capability
- Not currently connected to the app

**Solution**:
```typescript
// Add to useOllama or new useVision hook
const vision = await fetch('/api/evaluate-design', {
  method: 'POST',
  body: JSON.stringify({ imageUrl, designOutput })
});
```

**Requirements**:
- Claude API key (if using Anthropic)
- Or use local Vision model if available
- Add API endpoint for evaluation

---

## Non-Critical Issues (App Works, But Could Be Better)

### 1. Real-Time Streaming Display
**Status**: ⚠️ PARTIAL
**Current**: Output shows on stage completion (full text appears)
**Desired**: Character-by-character streaming in UI

**Issue**:
- Streaming callbacks work in `useOllama.ts`
- But UI doesn't efficiently update per character
- Would need debouncing/batching for good UX

**Impact**: Minor - output appears after ~30-60 seconds instead of gradually
**Fix Difficulty**: Medium - needs UI optimization

---

### 2. Claude CLI Not in PATH
**Status**: ⚠️ MINOR
**Issue**: `claude mcp` commands don't work from terminal
**Root Cause**: CLI binary is part of Electron app, not standalone

**Current Workaround**: Use full path
```bash
/Applications/Claude.app/Contents/MacOS/Claude mcp list
```

**Proper Solution**: Install via native installer
```bash
curl -fsSL https://claude.ai/install.sh | bash
```

**Impact**: Can't run MCP management from CLI, but MCP itself works fine

---

### 3. Error Messages Could Be Better
**Status**: ⚠️ USABILITY
**Issue**: Some error messages are generic
**Examples**:
- "Ollama connection failed" → doesn't explain why
- "Model not found" → doesn't suggest running `ollama pull`

**Fix**: Add contextual help text to error display

---

### 4. No Progress Indicator During Execution
**Status**: ⚠️ UX
**Issue**: User doesn't know if stage is still running
**Desired**: Loading indicator, ETA, or progress bar

**Current**: Status changes from RUNNING → COMPLETED with pause
**Better**: Show "Processing... stage" message

---

## Non-Issues (Expected Behavior)

### 1. Takes 60+ Seconds Per Stage
- ✅ **Expected**: Ollama inference is slow on local hardware
- **Not a bug**: This is how local models work
- **Optimization**: Would need faster hardware or cloud inference

### 2. Requires Local Ollama Running
- ✅ **Expected**: Design choice for privacy
- **Not a bug**: Could integrate cloud Ollama, but local is intentional
- **Alternative**: Switch to Claude API (would require API key)

### 3. Data Stored in Browser, Not Cloud
- ✅ **Expected**: IndexedDB is local-only by design
- **Not a bug**: Great for privacy, can't sync across devices
- **Future**: Add cloud sync with user login

### 4. No Campaign Sharing
- ✅ **Expected**: Local-first design doesn't support sharing yet
- **Not a bug**: Would need backend for this
- **Future**: Can be added when needed

---

## Environment Issues

### Issue: Ollama Connection Timeout
**Symptoms**:
- "Ollama connection failed" error
- Stages don't run

**Debugging**:
```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Start Ollama
ollama serve

# Check models available
ollama list

# Pull missing model
ollama pull mistral
```

**Fix**: Ensure Ollama running and model available

---

### Issue: Wrong Port (11434)
**Symptoms**:
- Connection refused
- "Can't reach http://localhost:11434"

**Check**:
```bash
# Where is Ollama running?
lsof -i :11434

# What ports are in use?
netstat -an | grep -E "LISTEN|11434"
```

**Fix**: Either start Ollama on right port or update config in `useOllama.ts`

---

### Issue: OutOfMemory During Inference
**Symptoms**:
- Process killed mid-stage
- "signal 9" or "Killed"

**Cause**: Not enough RAM for model
- Mistral 7B needs ~8GB RAM
- Neural-chat needs ~6GB RAM

**Solutions** (in order):
1. Close other apps
2. Use smaller model (`neural-chat` instead of `mistral`)
3. Get more RAM
4. Use cloud Ollama

---

## Browser Issues

### IndexedDB Not Persisting
**Symptoms**:
- Data lost after reload
- Campaigns disappear

**Causes**:
1. Private/Incognito mode (IndexedDB disabled)
2. Browser cleared storage
3. IndexedDB corrupted

**Fix**:
```javascript
// In DevTools Console
await indexedDB.databases().then(dbs => {
  dbs.forEach(db => indexedDB.deleteDatabase(db.name));
});
```
Then reload and recreate campaign

---

### CORS Errors
**Symptoms**:
- Ollama works, but errors about CORS
- "Request blocked by browser"

**Cause**: Ollama running without CORS headers

**Fix**: If Ollama is remote, need CORS proxy or headers configured

---

## Performance Issues

### Slow Inference
**Cause**: Local Ollama on slow hardware

**Mitigation**:
1. Use faster model: `neural-chat` < `mistral`
2. Reduce batch size
3. Use quantized models
4. Switch to cloud inference

### Slow UI Updates
**Cause**: React re-rendering inefficiently

**Fix**: Profile with React DevTools
- Check for unnecessary re-renders
- Use `useCallback` for functions
- Memoize expensive computations

---

## What's Intentionally NOT Implemented

These aren't bugs - they're design decisions:

1. **Multi-user support** - Single local user by design
2. **Campaign sharing** - Would need backend
3. **Real-time collaboration** - Not applicable for local app
4. **Offline mode** - Always offline by design
5. **Auto-save** - Explicit save via context updates
6. **Campaign templates** - Only presets, not custom templates
7. **Undo/redo** - Not implemented, could add
8. **Export formats** - Only internal storage format
9. **Dark mode** - Not implemented (dark by design)
10. **Mobile responsive** - Desktop-only by design

---

## How to Report New Issues

When you find a bug:

1. **Reproduce it**: Can you do it consistently?
2. **Gather info**:
   - What did you do?
   - What happened?
   - What did you expect?
   - Browser console errors?
   - Network tab issues?
3. **Check blockers**: Is it in this file?
4. **Update NOMADS.md**: Add to "Known Issues" if reproducible

---

## Issue Priority Matrix

| Issue | Severity | Effort | Priority |
|-------|----------|--------|----------|
| Make stage blocked | 🔴 Critical | High | P0 |
| Test stage blocked | 🔴 Critical | High | P0 |
| Streaming display | 🟡 Minor | Medium | P3 |
| Error messages | 🟡 Minor | Low | P3 |
| CLI not in PATH | 🟢 Cosmetic | Low | P4 |

---

## Workaround Summary

| Blocker | Workaround | Rating |
|---------|-----------|--------|
| Can't create Figma designs | Manual Figma workflow | ⭐⭐ OK |
| Can't evaluate designs | Manual review | ⭐ Not ideal |
| No real-time streaming | Wait for output | ⭐⭐⭐ Fine |
| Claude CLI missing | Use full path | ⭐⭐⭐ Fine |

---

**Last Updated**: February 26, 2026
