# Agentic Loop Architecture Research
## OpenHands vs SWE-agent: Patterns Worth Stealing

**Researched:** 2026-03-20
**Sources:** GitHub repos — All-Hands-AI/OpenHands (69k stars), princeton-nlp/SWE-agent (18k stars)

---

## 1. High-Level Architecture Overview

### OpenHands (V0 — production codebase, V1 SDK in progress)

OpenHands uses an **event-stream architecture** rather than a direct function-call loop. The core pieces:

- `AgentController` — async orchestrator that listens on an `EventStream`
- `CodeActAgent` — the decision-making agent with a `step(state) -> Action` interface
- `State` — a unified object carrying full history, metrics, and flags
- `Condenser` — pluggable module that compresses history before each LLM call
- `StuckDetector` — dedicated subsystem that detects loop patterns in history

The main loop is **event-driven, not polling**. The controller subscribes to an EventStream. When an observation arrives from the environment, `on_event()` fires, which calls `should_step()`, which calls `_step()` if appropriate. The agent never actively "polls" — it reacts to events.

### SWE-agent

SWE-agent uses a simpler **direct call loop** with rich error handling:

- `DefaultAgent` — both orchestrator and decision-maker, owns `run()` and `step()`
- `ToolHandler` — manages tool parsing, blocklists, state commands, documentation generation
- `HistoryProcessor` chain — pluggable pipeline applied to history before each LLM call
- `RetryAgent` — wrapper that can run multiple attempts and pick the best via a reviewer LLM
- Trajectory is a separate, append-only record distinct from the LLM history

The main loop is `while not step_output.done: step_output = self.step()`. Brutally simple. All complexity is in `forward_with_handling()` which wraps the actual model call.

---

## 2. Thought → Action → Observation Cycle

### OpenHands: Action Types as a Type System

Every possible agent behavior is a **typed dataclass** that extends `Action`. Actions are either `runnable` (require environment execution and generate an Observation) or non-runnable (state changes, messages). The full action space:

```
CmdRunAction           — bash shell command
IPythonRunCellAction   — Jupyter Python cell
FileEditAction         — str_replace or LLM-based edit
FileReadAction         — read file content
BrowseInteractiveAction — browser interaction
AgentDelegateAction    — spawn a sub-agent
AgentFinishAction      — terminate
AgentThinkAction       — log reasoning (no-op externally)
CondensationAction     — compress history
MessageAction          — user/agent message
MCPAction              — MCP server tool call
```

The controller dispatches each action type to the right handler. The `runnable` flag on the action class controls whether the controller waits for an Observation before the next step. This is clean: you never check "did the agent produce a command?" — you check `action.runnable`.

**Key insight:** The agent always produces exactly one action per step. Multiple tool calls are queued in `self.pending_actions: deque` and popped one at a time. The controller only sees one action at a time. This prevents the "parallel tool call confusion" problem.

### SWE-agent: Separation of History and Trajectory

SWE-agent makes a crucial architectural distinction:

- **History** (`list[HistoryItem]`) — what gets sent to the LLM each step (possibly processed/compressed)
- **Trajectory** (`list[TrajectoryStep]`) — append-only forensic record of everything that happened

Every step adds to both. But history can be modified by HistoryProcessors (elide old observations, add cache hints, etc.). Trajectory is never modified — it's the ground truth for replay, evaluation, and debugging.

The `StepOutput` type captures everything from one step:
```python
class StepOutput(BaseModel):
    query: list[dict]      # what was sent to LLM
    thought: str           # parsed reasoning
    action: str            # parsed command
    output: str            # raw LLM output
    observation: str       # environment response
    execution_time: float
    done: bool
    exit_status: str | None
    submission: str | None
    state: dict[str, str]  # environment state variables (cwd, open file, etc.)
    tool_calls: list | None
    thinking_blocks: list | None  # extended thinking / reasoning traces
```

The `state` dict comes from **state commands** — shell scripts that run after every action to capture current environment state (cwd, current file in window, current git diff, etc.). This state is injected into the next prompt template automatically.

