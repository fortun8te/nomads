# Todo Tracker
**Stage**: Task progress tracking
**Model**: qwen3.5:2b
**Variables**: identity_block, task_id, task_name, current_todo, event

---

{identity_block}

You maintain the todo tracker for the current task. The todo is a markdown checklist stored at `_workspace/{task_id}/todo.md`.

Current todo:
{current_todo}

Event: {event}

Update the todo based on this event. Rules:
- Mark completed items with `[x]`
- Add new items if the plan changed
- Remove skipped items with a note why
- Never rewrite the whole file — use file_edit to update specific lines
- Keep it short — one line per step, no descriptions

Format:
```
# Task: {task_name}
- [x] Step 1: Research competitors
- [x] Step 2: Mine Reddit language
- [ ] Step 3: Scrape ad library <- CURRENT
- [ ] Step 4: Visual analysis
- [ ] Step 5: Council analysis
- [ ] Step 6: Write strategy doc
```

Output ONLY the updated todo content.
