import { useState } from 'react';
import type { ResearchFindings } from '../types';

interface ResearchReviewModalProps {
  isOpen: boolean;
  findings: ResearchFindings;
  isDarkMode: boolean;
  onApprove: (updatedFindings: ResearchFindings) => Promise<void>;
}

interface EditableFindings {
  deepDesires: string[];
  avatarLanguage: string[];
  whereAudienceCongregates: string[];
  whatTheyTriedBefore: string[];
}

export function ResearchReviewModal({
  isOpen,
  findings,
  isDarkMode,
  onApprove,
}: ResearchReviewModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [editedFindings, setEditedFindings] = useState<EditableFindings>({
    deepDesires: findings.deepDesires?.map(d => d.deepestDesire) || [],
    avatarLanguage: findings.avatarLanguage || [],
    whereAudienceCongregates: findings.whereAudienceCongregates || [],
    whatTheyTriedBefore: findings.whatTheyTriedBefore || [],
  });

  if (!isOpen) return null;

  const bgClass = isDarkMode ? 'bg-[#0a0a0a]' : 'bg-white';
  const borderClass = isDarkMode ? 'border-zinc-800' : 'border-zinc-200';
  const textClass = isDarkMode ? 'text-white' : 'text-black';
  const secondaryTextClass = isDarkMode ? 'text-zinc-400' : 'text-zinc-600';
  const sectionBgClass = isDarkMode ? 'bg-zinc-900/50' : 'bg-zinc-50';
  const buttonClass = isDarkMode
    ? 'bg-white text-black hover:bg-zinc-200'
    : 'bg-black text-white hover:bg-zinc-800';

  const handleApprove = async () => {
    setIsLoading(true);
    try {
      // Merge edited findings back into original, updating simple string fields
      // For complex nested fields like deepDesires, we'll keep the original structure
      const updated: ResearchFindings = {
        ...findings,
        avatarLanguage: editedFindings.avatarLanguage,
        whereAudienceCongregates: editedFindings.whereAudienceCongregates,
        whatTheyTriedBefore: editedFindings.whatTheyTriedBefore,
      };
      await onApprove(updated);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveEdits = () => {
    // Switch back to read-only mode
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    // Reset to original
    setEditedFindings({
      deepDesires: findings.deepDesires?.map(d => d.deepestDesire) || [],
      avatarLanguage: findings.avatarLanguage || [],
      whereAudienceCongregates: findings.whereAudienceCongregates || [],
      whatTheyTriedBefore: findings.whatTheyTriedBefore || [],
    });
    setIsEditing(false);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={() => !isLoading && setIsEditing(false)}
      />

      {/* Modal */}
      <div className={`fixed inset-0 z-50 flex items-center justify-center p-4`}>
        <div
          className={`${bgClass} border ${borderClass} rounded-lg shadow-xl max-h-[80vh] w-full max-w-2xl overflow-y-auto`}
        >
          {/* Header */}
          <div className={`border-b ${borderClass} p-6 sticky top-0 ${bgClass}`}>
            <h2 className={`font-mono font-bold text-lg ${textClass}`}>
              Research Review
            </h2>
            <p className={`font-mono text-xs mt-2 ${secondaryTextClass}`}>
              Does this research look good? Edit anything that needs changing before we proceed.
            </p>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Deep Desires Section */}
            <div className={`${sectionBgClass} p-4 rounded border ${borderClass}`}>
              <h3 className={`font-mono font-bold text-sm ${textClass} mb-3 uppercase tracking-tight`}>
                Deep Customer Desires
              </h3>
              {isEditing ? (
                <textarea
                  value={editedFindings.deepDesires.join('\n')}
                  onChange={(e) =>
                    setEditedFindings({
                      ...editedFindings,
                      deepDesires: e.target.value
                        .split('\n')
                        .map(s => s.trim())
                        .filter(Boolean),
                    })
                  }
                  className={`w-full h-24 p-2 font-mono text-xs border ${borderClass} rounded ${
                    isDarkMode ? 'bg-zinc-800 text-white' : 'bg-white text-black'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholder="One desire per line..."
                />
              ) : (
                <ul className={`space-y-1 font-mono text-xs ${textClass} leading-relaxed`}>
                  {findings.deepDesires?.map((d, i) => (
                    <li key={i} className={`${secondaryTextClass}`}>
                      • {d.deepestDesire}
                    </li>
                  )) || <li className={secondaryTextClass}>No desires found</li>}
                </ul>
              )}
            </div>

            {/* Purchase Objections Section (Read-only) */}
            <div className={`${sectionBgClass} p-4 rounded border ${borderClass}`}>
              <h3 className={`font-mono font-bold text-sm ${textClass} mb-3 uppercase tracking-tight`}>
                Purchase Objections
              </h3>
              {findings.objections && findings.objections.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className={`w-full font-mono text-[10px] ${textClass}`}>
                    <thead>
                      <tr className={`border-b ${borderClass}`}>
                        <th className={`text-left py-2 px-2 ${secondaryTextClass}`}>Objection</th>
                        <th className={`text-left py-2 px-2 ${secondaryTextClass}`}>Frequency</th>
                        <th className={`text-left py-2 px-2 ${secondaryTextClass}`}>Impact</th>
                        <th className={`text-left py-2 px-2 ${secondaryTextClass}`}>Approach</th>
                      </tr>
                    </thead>
                    <tbody>
                      {findings.objections.map((obj, i) => (
                        <tr key={i} className={`border-b ${borderClass}`}>
                          <td className="py-2 px-2 text-xs">{obj.objection}</td>
                          <td className={`py-2 px-2 text-xs ${secondaryTextClass}`}>{obj.frequency}</td>
                          <td className={`py-2 px-2 text-xs ${secondaryTextClass}`}>{obj.impact}</td>
                          <td className="py-2 px-2 text-xs max-w-xs truncate">{obj.handlingApproach}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className={`font-mono text-xs ${secondaryTextClass}`}>No objections identified</p>
              )}
            </div>

            {/* Avatar Language Section */}
            <div className={`${sectionBgClass} p-4 rounded border ${borderClass}`}>
              <h3 className={`font-mono font-bold text-sm ${textClass} mb-3 uppercase tracking-tight`}>
                How They Actually Talk (Avatar Language)
              </h3>
              {isEditing ? (
                <textarea
                  value={editedFindings.avatarLanguage.join('\n')}
                  onChange={(e) =>
                    setEditedFindings({
                      ...editedFindings,
                      avatarLanguage: e.target.value
                        .split('\n')
                        .map(s => s.trim())
                        .filter(Boolean),
                    })
                  }
                  className={`w-full h-24 p-2 font-mono text-xs border ${borderClass} rounded ${
                    isDarkMode ? 'bg-zinc-800 text-white' : 'bg-white text-black'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholder="One phrase per line..."
                />
              ) : (
                <ul className={`space-y-1 font-mono text-xs ${textClass} leading-relaxed`}>
                  {findings.avatarLanguage?.map((phrase, i) => (
                    <li key={i} className={`${secondaryTextClass}`}>
                      "{phrase}"
                    </li>
                  )) || <li className={secondaryTextClass}>No language phrases found</li>}
                </ul>
              )}
            </div>

            {/* Platforms Section */}
            <div className={`${sectionBgClass} p-4 rounded border ${borderClass}`}>
              <h3 className={`font-mono font-bold text-sm ${textClass} mb-3 uppercase tracking-tight`}>
                Where They Congregate
              </h3>
              {isEditing ? (
                <textarea
                  value={editedFindings.whereAudienceCongregates.join('\n')}
                  onChange={(e) =>
                    setEditedFindings({
                      ...editedFindings,
                      whereAudienceCongregates: e.target.value
                        .split('\n')
                        .map(s => s.trim())
                        .filter(Boolean),
                    })
                  }
                  className={`w-full h-20 p-2 font-mono text-xs border ${borderClass} rounded ${
                    isDarkMode ? 'bg-zinc-800 text-white' : 'bg-white text-black'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholder="One platform per line..."
                />
              ) : (
                <ul className={`space-y-1 font-mono text-xs ${textClass} leading-relaxed`}>
                  {findings.whereAudienceCongregates?.map((platform, i) => (
                    <li key={i} className={`${secondaryTextClass}`}>
                      • {platform}
                    </li>
                  )) || <li className={secondaryTextClass}>No platforms identified</li>}
                </ul>
              )}
            </div>

            {/* What They Tried Before Section */}
            <div className={`${sectionBgClass} p-4 rounded border ${borderClass}`}>
              <h3 className={`font-mono font-bold text-sm ${textClass} mb-3 uppercase tracking-tight`}>
                What They Tried Before (& Why It Failed)
              </h3>
              {isEditing ? (
                <textarea
                  value={editedFindings.whatTheyTriedBefore.join('\n')}
                  onChange={(e) =>
                    setEditedFindings({
                      ...editedFindings,
                      whatTheyTriedBefore: e.target.value
                        .split('\n')
                        .map(s => s.trim())
                        .filter(Boolean),
                    })
                  }
                  className={`w-full h-24 p-2 font-mono text-xs border ${borderClass} rounded ${
                    isDarkMode ? 'bg-zinc-800 text-white' : 'bg-white text-black'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholder="One failed solution per line..."
                />
              ) : (
                <ul className={`space-y-1 font-mono text-xs ${textClass} leading-relaxed`}>
                  {findings.whatTheyTriedBefore?.map((item, i) => (
                    <li key={i} className={`${secondaryTextClass}`}>
                      • {item}
                    </li>
                  )) || <li className={secondaryTextClass}>No previous attempts identified</li>}
                </ul>
              )}
            </div>

            {/* Competitor Weaknesses Section (Read-only) */}
            <div className={`${sectionBgClass} p-4 rounded border ${borderClass}`}>
              <h3 className={`font-mono font-bold text-sm ${textClass} mb-3 uppercase tracking-tight`}>
                Competitor Weaknesses & Positioning Gaps
              </h3>
              <ul className={`space-y-1 font-mono text-xs ${textClass} leading-relaxed`}>
                {findings.competitorWeaknesses?.map((weakness, i) => (
                  <li key={i} className={`${secondaryTextClass}`}>
                    • {weakness}
                  </li>
                )) || <li className={secondaryTextClass}>No competitor weaknesses identified</li>}
              </ul>
            </div>

            {/* Avatar Persona Summary (Read-only) */}
            {findings.persona && (
              <div className={`${sectionBgClass} p-4 rounded border ${borderClass}`}>
                <h3 className={`font-mono font-bold text-sm ${textClass} mb-3 uppercase tracking-tight`}>
                  Avatar Persona
                </h3>
                <div className={`font-mono text-xs ${textClass} space-y-1 leading-relaxed`}>
                  <p>
                    <span className={secondaryTextClass}>Name:</span> {findings.persona.name}
                  </p>
                  <p>
                    <span className={secondaryTextClass}>Age:</span> {findings.persona.age}
                  </p>
                  <p>
                    <span className={secondaryTextClass}>Deep Desire:</span> {findings.persona.deepDesire}
                  </p>
                  <p>
                    <span className={secondaryTextClass}>Biggest Fear:</span> {findings.persona.biggestFear}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className={`border-t ${borderClass} p-6 bg-${isDarkMode ? '[#090909]' : 'white'} sticky bottom-0 flex items-center justify-between gap-4`}>
            {isEditing ? (
              <>
                <button
                  onClick={handleCancelEdit}
                  disabled={isLoading}
                  className={`px-4 py-2 font-mono text-xs uppercase tracking-wider border ${borderClass} rounded transition-all ${
                    isDarkMode ? 'hover:bg-zinc-900' : 'hover:bg-zinc-50'
                  } disabled:opacity-50`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdits}
                  disabled={isLoading}
                  className={`px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider ${buttonClass} rounded transition-all disabled:opacity-50`}
                >
                  Save Edits
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  disabled={isLoading}
                  className={`px-4 py-2 font-mono text-xs uppercase tracking-wider border ${borderClass} rounded transition-all ${
                    isDarkMode ? 'hover:bg-zinc-900' : 'hover:bg-zinc-50'
                  } disabled:opacity-50`}
                >
                  Edit
                </button>
                <button
                  onClick={handleApprove}
                  disabled={isLoading}
                  className={`px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider ${buttonClass} rounded transition-all disabled:opacity-50 flex items-center gap-2`}
                >
                  {isLoading ? (
                    <>
                      <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Processing...
                    </>
                  ) : (
                    'Approve & Proceed'
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