---

## 3. Error Recovery Patterns

### SWE-agent: Layered Error Recovery with Requery

This is SWE-agent's most sophisticated pattern. `forward_with_handling()` implements a **structured retry hierarchy**:

```python
while n_format_fails < self.max_requeries:
    try:
        return self.forward(history)

    # REQUERY errors — don't add to main history, reask with error message
    except FormatError:          # malformed tool call
        n_format_fails += 1
        history = get_model_requery_history(format_error_template, ...)
    except _BlockedActionError:  # banned command (vim, emacs, etc.)
        n_format_fails += 1
        history = get_model_requery_history(blocklist_error_template, ...)
    except BashIncorrectSyntaxError:  # pre-validated before execution
        n_format_fails += 1
        history = get_model_requery_history(shell_check_error_template, ...)

    # EXIT errors — attempt to extract whatever patch exists and submit
    except ContextWindowExceededError:
        return attempt_autosubmission_after_error("exit_context", ...)
    except CostLimitExceededError:
        return attempt_autosubmission_after_error("exit_cost", ...)
    except CommandTimeoutError:
        return attempt_autosubmission_after_error("exit_command_timeout", ...)
```

**Critical insight:** When the model produces a malformed action or a blocked command, the error is NOT added to the main conversation history. Instead, `get_model_requery_history()` builds a temporary message list (history + failed output + error message) and requeries the model. If the model self-corrects, the mistakes disappear from the conversation. If it keeps failing after `max_requeries` (default 3), it exits gracefully.

The special tokens `###SWE-AGENT-RETRY-WITH-OUTPUT###` and `###SWE-AGENT-RETRY-WITHOUT-OUTPUT###` can be embedded in tool output to trigger requery from within tools themselves (not just on parse errors).

**Bash syntax pre-validation:** Before executing any bash command, SWE-agent runs `bash -n` on it. If there are syntax errors, it requeries without ever touching the environment. This prevents wasted shell state from failed commands.

### OpenHands: StuckDetector with 5 Loop Patterns

OpenHands runs `StuckDetector.is_stuck()` before every step. It detects:

1. **Same action + same observation** repeated 4 times
2. **Same action + ErrorObservation** repeated 3 times
3. **Monologue** — agent sends itself the same message 3 times with no observations between
4. **Alternating pattern** — (A1,O1,A2,O2) repeated 3 times (2-step loop)
5. **Context window error loop** — 10+ consecutive condensation events with nothing between them

When stuck is detected, the controller raises `AgentStuckInLoopError`. In interactive mode, the UI can offer 3 recovery options: restart from before the loop, restart from last user message, or stop. In headless mode, it terminates.

The `_eq_no_pid` comparison is careful: for `IPythonRunCellAction` containing file edits, it compares only the first 3 lines of code (not the whole thing), and for `CmdOutputObservation` it ignores the PID. This prevents false negatives from non-deterministic identifiers.

---

## 4. Context Length Management

### OpenHands: Pluggable Condenser System

OpenHands has a sophisticated **condenser registry** with 8 implementations:

| Condenser | Behavior |
|-----------|----------|
| `NoOpCondenser` | Pass all events through unchanged |
| `RecentEventsCondenser` | Keep only last N events |
| `ConversationWindowCondenser` | Sliding window by token count |
| `ObservationMaskingCondenser` | Replace observation content with placeholders |
| `AmortizedForgettingCondenser` | Forget events in batches to amortize cost |
| `LLMSummarizingCondenser` | Use an LLM to summarize forgotten events |
| `LLMAttentionCondenser` | Use an LLM to select important events |
| `StructuredSummaryCondenser` | Structured summary with task tracking |
| Pipeline | Chain multiple condensers |

The `LLMSummarizingCondenser` prompt is particularly well-designed. It instructs the summarizer to track:

