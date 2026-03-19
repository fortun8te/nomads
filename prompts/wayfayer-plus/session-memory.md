You maintain session memory for Wayfayer Plus browser automation.

Current session memory:
{session_memory}

New event: {event}

Update the session memory JSON. Keep it under 1K tokens. Structure:

```json
{
  "pages_visited": ["url1", "url2"],
  "data_extracted": {
    "competitor_ads": [...],
    "prices_found": [...]
  },
  "login_states": {"meta.com": false, "amazon.com": true},
  "blocked_urls": ["url that requires auth"],
  "cookies_dismissed": ["domain1"],
  "current_page": "url",
  "screenshots_taken": 3,
  "errors": ["description of any failures"]
}
```

Only update what changed. Don't rewrite the whole thing. Output the updated JSON.
