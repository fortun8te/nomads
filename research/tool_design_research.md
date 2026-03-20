# LLM Tool Design Research: Best Practices for Reliable Agent Tool Use

*Research compiled March 2026. Sources: Anthropic docs, OpenAI cookbook, Qwen-Agent source, ReAct paper, HuggingFace blog, Instructor, AutoGen, LangChain, and academic literature.*

---

## 1. The ReAct Pattern: Reasoning + Acting

### What ReAct Is

ReAct (Yao et al., 2022 — arxiv:2210.03629) is the foundational framework for agents that interleave reasoning and tool use. The core insight: pure chain-of-thought reasoning hallucinates; pure action without reasoning is brittle. Combining them forces grounding.

**The canonical loop:**

```
Question: [user query]
Thought 1: [reasoning about what to do next]
Action 1: Search["collagen supplement market trends 2025"]
Observation 1: [actual result from the tool]
Thought 2: [reasoning about the observation, what's still missing]
Action 2: Lookup["market size"]
Observation 2: [result]
...
Action N: Finish[final answer]
```

**Key results from the paper:**
- 34% and 10% absolute success rate improvements over action-only baselines on two different task types
- Only 1-2 in-context examples needed to induce the behavior
- Dramatically reduces hallucination compared to chain-of-thought alone, because every factual claim is grounded in an Observation
- Generates "human-like task-solving trajectories" that are interpretable and correctable

### Why ReAct Prevents Hallucination

The Observation step is the mechanism. When the model is forced to externalize its reasoning as a Thought before acting, and then receive a real Observation before continuing, it cannot confabulate. The chain-of-thought token positions that would otherwise contain fabricated facts are instead positions that must await external input. This structural constraint is more powerful than any instruction to "not make things up."

### ReAct vs. Pure Function Calling

Modern LLM APIs (Anthropic, OpenAI) implement a cleaned-up version of ReAct natively through the `stop_reason: tool_use` / `tool_calls` mechanism. The Thought step becomes the text block the model outputs before requesting a tool call. The Observation becomes the `tool_result` message. The loop is the same; the format differs.

For local models (Ollama, Qwen) without native tool calling, you must implement the ReAct loop yourself in the system prompt using text markers.

---

## 2. Tool Description Design: What Makes LLMs Call Tools Correctly

This is the highest-leverage area. A badly described tool will be miscalled regardless of model capability. A well-described tool can compensate for a weaker model.

### The Anthropic Tool Schema

The canonical format (from Anthropic docs):

```json
{
  "name": "get_weather",
  "description": "Get the current weather in a given location",
  "input_schema": {
    "type": "object",
    "properties": {
      "location": {
        "type": "string",
        "description": "The city and state, e.g. San Francisco, CA"
      },
      "unit": {
        "type": "string",
        "enum": ["celsius", "fahrenheit"],
        "description": "The unit of temperature, either \"celsius\" or \"fahrenheit\""
      }
    },
    "required": ["location"]
  }
}
```

Three components: `name`, `description`, and `input_schema`. Each carries distinct information load.

### Rule 1: Tool Names Are Lookup Keys, Not Documentation

The name is the one thing the model must output exactly. Keep it:
- Snake_case or camelCase consistently
- Verb-first for actions: `search_web`, `get_customer`, `send_email`
- Noun-first for reads: `weather_forecast`, `customer_profile`
- Never include spaces or special characters
- Short enough that spelling errors during generation are unlikely

### Rule 2: The Description Is a Decision Contract

The model reads descriptions to decide WHEN to call a tool, not HOW. The description must answer: "Under what conditions should I call this tool instead of something else or nothing?"

Bad: `"Search the web"` — ambiguous, when vs. web_fetch?
Good: `"Search the web for current information on a query. Use this when you need facts, news, or data not in your training. Returns a list of results with titles, URLs, and snippets. Do not use for fetching specific URLs — use fetch_url for that."`