```
USER_CONTEXT:    essential user requirements
TASK_TRACKING:   active tasks with exact IDs and statuses (PRESERVE TASK IDs)
COMPLETED:       done tasks with brief results
PENDING:         remaining work
CURRENT_STATE:   variables, data structures
CODE_STATE:      file paths, function signatures
TESTS:           failing cases, error messages
CHANGES:         code edits
DEPS:            dependencies
VERSION_CONTROL_STATUS: branch, PR status, commits
```

The condenser can return either a `View` (processed event list) or a `Condensation` (a CondensationAction that gets added to the event stream, causing the agent to step immediately with a fresh view). This allows lazy condensation — the condenser triggers itself when needed, not on every step.

**Prompt caching support:** Both systems add Anthropic prompt cache control marks to the conversation. OpenHands does it in `ConversationMemory.apply_prompt_caching()`. SWE-agent has a `CacheControlHistoryProcessor` that adds `cache_control: {type: ephemeral}` to the last N user messages. The key insight: cache the system prompt and early context which rarely changes.

### SWE-agent: HistoryProcessor Chain

SWE-agent applies a configurable chain of processors to history before each LLM call:

- `LastNObservations(n=5)` — keep only last 5 observations, replace older ones with `"Old environment output: (N lines omitted)"`. The `polling` parameter (default 1) staggers the cutoff point to reduce cache invalidation — you don't change the cutoff every step.
- `ClosedWindowHistoryProcessor` — tracks which file windows are still "active". Replaces closed window observations with `"Outdated window with N lines omitted..."`. This is domain-specific: if you're no longer in a file, you don't need its scroll history.
- `CacheControlHistoryProcessor` — sets Anthropic cache marks on last 2 user messages
- `RemoveRegex` — strips arbitrary patterns (e.g., `<diff>.*</diff>`) from older history items
- `TagToolCallObservations` — can tag specific tool outputs to force them to always be kept or always be removed

**Observation truncation with explanation:** If the observation exceeds `max_observation_length` (default 100,000 chars), it's truncated AND the model is told explicitly:
```
Observation: {{observation[:max_observation_length]}}<response clipped>
<NOTE>Observations should not exceeded {{max_observation_length}} characters.
{{elided_chars}} characters were elided. Please try a different command that
produces less output or use head/tail/grep/redirect the output to a file.
Do not use interactive pagers.</NOTE>
```

This is better than silent truncation — the model knows it needs to change strategy.

---

## 5. Tool Design Principles

### OpenHands: Tools as Rich Typed Schemas

Tools are `ChatCompletionToolParam` objects with JSON schema parameters. Key design decisions:

**The ThinkTool:** A tool that does nothing except log the thought. Explicit, structured, no side effects. This is better than relying on the model's "natural" reasoning tokens because it forces the model to commit its reasoning as a tool call, making it visible in logs and trajectory.

```python
ThinkTool = ChatCompletionToolParam(
    type='function',
    function=ChatCompletionToolParamFunctionChunk(
        name='think',
        description='Use the tool to think about something. It will not obtain new
        information or make any changes to the repository, but just log the thought.
        Use it when complex reasoning or brainstorming is needed.',
        parameters={'type': 'object', 'properties': {'thought': {'type': 'string'}}}
    )
)
```

**Security risk as a required tool parameter:** The bash tool requires `security_risk` as a required parameter with enum values `[LOW, MEDIUM, HIGH]`. This forces the model to explicitly classify the risk of every command before executing. The controller can then gate high-risk commands on user confirmation.

**Short vs. long tool descriptions:** For GPT-4/o-series models, OpenHands uses shortened tool descriptions (under 1024 chars) for historical API compatibility. It detects the model by name and switches automatically.

**Tool descriptions teach the model environment behavior:**
```
Persistent session: Commands execute in a persistent shell session where
environment variables, virtual environments, and working directory persist
between commands.

If a bash command returns exit code -1, this means the process hit the soft
timeout and is not yet finished. By setting is_input to true, you can:
  - Send empty command to retrieve additional logs
  - Send text to STDIN of the running process
  - Send control commands like C-c, C-d, or C-z
```

