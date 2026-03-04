import { useState } from 'react';

interface ResearchSection {
  type: 'campaign' | 'step' | 'agent' | 'synthesis' | 'text';
  title?: string;
  content: string[];
  collapsed?: boolean;
}

function parseResearchOutput(output: string): ResearchSection[] {
  const sections: ResearchSection[] = [];
  const lines = output.split('\n');
  let currentSection: ResearchSection | null = null;

  for (const line of lines) {
    if (line.includes('[CAMPAIGN_DATA]')) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = {
        type: 'campaign',
        title: 'Campaign Information',
        content: [],
        collapsed: false,
      };
    } else if (line.match(/^STEP \d+:/)) {
      if (currentSection) {
        sections.push(currentSection);
      }
      const stepMatch = line.match(/^(STEP \d+:.*)/);
      currentSection = {
        type: 'step',
        title: stepMatch?.[1],
        content: [],
        collapsed: false,
      };
    } else if (line.includes('[AGENT]')) {
      if (currentSection) {
        sections.push(currentSection);
      }
      const agentMatch = line.match(/\[AGENT\]\s*(.*)/);
      currentSection = {
        type: 'agent',
        title: agentMatch?.[1],
        content: [],
        collapsed: false,
      };
    } else if (line.includes('STRATEGIC')) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = {
        type: 'synthesis',
        title: 'Strategic Analysis',
        content: [],
        collapsed: false,
      };
    } else if (currentSection && line.trim()) {
      currentSection.content.push(line);
    }
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  return sections;
}

interface ResearchOutputProps {
  output: string;
  isDarkMode: boolean;
}

export function ResearchOutput({ output, isDarkMode }: ResearchOutputProps) {
  const [expandedSections, setExpandedSections] = useState<Set<number>>(
    new Set([0]) // Campaign data expanded by default
  );

  const sections = parseResearchOutput(output);

  const toggleSection = (index: number) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedSections(newExpanded);
  };

  const borderClass = isDarkMode ? 'border-zinc-700' : 'border-zinc-200';
  const bgClass = isDarkMode ? 'bg-zinc-900' : 'bg-zinc-50';
  const textClass = isDarkMode ? 'text-zinc-100' : 'text-zinc-900';
  const labelClass = isDarkMode ? 'text-zinc-400' : 'text-zinc-600';
  const hoverClass = isDarkMode ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100';

  return (
    <div className="space-y-3">
      {sections.map((section, idx) => (
        <div key={idx} className={`border ${borderClass} rounded`}>
          <button
            onClick={() => toggleSection(idx)}
            className={`w-full px-4 py-3 flex items-center justify-between ${bgClass} ${hoverClass} transition-colors`}
          >
            <span className={`font-semibold ${textClass}`}>
              {expandedSections.has(idx) ? '▼' : '▶'} {section.title || 'Section'}
            </span>
            <span className={`text-xs ${labelClass}`}>{section.content.length} lines</span>
          </button>

          {expandedSections.has(idx) && (
            <div className={`px-4 py-3 space-y-1 border-t ${borderClass}`}>
              {section.content.map((line, lineIdx) => (
                <div key={lineIdx} className={`text-sm font-mono ${textClass}`}>
                  {line || <span className={labelClass}>.</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
