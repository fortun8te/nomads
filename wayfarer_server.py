# Wayfarer HTTP Server — FastAPI wrapper around wayfarer.research()
# Run: uvicorn wayfarer_server:app --host 0.0.0.0 --port 8889

import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from wayfarer import research

app = FastAPI(title="Wayfarer", description="Async web research API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ResearchRequest(BaseModel):
    query: str
    num_results: int = 10
    concurrency: int = 20
    extract_mode: str = "article"


class BatchQuery(BaseModel):
    query: str
    num_results: int = 10


class BatchRequest(BaseModel):
    queries: list[BatchQuery]
    concurrency: int = 20
    extract_mode: str = "article"


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/research")
async def do_research(req: ResearchRequest):
    result = await research(
        query=req.query,
        num_results=req.num_results,
        concurrency=req.concurrency,
        extract_mode=req.extract_mode,
    )
    return result


@app.post("/batch")
async def do_batch(req: BatchRequest):
    tasks = [
        research(
            query=q.query,
            num_results=q.num_results,
            concurrency=req.concurrency,
            extract_mode=req.extract_mode,
        )
        for q in req.queries
    ]
    results = await asyncio.gather(*tasks)
    return {"results": list(results)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8889)