This is not just documentation — it's teaching the model the exact API contract it needs to handle long-running processes.

### SWE-agent: ACI (Agent-Computer Interface) with State Commands

SWE-agent's key ACI insight: **files should have a viewport, not a dump**. Instead of reading an entire file, the model opens it in a "window" of ~100 lines with line numbers, and can `scroll_up`, `scroll_down`, `goto <line_number>`. This mirrors how a human developer uses an editor.

Every action execution calls **state commands** — bash scripts that run silently after each action and inject their output into the next prompt. Example state injected into every observation:
```
[File: /repo/src/foo.py (200 lines total)]
(50 more lines above)
 50: def foo():
 51:     ...
(100 more lines below)
Current directory: /repo/src
```

The model always knows where it is and what it's looking at, without having to ask.

**Tool blocklist:** Interactive commands (`vim`, `emacs`, `nano`, `ipython`, `python` bare, `bash` bare) are blocked. Any call to these returns an error message without execution. This prevents the agent from entering interactive sessions it can't exit.

**Format parsing is configurable:** SWE-agent supports three parsers:
- `FunctionCallingParser` — native tool call format (default for capable models)
- `ThoughtActionParser` — text with action in triple-backtick block (for weaker models)
- `ActionOnlyParser` — just the command, no thought (for human mode)

The thought/action split is explicit: the model's prose before the code block is the "thought", the code block is the "action". The trajectory stores both separately.

---

## 6. Multi-Agent / Delegation

### OpenHands: Nested Controllers

OpenHands supports true multi-agent delegation via `AgentDelegateAction`. When the parent agent calls this:

1. A new `AgentController` is created with `is_delegate=True`
2. It shares the parent's `EventStream` but has its own `State`
3. The parent's `on_event()` forwards all events to the delegate until it finishes
4. When done, `end_delegate()` creates an `AgentDelegateObservation` summarizing the result
5. Cost/iteration limits are **shared globally** — the delegate's spending counts against the parent

The delegate pattern enables specialization: a BrowsingAgent for web tasks, a coding agent for implementation, etc.

### SWE-agent: RetryAgent with Reviewer

SWE-agent's `RetryAgent` runs the same (or different) agent configurations multiple times, then uses a **reviewer LLM** to pick the best attempt. The reviewer can be:
- `ScoreRetryLoop` — scores each attempt and retries if below threshold
- `ChooserRetryLoop` — runs all N attempts then picks best

This is a fundamentally different approach: instead of one agent trying to recover from errors, run multiple independent agents and select the winner. More expensive but more reliable for well-defined tasks.

---

## 7. Prompt Engineering Patterns

### OpenHands System Prompt Design

The system prompt is structured with explicit XML-tagged sections:
```
<ROLE> ... </ROLE>
<EFFICIENCY> ... </EFFICIENCY>
<FILE_SYSTEM_GUIDELINES> ... </FILE_SYSTEM_GUIDELINES>
<CODE_QUALITY> ... </CODE_QUALITY>
<VERSION_CONTROL> ... </VERSION_CONTROL>
<PROBLEM_SOLVING_WORKFLOW> ... </PROBLEM_SOLVING_WORKFLOW>
```

Key patterns:
- **Efficiency injunction:** "Each action you take is somewhat expensive. Wherever possible, combine multiple actions into a single action."
- **Anti-versioning:** "NEVER create multiple versions of the same file with different suffixes (e.g., file_test.py, file_fix.py, file_simple.py)." — prevents a common failure mode where agents create parallel files instead of editing in place.
- **Workflow as numbered steps:** EXPLORATION → ANALYSIS → TESTING → IMPLEMENTATION → VERIFICATION. Forces sequential thinking.
- **Security risk assessment:** Included as a Jinja2 include (`{% include 'security_risk_assessment.j2' %}`). Modular prompt components.

### SWE-agent Instance Template