The good description:
- States what it does (search)
- States when to use it (current info, facts you don't have)
- States what it returns (results with titles/URLs/snippets)
- States what NOT to use it for (disambiguation from adjacent tools)

**Description length:** Anthropic's own examples use 1 sentence for simple tools. For tools with complex triggering conditions or disambiguation needs, 3-5 sentences is appropriate. Do not pad; every word should carry signal.

### Rule 3: Parameter Descriptions Are the Instruction Set

The model generates parameter values by reading parameter descriptions. A parameter description is the spec for what the model must produce.

Best practices:
- Always include the format: `"The city and state, e.g. San Francisco, CA"` — the example makes the format unambiguous
- Use enum types for categorical values — forces the model to pick from a controlled vocabulary
- For date params: `"ISO 8601 date string, e.g. 2025-03-15"` — not `"a date"`
- For ID params: `"The numeric customer ID from the database, e.g. 12345"` — not `"customer identifier"`
- For search query params: `"The search query to run. Be specific; include relevant context. E.g. 'collagen supplement market size 2025 US'"` — this shapes generation quality, not just format

### Rule 4: Required vs Optional — Default to Required

Every parameter should be `required` unless there is a meaningful default behavior when it's absent. Reasons:
- Optional parameters with implicit defaults confuse the model about when to include them
- If the model omits a param you actually need, your code must handle None/undefined
- Better to make it required and let the model ask for clarification than to accept garbage defaults

For genuinely optional params (e.g., `unit` in weather), include the default in the description: `"Temperature unit. Defaults to celsius if not specified."`

### Rule 5: Enums Are Strongly Preferred to Free Text

Wherever a parameter has a bounded set of valid values, use `enum`. This:
- Reduces hallucinated values (model constrained to pick from the list)
- Makes parsing deterministic
- Forces schema conformance

With `strict: true` (Anthropic's structured output mode), enum violations are caught at the API level. Use it in production.

### Rule 6: Fewer, Broader Tools Beat Many Narrow Tools

The model must select the right tool from your list. More tools = more selection errors. Design tools at the semantic level the model operates at, not at the mechanical level of your API.

Wrong: `search_web_google`, `search_web_bing`, `search_web_ddg` — 3 tools for the same concept
Right: `search_web` — 1 tool, implementation picks the backend

Wrong: `get_customer_by_id`, `get_customer_by_email`, `get_customer_by_phone` — 3 tools
Right: `get_customer(identifier_type, identifier_value)` — 1 tool with a type param

The model thinks in terms of intent ("I need customer info"), not implementation ("which index to query"). Match tool abstraction to model abstraction.

Exception: if two tools have genuinely different preconditions, side effects, or return shapes that the model needs to reason about, separate them.

### Rule 7: Poka-Yoke — Design Out Error Cases

From Anthropic's engineering blog (building-effective-agents): the SWE-bench implementation discovered that requiring **absolute file paths** instead of relative paths eliminated an entire class of tool errors. This is "error-proofing" (poka-yoke) applied to tool design.

Ask of every parameter: "What values would break this tool, and can I make them impossible to produce?" Common applications:
- Use `enum` instead of free-text for bounded choices
- Require a `unit` enum instead of inferring from context
- Require `date_format: "YYYY-MM-DD"` in the description rather than accepting any format
- If a tool requires a specific resource to exist, include a `check_exists` tool and instruct the model to verify first

---

## 3. System Prompt Structure for Reliable Tool Use

The system prompt is where you shape the model's behavior across all tool interactions. It needs to establish:

### A. Role and Purpose

State clearly what the agent's job is, what tools it has access to, and what its goal is. Keep this tight — every sentence the model reads costs context and attention.

Example structure:
```
You are a research agent. Your job is to answer questions about consumer markets
using web research. You have access to the following tools: [list tools].

Your process:
1. Identify what information is needed to answer the question
2. Use search_web to find relevant sources
3. Use fetch_url to read the full content of promising sources
4. Synthesize findings and answer

When you have enough information to answer confidently, stop searching and respond.
```

### B. Explicit Tool Selection Rules

When tools have overlapping domains, the system prompt must contain unambiguous rules for which to use when. Do not rely on tool descriptions alone for disambiguation.

```
Tool selection rules:
- Use search_web when you need to find sources on a topic
- Use fetch_url when you have a specific URL to read
- Use get_from_memory when you need information from previous cycles
- Never call search_web more than 5 times in a single response
```

### C. Thinking Before Acting — The `<thinking>` Block Pattern

For complex multi-step tasks, instruct the model to reason before each action. Anthropic's extended thinking feature surfaces this; for local models, you instruct it explicitly:

```
Before calling any tool, write a brief thought explaining:
- What information you currently have
- What is still missing
- Why this specific tool call will help

Format: Thought: [your reasoning]
Then make the tool call.
```

This forces the model to plan before acting rather than reflexively calling tools. It catches cases where the needed information is already in context (preventing redundant calls) and cases where no tool is needed (preventing hallucinated calls).

**Key finding from HuggingFace agent research:** the explicit "Thought:" prefix before action selection is what makes open-source model agents reliable. Without it, models jump directly to action and make selection errors at high rates (10%+ on GAIA benchmark even for Mixtral-8x7B).

### D. Output Format for Final Answer

Always include explicit instructions for when to stop and how to signal completion:

```
When you have a complete answer:
- Do not make any more tool calls
- Write "Final Answer:" followed by your response
- Base your answer only on what you found via tools; do not add facts from memory
```

The "Final Answer:" delimiter is load-bearing — it prevents the model from continuing to call tools after it has enough information.

---

## 4. Handling Wrong Arguments: Error Feedback Formats

The model will make mistakes. What you return as a tool_result when an error occurs determines whether the model self-corrects.

### The Error Result Format

Return errors as tool results, not as exceptions or empty responses. The model cannot see your stack trace; it can only see what you return in the tool_result.

```json
{
  "type": "tool_result",
  "tool_use_id": "toolu_01...",
  "is_error": true,
  "content": "Error: The location parameter 'SF' is not a valid city. Please provide the full city name and state, e.g. 'San Francisco, CA'."
}
```

Key elements:
1. **State what went wrong** — not just "invalid input"
2. **State what the model did wrong** — "SF is not a valid city"
3. **State what the correct format is** — "full city name and state"
4. **Include an example** — "e.g. San Francisco, CA"

This mirrors the structure of parameter descriptions. The model was trained on input-output pairs; error messages that match the description format trigger the same correction behavior.

### The Retry Pattern

After returning an error result, do NOT end the conversation. The model loop continues; the model sees the error and tries again. This is the mechanism for self-correction.

From Instructor's approach: implement schema validation first (Pydantic-style), then automatically retry with the error message as context. The model usually corrects on the first retry given a specific enough error message. Set a max_retries limit (2-3) before escalating to a human fallback.

### What Not to Do

- Do not return an empty result on error — the model cannot distinguish empty from "tool returned nothing"
- Do not return just "error" — the model cannot generate a correction without knowing what was wrong
- Do not let exceptions surface to the model as unhandled — the model will hallucinate what the tool "would have returned"

---

## 5. Showing Tool Results So the Model Can Reason About Them

### Compression Before Return

For web scraping tools, never return raw HTML. Always return:
- Extracted text content (cleaned markdown or plain text)
- Metadata: URL, title, date if available
- Length indication: "Result: 3,847 chars"

The model's context window is finite. A 100KB HTML page compressed to 3KB of clean text serves the model far better and uses 97% less context.

For large results, return a summary + offer to dig deeper:
```
Summary: [3-paragraph summary of the article]
Full content available via: fetch_url_section(url, section_index)
```

### Format for Structured Data

Return structured data as clean JSON, not raw API responses. Strip all metadata the model doesn't need:

```json
{
  "customer_id": 12345,
  "name": "Jane Smith",
  "email": "jane@example.com",
  "plan": "professional",
  "created_at": "2024-01-15"
}
```

Not:
```json
{
  "_metadata": {"request_id": "abc123", "timestamp": 1234567890, "version": "v3.2"},
  "data": {"customer_id": 12345, "name": "Jane Smith", ...},
  "pagination": {"cursor": null, "has_more": false}
}
```

The model has to parse the result and identify relevant information. Reduce its work.

### Citation Discipline

A core hallucination prevention mechanism: instruct the model to cite the specific tool result for every factual claim in its response. The system prompt should say:

```
In your final answer, cite which tool call produced each piece of information
using the format [Source: tool_name("query")].
Do not state any facts that do not come from a tool result.
```

This forces the model into a mode where every output sentence is grounded in a specific observation, rather than free-generating from training data.

---

## 6. High-Level vs. Low-Level Tools

### The Abstraction Level Question

The right level of tool abstraction is: **one step above what the model would do anyway**.

If you give a model a raw SQL query tool, it will generate SQL. This is error-prone (SQL syntax mistakes, wrong table names, wrong column names). Instead, give it a `search_customers(name?, email?, plan?)` tool — it only needs to provide the parameters that match the search concept.

If you give a model a raw HTTP request tool, it will construct HTTP requests, handling headers, auth, encoding — lots of opportunity for errors. Instead, give it a `get_weather(location, unit)` tool.

**Rule:** Abstract away anything that requires technical knowledge the model shouldn't need to exercise. Surface only the semantic parameters the model should reason about.

### When Low-Level Tools Are Appropriate

- When the model IS the engineer (code interpreter, terminal)
- When the abstraction would obscure information the model needs to reason about
- When you need to compose many operations dynamically (the model is better at composition than you are at predicting all compositions)

For the ad agent use case: `search_web(query)` is the right level. `run_searxng_query(endpoint, headers, payload)` is too low. `research_competitor_ads(brand_name)` is too high (the model can't adapt the query).

---

## 7. Preventing Hallucinated Tool Results

This is the most dangerous failure mode: the model fabricates what a tool would have returned without actually calling it.

### Causes

1. The tool description is so vague the model thinks it can infer the result
2. The context is long and the model loses track of whether it already called the tool
3. The model is "trying to be helpful" and fills in what seems plausible

### Prevention Techniques

**Technique 1: Force explicit tool-before-claim ordering in the system prompt**
```
Rule: You MUST call a tool and receive a result before stating any fact about
the external world. Never state what a tool "would return" — only state what
a tool DID return.
```

**Technique 2: Use stop_reason verification**
In your loop logic, verify that `stop_reason == "tool_use"` before treating the message as a tool call. If the model outputs text that looks like a tool call but `stop_reason == "end_turn"`, the model is narrating, not acting — discard it and prompt again.

**Technique 3: Require thinking blocks before calling**
When the model must articulate WHY it is calling a tool before calling it, it cannot simultaneously fabricate results (the reasoning and the fabricated result would be in obvious tension).

**Technique 4: Validate result plausibility**
If your tool returns a web scrape result, the model should not know what it says before you return it. If the model's summary of the result appears before the tool call in the message stream, something is wrong. Log this case.

**Technique 5: Instruction about unknown information**
```
If you do not have enough information to answer, say so explicitly.
Do not invent plausible-sounding information.
Use the phrase "I was unable to find information about X" rather than guessing.
```

---

## 8. Structured Output Forcing: Making LLMs Output Valid JSON Reliably

### Cloud Models (Anthropic/OpenAI)

**Anthropic:** Use `strict: true` in tool definitions. This guarantees schema conformance — tool call inputs will always match the declared schema exactly. For prose output that must be JSON, use the Structured Outputs API (beta as of early 2026).

**OpenAI:** Use `response_format: {"type": "json_schema", "json_schema": {...}}` for guaranteed JSON. Combined with function calling, this is the most reliable approach for cloud models.

### Local Models (Ollama/Qwen)

Local models do not have native structured output enforcement. Strategies:

**Strategy 1: Grammar-constrained generation**
Some Ollama builds support `format: "json"` parameter which applies a JSON grammar constraint at the token level — only valid JSON tokens can be generated. This is more reliable than prompt-only approaches.

**Strategy 2: The extraction wrapper**
Generate free text, then run a second smaller model call to extract structured data from it. Cheaper extraction models (0.5b-1b) can reliably parse structured data from prose if you give them clear extraction instructions.

**Strategy 3: Prompt-level enforcement**
Instruct the model to output JSON only, include an example of the exact format, and use temperature=0. This is unreliable for complex schemas but works for simple key-value outputs.

**Strategy 4: Pydantic + retry (Instructor pattern)**
Generate → validate with Pydantic → if invalid, re-generate with error message in context. Usually converges in 1-2 retries. Effective for schemas up to moderate complexity.

**Strategy 5: XML tags instead of JSON**
For many use cases, XML-style tags are more reliably generated than JSON because:
- No bracket matching required
- More forgiving of whitespace
- LLMs are trained on vast amounts of HTML/XML
- Easier to parse with simple string operations

```
<search_query>collagen supplement market 2025</search_query>
<reasoning>I need recent market data to understand competitive landscape</reasoning>
```

This is what Qwen-Agent's NousFnCallPrompt does: `<tool_call>...</tool_call>` and `<tool_response>...</tool_response>` tags rather than raw JSON function calls.

---

## 9. Tool Use with Local Models (Ollama/Qwen) vs. Cloud Models

### The Core Difference

Cloud models (Claude, GPT-4) have been fine-tuned on function calling data at scale. The tool call schema is effectively part of their instruction-following behavior. Local models vary enormously in how well they've been tuned for this.

**Qwen 3.5 (your models) — what the source tells us:**
- Qwen3 uses "Hermes-style tool use" as the recommended approach
- The canonical format in Qwen-Agent is `<tool_call>{"name": ..., "arguments": {...}}</tool_call>` / `<tool_response>...</tool_response>` (Nous format)
- There is also an older ✿FUNCTION✿ / ✿ARGS✿ / ✿RESULT✿ / ✿RETURN✿ token format (the QwenFnCallPrompt format in source)
- **For Qwen3 specifically: do NOT use ReAct stopword-based tool calling** — the thinking tokens can interfere with stopword detection
- The `fncall_prompt_type='nous'` is the recommended default for Qwen3

### Qwen Prompt Format (Nous style — recommended for Qwen3/Qwen3.5)

System prompt injection:
```
# Tools

You may call one or more functions to assist with the user query.

You are provided with function signatures within <tools></tools> XML tags:
<tools>
{"type": "function", "function": {"name": "search_web", "description": "...", "parameters": {...}}}
</tools>

For each function call, return a json object with function name and arguments within <tool_call></tool_call> XML tags:
<tool_call>
{"name": <function-name>, "arguments": <args-json-object>}
</tool_call>
```

Tool results are returned as:
```
<tool_response>
{"results": [...], "query": "collagen supplement market 2025"}
</tool_response>
```

### Key Differences: Local vs. Cloud Tool Calling

| Aspect | Cloud (Claude/GPT-4) | Local (Qwen/Ollama) |
|--------|---------------------|---------------------|
| Schema enforcement | Native (`strict: true`) | Prompt-only or grammar constraints |
| Tool call format | API-level structured | Text-based, must parse |
| Error rate | ~1-2% on well-described tools | 5-15% depending on model size |
| Retry behavior | API handles | You implement the loop |
| Argument JSON validity | Guaranteed with strict mode | Must validate and retry |
| Parallel tool calls | Supported | Supported in Qwen3 (via Qwen-Agent) |
| Thinking/reasoning | Extended thinking (Claude) | `<think>` tokens (Qwen3) |

### Reliability Tips Specific to Local Models

1. **Temperature=0 for tool selection and argument generation.** Sampling variance causes JSON syntax errors and wrong parameter choices. Use low temperature specifically during tool-calling turns.

2. **Parse tool calls defensively.** The model may output valid-looking XML/JSON with invalid arguments. Always validate: check required fields present, check types, check enum values. Return specific error messages on failure.

3. **Use stop tokens.** When using text-based tool calling formats, set stop tokens to the closing tag (e.g., `</tool_call>`) to prevent the model from generating the observation itself.

4. **Smaller models need more examples.** A 0.8b or 2b model needs 2-3 few-shot examples of the tool call format in the system prompt. A 9b+ model usually works zero-shot from the format description alone.

5. **Separate tool-calling from prose generation.** Use your capable model for the tool-calling decision turn (selecting what to call and with what args). Use a smaller, faster model for compression and synthesis. This is already how the ad agent works and it's the right pattern.

6. **Watch for JSON truncation.** Small models sometimes truncate long JSON arguments. Add a length check: if the raw output ends without a closing `}` before `</tool_call>`, treat it as a failed call and retry.

---

## 10. Prompt Patterns That Work Best With Qwen Models

Based on the Qwen-Agent source code and Qwen documentation:

### Pattern 1: Explicit Tool Enumeration in System Prompt

Qwen models respond better when the system prompt explicitly names which tools are available and when to use each:

```
## You have access to the following tools:

### search_web
search_web: Search the internet for current information. Parameters: {"query": {"type": "string", "description": "..."}} Format the arguments as a JSON object.

### fetch_url
fetch_url: Retrieve and read the content of a specific URL. Parameters: {...}
```

The QwenFnCallPrompt format includes both a human-readable name and a model-usable name (`name_for_human` vs `name_for_model`), allowing documentation separate from the token the model must output.

### Pattern 2: Thinking Before Tool Use (Qwen3-specific)

Qwen3 and Qwen3.5 models have a `<think>` block capability (similar to Claude's extended thinking). For complex decisions, instruct the model to think first:

```
Before making any tool call, use <think>...</think> to reason about:
- What information do you currently have?
- What is still missing?
- Which tool would best address the gap?
```

**Critical:** The `thought_in_content` flag in Qwen-Agent controls parsing behavior. When thinking is enabled, the parser must correctly separate `<think>` content from actual tool calls — otherwise `<tool_call>` tags inside thinking blocks get parsed as actual calls.

### Pattern 3: Hard Stop Signals

Qwen models benefit from very explicit "I am done" signals:

```
✿RETURN✿ [final answer text]
```

or for the Nous format:

```
Final Answer: [your answer based on tool results]
```

Without an explicit stop signal, the model sometimes continues generating unnecessary tool calls after reaching the answer.

### Pattern 4: Argument Validation Instruction

Add to system prompt:
```
Before calling any tool, verify that you have all required parameters.
If a required parameter is unknown, use search_web to find it first,
or ask the user for clarification.
Never invent parameter values.
```

This is more effective with Qwen than with cloud models because Qwen models are more literal in following such constraints.

---

## 11. Summary: The Key Answers

### What makes a tool description that LLMs reliably call correctly?

1. Clear trigger condition: when to use THIS tool vs. alternatives
2. Concrete parameter examples embedded in descriptions (`e.g. "San Francisco, CA"`)
3. Enum types for all bounded-choice parameters
4. Explicit non-use cases (what this tool is NOT for)
5. Return value description (what the model will get back)

### How should tool parameters be designed to minimize errors?

- Minimize the number of parameters (cognitive load per call)
- Use enums everywhere possible
- Mark as required unless there's a meaningful default
- Include format examples for all string parameters
- Prefer absolute references (absolute paths, full names) over relative/abbreviated ones

### What's the best system prompt structure for reliable tool use?

1. Role and purpose statement (1-2 sentences)
2. Tool list with selection rules (when to use each)
3. Process / step-by-step workflow
4. Thinking instruction (reason before acting)
5. Stopping condition and final answer format
6. Hallucination guard ("only state facts from tool results")

### How do you handle wrong args?

Return a tool_result with `is_error: true` and a message that:
(a) names the wrong parameter, (b) states the problem, (c) provides the correct format/example. Let the loop continue; the model retries.

### Should tools be high-level (semantic) or low-level (mechanical)?

High-level / semantic. Abstract away implementation details. Surface only the concepts the model should reason about. One exception: when the model IS doing the technical work (code interpreter, file editor).

### What's the best way to show tool results so the LLM can reason about them?

- Compress raw content (HTML→clean text, API response→relevant fields only)
- Include metadata (URL, title, date) for web results
- Keep under ~2000 tokens per result where possible
- Format as clean JSON or clean text, not raw API dumps

### How do you prevent hallucinated tool results?

- Structural: verify `stop_reason` before treating model output as a tool call
- Prompt: "Only state facts that come from a tool result you have received"
- Procedural: require citations of which tool call produced each fact
- Temperature: use low temp during tool selection/argument generation turns

---

## 12. Applied Recommendations for the Ad Agent (Qwen3.5 via Ollama)

Given the project's specific stack:

1. **Use the Nous format** (`<tool_call>...</tool_call>`) for all local model tool use — it's what Qwen3 was trained on and is most reliable. Do not use the ✿FUNCTION✿ format (older, less reliable on 3.x series).

2. **Thread thinking separation carefully.** When Qwen3.5 models produce `<think>` blocks, do NOT parse for `<tool_call>` inside them. The Qwen-Agent source code shows the parser explicitly skips `<tool_call>` tags found between `<think>` and `</think>`.

3. **Temperature discipline.** Use temperature=0 for stages that need to output structured JSON/tool calls (orchestrator decision, structured output extraction). Use higher temperature (0.7-0.9) for creative stages (Make, Taste).

4. **Small model + schema = bad.** The qwen3.5:0.8b and 2b models should NOT be doing free-form JSON generation. Either use them for text tasks only, or use grammar-constrained generation (Ollama `format: "json"`). Give complex tool calling to 4b+ models.

5. **Error result protocol.** Every tool wrapper should catch exceptions and return `{"error": "description of what went wrong and what to provide instead"}` rather than letting the exception propagate. The model loop should detect the error key and retry.

6. **Compress before returning.** The researchAgents.ts pipeline already does this (compression step after Wayfarer fetch). This is correct. Keep this pattern for any new tools added.

7. **Per-stage tool isolation.** Don't expose all tools to all stages. The Make stage doesn't need search_web. The Research orchestrator doesn't need file writing. Reducing the tool list per stage reduces selection errors.

8. **Few-shot examples in system prompt for 2b model.** If using qwen3.5:2b for anything that requires structured output, add 1-2 complete examples of the input-output format in the system prompt. The 4b+ models work zero-shot; 2b does not reliably.

---

## Sources

- Yao et al. (2022). ReAct: Synergizing Reasoning and Acting in Language Models. arxiv:2210.03629
- Anthropic. Tool Use with Claude. platform.claude.com/docs/en/build-with-claude/tool-use
- Anthropic. Building Effective Agents. anthropic.com/engineering/building-effective-agents
- Anthropic Cookbook. Research Lead Agent and Research Subagent prompts. github.com/anthropics/anthropic-cookbook
- Qwen-Agent source. nous_fncall_prompt.py and qwen_fncall_prompt.py. github.com/QwenLM/Qwen-Agent
- Qwen documentation. Function calling guide. qwen.readthedocs.io
- Ollama. Tool support announcement. ollama.com/blog/tool-support
- HuggingFace. Open-source LLMs as agents. huggingface.co/blog/open-source-llms-as-agents
- Instructor. Reliable structured output via Pydantic. python.useinstructor.com
- Eugene Yan. LLM Patterns. eugeneyan.com/writing/llm-patterns
- AutoGen. AssistantAgent source. github.com/microsoft/autogen
- LangChain. ReAct agent implementation. github.com/langchain-ai/langchain
- RetricSu/sisyphus. ReAct TypeScript implementation. github.com/RetricSu/sisyphus
