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

  const bgClass = isDarkMode ? 'bg-[#09090b]' : 'bg-white';
  const borderClass = isDarkMode ? 'border-white/[0.08]' : 'border-zinc-200';
  const textClass = isDarkMode ? 'text-white/[0.85]' : 'text-black';
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
                      <svg className="w-3 h-3 animate-spin" viewBox="0 0 161 183" fill="currentColor"><path d="M79.2397 0C84.9682 0.332137 89.0902 1.67435 92.4719 6.6636C94.0963 9.06225 94.948 11.8998 94.9157 14.7963C94.8941 24.92 86.6824 26.7385 80.6772 33.0265C77.1266 36.7483 74.478 41.5373 73.6011 46.6189C72.1169 55.2103 73.1016 62.4551 78.0214 69.7025C85.1155 80.0038 97.9344 84.7036 110.002 81.4254C115.716 79.9006 120.449 75.3132 127.453 77.0796C139.633 80.1508 137.947 90.1516 139.798 98.3256C140.581 101.754 141.987 105.01 143.945 107.932C149.454 116.088 163.366 119.995 160.663 132.364C159.014 139.913 150.691 146.125 142.82 143.896C131.112 140.58 132.481 132.204 130.587 122.885C129.933 119.759 128.758 116.765 127.112 114.028C123.105 107.479 116.683 102.768 109.237 100.908C101.589 99.0513 93.5213 100.341 86.8333 104.488C80.1849 108.628 75.4842 115.27 73.7916 122.917C71.3694 133.439 74.345 144.771 82.8766 151.615C89.8736 157.229 96.7772 160.904 94.4269 171.487C93.4674 175.791 90.348 178.915 86.5997 181.158C85.6222 181.568 84.616 181.906 83.5881 182.168C78.1328 183.602 72.886 181.898 69.418 177.517C65.1307 172.103 66.0183 165.923 64.363 159.694C60.0825 143.575 42.8706 134.533 27.1321 139.851C24.0131 140.903 21.1665 142.631 18.0044 143.557C10.3867 145.874 2.46824 141.219 0.492036 133.541C-2.37111 122.418 7.71907 111.968 18.8838 115.652C22.2403 116.669 25.6213 119.067 29.0048 119.881C50.9529 125.169 70.2302 105.854 64.6167 83.8392C62.628 76.1385 57.6582 69.5454 50.8034 65.5137C43.8927 61.5241 34.6089 60.5557 27.0437 63.2531C24.0318 64.3272 20.6602 66.3667 17.5749 67.1741C13.96 68.0968 10.1258 67.5206 6.94102 65.5763C-4.74334 58.4688 -0.731295 38.8788 13.2843 38.4963C19.5896 38.2555 24.4329 42.1264 30.4988 43.4834C44.8055 47.069 61.7701 36.6376 64.6707 22.1213C67.0353 10.2715 64.7641 3.36631 79.2397 0Z"/><path d="M143.514 38.5711C151.456 37.0782 159.111 42.2993 160.62 50.2415C162.13 58.1837 156.926 65.8494 148.987 67.3768C141.027 68.9088 133.333 63.6848 131.82 55.7182C130.307 47.7516 135.543 40.0682 143.514 38.5711Z"/></svg>
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