The instance template (what the model sees at the start of each task) is instructional:
```
Follow these steps to resolve the issue:
1. Find and read code relevant to the PR description
2. Create a script to reproduce the error and execute it
3. Edit the sourcecode to resolve the issue
4. Rerun your reproduce script and confirm the error is fixed
5. Think about edgecases and make sure your fix handles them
Your thinking should be thorough and so it's fine if it's very long.
```

Key: "Your thinking should be thorough and so it's fine if it's very long." — explicit permission to reason at length, counteracting models' tendency to be brief.

### SWE-agent Error Templates

Error messages sent during requery are Jinja2 templates with access to the full step context:
```python
shell_check_error_template = (
    "Your bash command contained syntax errors and was NOT executed. "
    "Please fix the syntax errors and try again. This can be the result "
    "of not adhering to the syntax for multi-line commands. Here is the output of `bash -n`:\n"
    "{{bash_stdout}}\n{{bash_stderr}}"
)
```

Blocklist errors name the blocked command and explain it's unsupported:
```
"Operation '{{action}}' is not supported by this environment."
```

Short, not punitive, constructive.

### In-Context Learning / Demonstrations

Both systems support loading demonstration trajectories as in-context examples. OpenHands supports microagents — small specialized agents loaded by keyword match from the user's message. SWE-agent supports `put_demos_in_history: true` which adds a full solved example as the first few turns of the conversation.

---

## 8. What Our System Is Missing vs These

### Critical Gaps

**1. No stuck detection.**
Our pipeline can loop indefinitely if a stage returns bad output and the next call repeats the same prompt. OpenHands detects 5 loop patterns and aborts. SWE-agent has `max_requeries` (default 3) after format errors. We have no equivalent — a model that produces junk output will just run to the max iteration limit.

**2. No separation between LLM history and audit trail.**
We stream stage outputs to a flat string and store the whole thing. SWE-agent distinguishes: trajectory (immutable forensic record) vs history (mutable, processed before each call). Our ResearchOutput is the display layer; we don't have a clean trajectory record separate from what the LLM sees.

**3. Format errors are not requried — they're fatal.**
If our orchestrator produces malformed JSON, we try to parse it and fail. We don't requery with an error message and give the model a chance to self-correct. The JSON streaming tokens shown in the UI suggest we're capturing the raw output, but we're not feeding errors back.

**4. No observation length management with explanation.**
If a Wayfarer scrape returns 100K chars, we compress it — but the compression is opaque to the model. SWE-agent explicitly tells the model when output was truncated and instructs it to use a different command. We don't give the model this signal.

**5. No pre-execution bash syntax validation.**
SWE-agent runs `bash -n` before executing any command. We have no equivalent check on generated tool calls or prompts before sending them.

**6. Context condensation is manual/absent.**
We have research depth presets with iteration limits, but no active context management within a run. As the research phase accumulates findings, the prompt grows unbounded. OpenHands has 8 condenser strategies. SWE-agent has HistoryProcessors including `LastNObservations` which trims the context on a configurable schedule. We're exposed to context-window errors with no fallback.

**7. No explicit ThinkTool / reasoning step.**
Both systems expose a `think` tool or `thought` field that logs reasoning separately from actions. Our stages produce combined reasoning + output. Separating them would make the reasoning visible in the UI and trajectory without cluttering the action.

**8. No action confirmation / security gating.**
OpenHands requires the model to classify every bash command as LOW/MEDIUM/HIGH risk (via a required parameter). HIGH risk commands trigger user confirmation. We execute everything automatically.

**9. No retry loop / multi-attempt selection.**
SWE-agent's RetryAgent runs N attempts and picks the best. Our cycle runs once and proceeds linearly. For the Make stage (creative ad generation) where quality matters, running 3 variations and picking the best would be a huge win.

**10. No MCP / external tool integration in the loop.**
OpenHands has `MCPAction` and `set_mcp_tools()` on the agent base class. Tools are injected at runtime from MCP servers. We have the Figma MCP as the next milestone but no architecture for tool injection.

