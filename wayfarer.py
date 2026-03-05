# Wayfarer — async web research pipeline
# github.com/pvliesdonk/pvl-webtools

import asyncio
import json
import os
import sys
import time

# Default SearXNG URL — pvl-webtools reads SEARXNG_URL automatically
if "SEARXNG_URL" not in os.environ:
    os.environ["SEARXNG_URL"] = "http://localhost:8080"

from pvlwebtools import web_search, web_fetch, FetchConfig


async def research(
    query: str,
    num_results: int = 10,
    concurrency: int = 20,
    extract_mode: str = "article",  # "article" | "markdown" | "raw"
) -> dict:
    """
    Fetch clean text content from multiple web pages for a search query.

    Pure web fetching layer — no LLM calls, no agents.
    Returns structured results ready for AI agent consumption.
    """
    t0 = time.monotonic()

    # --- Step 1: Search ---
    try:
        search_results = await web_search(query, max_results=num_results)
    except Exception as e:
        # Never throw — return empty result
        return _empty_result(query, time.monotonic() - t0, error=str(e))

    if not search_results:
        return _empty_result(query, time.monotonic() - t0)

    # Build sources list (raw SearXNG results, untouched)
    sources = [
        {"url": r.url, "title": r.title, "snippet": r.snippet}
        for r in search_results
    ]

    # --- Step 2: Fetch all URLs concurrently ---
    sem = asyncio.Semaphore(concurrency)
    fetch_config = FetchConfig(request_timeout=15.0)

    async def _fetch_one(result) -> dict:
        try:
            async with sem:
                page = await web_fetch(
                    result.url,
                    extract_mode=extract_mode,
                    rate_limit=False,  # We throttle via semaphore instead
                    config=fetch_config,
                )
                return {
                    "url": result.url,
                    "title": result.title,
                    "content": page.content,
                    "snippet": result.snippet,
                    "source": extract_mode,
                }
        except Exception:
            return {
                "url": result.url,
                "title": result.title,
                "content": "",
                "snippet": result.snippet,
                "source": "failed",
            }

    pages = await asyncio.gather(*[_fetch_one(r) for r in search_results])

    # --- Step 3: Filter and build output ---
    success_count = 0
    text_parts = []

    for page in pages:
        if page["source"] == "failed" or len(page["content"]) < 150:
            if len(page["content"]) < 150 and page["source"] != "failed":
                page["source"] = "failed"  # Too short = useless
            continue

        success_count += 1
        text_parts.append(f"### {page['title']}\nSource: {page['url']}\n\n{page['content']}")

    elapsed = round(time.monotonic() - t0, 2)

    return {
        "query": query,
        "text": "\n\n---\n\n".join(text_parts),
        "pages": list(pages),
        "sources": sources,
        "meta": {
            "total": len(search_results),
            "success": success_count,
            "elapsed": elapsed,
        },
    }


def _empty_result(query: str, elapsed: float, error: str = "") -> dict:
    """Return a valid but empty result dict."""
    return {
        "query": query,
        "text": "",
        "pages": [],
        "sources": [],
        "meta": {
            "total": 0,
            "success": 0,
            "elapsed": round(elapsed, 2),
            "error": error or None,
        },
    }


# --- CLI ---
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python wayfarer.py <your query here>")
        sys.exit(1)

    query = " ".join(sys.argv[1:])

    async def _main():
        result = await research(query)
        m = result["meta"]
        chars = len(result["text"])
        print(f"pages {m['success']}/{m['total']} | {m['elapsed']}s | {chars:,} chars")
        print(json.dumps(result, indent=2, ensure_ascii=False))

    asyncio.run(_main())
