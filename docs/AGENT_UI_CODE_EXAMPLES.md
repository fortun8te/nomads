# Agent UI — Code Examples & Integration Patterns

## Table of Contents
1. [Basic Usage](#basic-usage)
2. [State Management](#state-management)
3. [Dynamic Updates](#dynamic-updates)
4. [Agent Integration](#agent-integration)
5. [Advanced Patterns](#advanced-patterns)

## Basic Usage

### Minimal Example

```tsx
import { AgentUIWrapper, type StepConfig } from './components/AgentUIWrapper';

const steps: StepConfig[] = [
  {
    id: 'step-1',
    title: 'Analyze Campaign',
    status: 'completed',
  },
  {
    id: 'step-2',
    title: 'Research Market',
    status: 'active',
    isThinking: true,
    liveThinkingText: 'Searching...',
  },
];

export function SimpleAgent() {
  return (
    <AgentUIWrapper
      taskDescription="Create ads for fitness brand"
      steps={steps}
      isThinking={true}
      liveThinkingOutput="Analyzing market trends..."
    />
  );
}
```

### With Description and Sub-Items

```tsx
const steps: StepConfig[] = [
  {
    id: 'research',
    title: 'Market Research',
    description: 'Gathering insights on trends',
    status: 'completed',
    subItems: [
      {
        id: 'sub-1',
        type: 'completed',
        label: 'Analyzed 150+ competitor ads',
      },
      {
        id: 'sub-2',
        type: 'completed',
        label: 'Identified 5 key market trends',
      },
      {
        id: 'sub-3',
        type: 'completed',
        label: 'Mapped customer pain points',
      },
    ],
  },
];
```

## State Management

### Using React Hooks

```tsx
import { useState } from 'react';
import { AgentUIWrapper, type StepConfig } from './components/AgentUIWrapper';

export function ManagedAgent() {
  const [steps, setSteps] = useState<StepConfig[]>([
    {
      id: 'step-1',
      title: 'Initialize',
      status: 'completed',
    },
    {
      id: 'step-2',
      title: 'Processing',
      status: 'active',
      isThinking: true,
    },
  ]);

  const [isThinking, setIsThinking] = useState(true);
  const [thinkingOutput, setThinkingOutput] = useState('');

  const handleStepToggle = (stepId: string, expanded: boolean) => {
    console.log(`Step ${stepId} is now ${expanded ? 'expanded' : 'collapsed'}`);
  };

  return (
    <AgentUIWrapper
      taskDescription="Creating marketing campaign"
      steps={steps}
      isThinking={isThinking}
      liveThinkingOutput={thinkingOutput}
      onStepToggle={handleStepToggle}
    />
  );
}
```

### Using Context API

```tsx
import { createContext, useContext, useState } from 'react';
import { AgentUIWrapper, type StepConfig } from './components/AgentUIWrapper';

interface AgentContextType {
  steps: StepConfig[];
  addStep: (step: StepConfig) => void;
  updateStep: (id: string, updates: Partial<StepConfig>) => void;
  isThinking: boolean;
  setIsThinking: (thinking: boolean) => void;
  thinkingOutput: string;
  setThinkingOutput: (output: string) => void;
}

const AgentContext = createContext<AgentContextType | null>(null);

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const [steps, setSteps] = useState<StepConfig[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingOutput, setThinkingOutput] = useState('');

  const addStep = (step: StepConfig) => {
    setSteps((prev) => [...prev, step]);
  };

  const updateStep = (id: string, updates: Partial<StepConfig>) => {
    setSteps((prev) =>
      prev.map((step) => (step.id === id ? { ...step, ...updates } : step))
    );
  };

  return (
    <AgentContext.Provider
      value={{
        steps,
        addStep,
        updateStep,
        isThinking,
        setIsThinking,
        thinkingOutput,
        setThinkingOutput,
      }}
    >
      {children}
    </AgentContext.Provider>
  );
}

export function useAgent() {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error('useAgent must be used within AgentProvider');
  }
  return context;
}

// Usage:
export function AgentComponent() {
  const {
    steps,
    isThinking,
    thinkingOutput,
  } = useAgent();

  return (
    <AgentUIWrapper
      taskDescription="Campaign creation"
      steps={steps}
      isThinking={isThinking}
      liveThinkingOutput={thinkingOutput}
    />
  );
}
```

## Dynamic Updates

### Adding Steps Progressively

```tsx
export function ProgressiveAgent() {
  const [steps, setSteps] = useState<StepConfig[]>([]);

  const startAgent = async () => {
    // Step 1: Start analysis
    setSteps([
      {
        id: 'analyze',
        title: 'Analyzing Brief',
        status: 'active',
        isThinking: true,
      },
    ]);

    // Simulate analysis
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Step 1: Complete, Step 2: Start
    setSteps([
      {
        id: 'analyze',
        title: 'Analyzing Brief',
        status: 'completed',
        subItems: [
          { id: '1', type: 'completed', label: 'Parsed features' },
          { id: '2', type: 'completed', label: 'Set goals' },
        ],
      },
      {
        id: 'research',
        title: 'Research Market',
        status: 'active',
        isThinking: true,
      },
    ]);

    // Simulate research
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Complete
    setSteps([
      {
        id: 'analyze',
        title: 'Analyzing Brief',
        status: 'completed',
      },
      {
        id: 'research',
        title: 'Research Market',
        status: 'completed',
        subItems: [
          { id: '3', type: 'query', label: 'Found 50 sources' },
          { id: '4', type: 'completed', label: 'Analyzed trends' },
        ],
      },
      {
        id: 'generate',
        title: 'Generate Concepts',
        status: 'completed',
        subItems: [
          { id: '5', type: 'completed', label: '3 ad concepts' },
          { id: '6', type: 'completed', label: 'All variations' },
        ],
      },
    ]);
  };

  return (
    <div className="h-screen flex flex-col">
      <button
        onClick={startAgent}
        className="px-4 py-2 bg-blue-600 text-white rounded"
      >
        Start Agent
      </button>
      <div className="flex-1">
        <AgentUIWrapper
          taskDescription="Create high-performing ads"
          steps={steps}
          isThinking={steps.some((s) => s.isThinking)}
        />
      </div>
    </div>
  );
}
```

### Updating Sub-Items

```tsx
export function UpdateSubItemsExample() {
  const [steps, setSteps] = useState<StepConfig[]>([
    {
      id: 'research',
      title: 'Market Research',
      status: 'active',
      isThinking: true,
      subItems: [
        {
          id: 'query-1',
          type: 'query',
          label: 'Searching fitness trends...',
        },
      ],
    },
  ]);

  // Simulate adding sub-items as queries complete
  const addQueryResult = (queryLabel: string) => {
    setSteps((prev) =>
      prev.map((step) => {
        if (step.id === 'research') {
          return {
            ...step,
            subItems: [
              ...(step.subItems || []),
              {
                id: `result-${Date.now()}`,
                type: 'completed' as const,
                label: queryLabel,
              },
            ],
          };
        }
        return step;
      })
    );
  };

  return (
    <div>
      <AgentUIWrapper
        taskDescription="Research market"
        steps={steps}
        isThinking={true}
      />
      <button
        onClick={() => addQueryResult('Found supplement market report')}
        className="mt-4"
      >
        Simulate Query Result
      </button>
    </div>
  );
}
```

## Agent Integration

### Integration with Custom Agent

```tsx
import { useEffect, useState } from 'react';
import { AgentUIWrapper, type StepConfig } from './components/AgentUIWrapper';
import { MyCustomAgent } from './agents/MyCustomAgent';

export function IntegratedAgent() {
  const [steps, setSteps] = useState<StepConfig[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingOutput, setThinkingOutput] = useState('');
  const agentRef = useRef<MyCustomAgent>();

  useEffect(() => {
    const agent = new MyCustomAgent();
    agentRef.current = agent;

    // Listen to agent events
    agent.on('step-started', (stepName: string) => {
      setSteps((prev) => [
        ...prev,
        {
          id: `step-${Date.now()}`,
          title: stepName,
          status: 'active',
          isThinking: true,
        },
      ]);
      setIsThinking(true);
    });

    agent.on('thinking', (text: string) => {
      setThinkingOutput((prev) => prev + '\n' + text);
    });

    agent.on('step-completed', (stepName: string) => {
      setSteps((prev) =>
        prev.map((step) =>
          step.title === stepName
            ? { ...step, status: 'completed', isThinking: false }
            : step
        )
      );
    });

    agent.on('done', () => {
      setIsThinking(false);
    });

    return () => {
      agent.cleanup();
    };
  }, []);

  return (
    <AgentUIWrapper
      taskDescription="Creating marketing campaign"
      steps={steps}
      isThinking={isThinking}
      liveThinkingOutput={thinkingOutput}
    />
  );
}
```

### Integration with HTTP Agent

```tsx
import { useEffect, useState } from 'react';
import { AgentUIWrapper, type StepConfig } from './components/AgentUIWrapper';

interface AgentAPIStep {
  id: string;
  name: string;
  description?: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  thinking?: string;
  subTasks?: Array<{
    id: string;
    name: string;
    status: 'pending' | 'completed' | 'query';
  }>;
}

export function HTTPIntegratedAgent() {
  const [steps, setSteps] = useState<StepConfig[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingOutput, setThinkingOutput] = useState('');
  const [eventSource, setEventSource] = useState<EventSource | null>(null);

  const startAgent = (taskDescription: string) => {
    // Connect to server-sent events
    const es = new EventSource(`/api/agent/stream?task=${taskDescription}`);

    es.addEventListener('step', (event) => {
      const data: AgentAPIStep = JSON.parse(event.data);
      setSteps((prev) => {
        const existing = prev.findIndex((s) => s.id === data.id);
        const newStep: StepConfig = {
          id: data.id,
          title: data.name,
          description: data.description,
          status:
            data.status === 'running'
              ? 'active'
              : data.status === 'completed'
                ? 'completed'
                : 'pending',
          isThinking: data.status === 'running',
          liveThinkingText: data.thinking,
          subItems: data.subTasks?.map((t) => ({
            id: t.id,
            label: t.name,
            type:
              t.status === 'query'
                ? 'query'
                : t.status === 'completed'
                  ? 'completed'
                  : 'pending',
          })),
        };

        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = newStep;
          return updated;
        }
        return [...prev, newStep];
      });
    });

    es.addEventListener('thinking', (event) => {
      const { text } = JSON.parse(event.data);
      setThinkingOutput(text);
      setIsThinking(true);
    });

    es.addEventListener('done', () => {
      setIsThinking(false);
      es.close();
    });

    es.addEventListener('error', () => {
      setIsThinking(false);
      es.close();
    });

    setEventSource(es);
  };

  useEffect(() => {
    return () => {
      eventSource?.close();
    };
  }, [eventSource]);

  return (
    <div className="h-screen flex flex-col">
      <button
        onClick={() => startAgent('Create ads for vitamin supplement')}
        className="px-4 py-2 bg-blue-600 text-white"
      >
        Start Agent
      </button>
      <div className="flex-1">
        <AgentUIWrapper
          taskDescription="Creating marketing campaign"
          steps={steps}
          isThinking={isThinking}
          liveThinkingOutput={thinkingOutput}
        />
      </div>
    </div>
  );
}
```

## Advanced Patterns

### Custom Status Mapping

```tsx
// Map custom agent statuses to UI statuses
function mapAgentStatus(
  agentStatus: 'pending' | 'running' | 'done' | 'error'
): 'pending' | 'active' | 'completed' {
  switch (agentStatus) {
    case 'pending':
      return 'pending';
    case 'running':
      return 'active';
    case 'done':
      return 'completed';
    case 'error':
      return 'completed'; // or show error state
  }
}
```

### Filtering and Grouping Steps

```tsx
// Show only failed steps
const failedSteps = steps.filter((s) => s.status === 'error');

// Group steps by category
const groupedSteps = steps.reduce((acc, step) => {
  const category = step.title.split('/')[0];
  if (!acc[category]) acc[category] = [];
  acc[category].push(step);
  return acc;
}, {} as Record<string, StepConfig[]>);
```

### Custom Styling

```tsx
// Create a themed wrapper
export function ThemedAgentUI({
  steps,
  taskDescription,
}: {
  steps: StepConfig[];
  taskDescription: string;
}) {
  return (
    <div
      className="rounded-lg border"
      style={{
        background: '#1a1a1f',
        borderColor: 'rgba(255,255,255,0.1)',
      }}
    >
      <AgentUIWrapper
        taskDescription={taskDescription}
        steps={steps}
        isThinking={steps.some((s) => s.isThinking)}
      />
    </div>
  );
}
```

### Step History Tracking

```tsx
export function AgentWithHistory() {
  const [steps, setSteps] = useState<StepConfig[]>([]);
  const [history, setHistory] = useState<Array<StepConfig[]>>([]);

  const updateSteps = (newSteps: StepConfig[]) => {
    setHistory((prev) => [...prev, steps]);
    setSteps(newSteps);
  };

  const undo = () => {
    if (history.length > 0) {
      const previousSteps = history[history.length - 1];
      setHistory((prev) => prev.slice(0, -1));
      setSteps(previousSteps);
    }
  };

  return (
    <div className="h-screen flex flex-col">
      <button
        onClick={undo}
        disabled={history.length === 0}
        className="px-4 py-2 bg-gray-600 text-white disabled:opacity-50"
      >
        Undo
      </button>
      <div className="flex-1">
        <AgentUIWrapper
          taskDescription="Creating campaign"
          steps={steps}
          isThinking={false}
        />
      </div>
    </div>
  );
}
```

### Exporting Step Data

```tsx
// Export steps as JSON
function exportStepsAsJSON(steps: StepConfig[]) {
  const json = JSON.stringify(steps, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `agent-steps-${Date.now()}.json`;
  a.click();
}

// Export as markdown
function exportStepsAsMarkdown(steps: StepConfig[]) {
  const md = steps
    .map((step) => {
      let text = `## ${step.title}\n`;
      if (step.description) text += `${step.description}\n`;
      text += `Status: ${step.status}\n\n`;
      if (step.subItems) {
        step.subItems.forEach((item) => {
          const icon = item.type === 'completed' ? '✓' : item.type === 'query' ? '🔍' : '○';
          text += `- ${icon} ${item.label}\n`;
        });
      }
      return text;
    })
    .join('\n');

  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `agent-steps-${Date.now()}.md`;
  a.click();
}
```

## Performance Tips

### Memoization

```tsx
import { useMemo } from 'react';

export function OptimizedAgent() {
  const steps = useMemo(() => generateSteps(), []);

  return (
    <AgentUIWrapper
      taskDescription="Create campaign"
      steps={steps}
      isThinking={false}
    />
  );
}
```

### Virtualization for Large Lists

```tsx
import { FixedSizeList } from 'react-window';

export function VirtualizedAgent({ steps }: { steps: StepConfig[] }) {
  return (
    <FixedSizeList
      height={600}
      itemCount={steps.length}
      itemSize={60}
      width="100%"
    >
      {({ index, style }) => (
        <div style={style}>
          <AgentStep step={steps[index]} />
        </div>
      )}
    </FixedSizeList>
  );
}
```

---

**Examples Version**: 1.0
**Last Updated**: 2026-03-19