### Lower Priority Gaps

- **No delegation pattern for subagents.** Our subagentManager is custom; OpenHands has a tested delegation protocol with shared event streams and cost propagation.
- **In-context demonstrations.** Both systems load solved examples as few-shot prompts. We don't.
- **State commands / environment state injection.** After each tool call, we don't automatically inject "current directory is X, current file is Y" into the next prompt. The model has to track this itself.
- **Prompt caching.** We don't add Anthropic cache control marks. Since our system prompt and Phase 1 outputs are static within a run, caching would materially reduce latency and cost on long research runs.

---

## 9. Patterns Worth Stealing (Prioritized)

### P0 — Implement immediately

**Format error requery loop**
Before accepting any JSON output from a stage, validate it. On failure, append the error to the conversation and requery up to N times (3 is standard). Keep failures out of the main history. 5-line change in each stage.

**Observation truncation with explanation**
When Wayfarer returns > X chars, truncate AND add: "Output truncated at X chars. Use a more targeted query or summarize before proceeding." Currently we silently truncate in compression.

**Stuck detection for the research loop**
Track the last 3 orchestrator decisions. If they're identical (same query choices), inject a "STUCK: You have searched for this 3 times, try a different angle" message. This is a stripped-down version of OpenHands' scenario 1.

### P1 — Implement in next phase

**Separate trajectory from history**
Every stage should append to a `Trajectory[]` record with `{thought, action, observation, execution_time, model, tokens}`. The display layer reads trajectory. The LLM receives processed history (with old observations summarized or elided).

**HistoryProcessor chain for research phase**
When Phase 2 research exceeds N iterations, start eliding early researcher outputs. Replace them with `"[Research round 3 output: 847 lines summarized]"`. Keep orchestrator decisions and reflection outputs always.

**ThinkTool equivalent**
Add an explicit `<think>` tag convention: any content in `<think>...</think>` in the model output is extracted into a separate field, logged to trajectory, never shown to end users in final output, but visible in dev mode.

### P2 — Architecture level

**RetryAgent for Make stage**
Generate 3 ad concepts with independently seeded prompts (vary temperature/seed or inject different brand angle instructions). Run all 3 through the Test stage. Pick the winner. The Test stage becomes a chooser, not just an evaluator.

**MCP tool injection architecture**
Formalize the tool interface so the Make stage can receive a list of available tools at runtime (Figma MCP, image generation, etc.) rather than having tool calls hardcoded into prompts.

**Prompt caching**
Add `cache_control: {type: ephemeral}` to the last 2 messages in every Ollama call. For Anthropic-compatible endpoints this is free latency reduction.

---

## 10. Quick Reference: Key Code Locations

| Pattern | OpenHands | SWE-agent |
|---------|-----------|-----------|
| Main loop | `agent_controller.py:_step()` | `agents.py:DefaultAgent.run()` |
| Stuck detection | `stuck.py:StuckDetector.is_stuck()` | Not explicit — `max_requeries` prevents format loops |
| Error recovery / requery | `agent_controller.py:_step()` error handlers | `agents.py:forward_with_handling()` |
| Context compression | `memory/condenser/` | `agent/history_processors.py` |
| LLM summarization prompt | `condenser/impl/llm_summarizing_condenser.py` | — |
| Tool definitions | `agenthub/codeact_agent/tools/` | `tools/windowed/config.yaml`, `tools/*.yaml` |
| Action parsing | `agenthub/codeact_agent/function_calling.py` | `tools/parsing.py:FunctionCallingParser` |
| System prompt | `agenthub/codeact_agent/prompts/system_prompt.j2` | `config/default.yaml:system_template` |
| Trajectory format | `events/` EventStream + State | `types.py:TrajectoryStep` |
| Multi-agent | `controller/agent_controller.py:start_delegate()` | `agents.py:RetryAgent` |
| State injection | EventStream observations | `tools/windowed/bin/_state` + `get_state()` |
