# Memory System & File Explorer Integration Guide

## Overview

Two new production-quality UI systems have been added to the Nomads codebase:

1. **MemoriesPanel** — Intuitive memory management with CRUD operations
2. **FileExplorer** — Tree-based file/folder navigator with drag/drop and context menus

Both are designed to work independently or together via the **UtilityPanel** side panel wrapper.

---

## Components

### 1. MemoriesPanel (`src/components/MemoriesPanel.tsx`)

Full-featured memory viewer, editor, and creator.

**Features:**
- View all memories grouped by type (general, user, campaign, research)
- Search by keyword or tag
- Filter by type
- Inline edit (type, content, tags)
- Delete with confirmation
- Add new memories via modal form
- Color-coded type badges
- Expandable cards to see full content

**Props:**
```typescript
// MemoriesPanel is a standalone component with no props
<MemoriesPanel />
```

**Dependencies:**
- `memoryStore.ts` (read/write memories via localStorage)
- `useTheme` context (dark mode support)
- `framer-motion` (animations)
- Tailwind CSS

---

### 2. FileExplorer (`src/components/FileExplorer.tsx`)

Tree-based file/folder navigator with full CRUD operations.

**Features:**
- Expandable folder tree with icons
- Right-click context menus (file/folder/root)
- Create file/folder with validation
- Inline rename with Enter/Escape shortcuts
- Delete with item count warning
- Drag/drop to move files/folders
- Visual drop zone highlighting
- File size display
- Responsive layout with dark mode support

**Props:**
```typescript
interface FileExplorerProps {
  rootPath?: string;                    // e.g., '/', '/workspace'
  initialTree?: FileTreeNode;           // Pre-loaded tree structure
  onFileSelect?: (node: FileTreeNode) => void;  // Fired when file clicked
  onFileDelete?: (path: string) => void;        // Fired after deletion
  onFileCreate?: (path: string) => void;        // Fired after creation
  className?: string;
}

<FileExplorer
  rootPath="/workspace"
  onFileSelect={(file) => console.log('Selected:', file.name)}
/>
```

**Dependencies:**
- `fileSystem.ts` (CRUD API stubs)
- `useTheme` context
- `framer-motion`
- Tailwind CSS + lucide-react icons

---

### 3. UtilityPanel (`src/components/UtilityPanel.tsx`)

Unified side panel that houses both MemoriesPanel and FileExplorer with tab switching.

**Props:**
```typescript
interface UtilityPanelProps {
  isOpen: boolean;                      // Control visibility
  onClose: () => void;                  // Handle close
  fileExplorerRootPath?: string;        // Pass-through to FileExplorer
  fileExplorerInitialTree?: FileTreeNode; // Pass-through to FileExplorer
}

<UtilityPanel
  isOpen={panelOpen}
  onClose={() => setPanelOpen(false)}
  fileExplorerRootPath="/workspace"
/>
```

---

### 4. Hooks

#### `useMemoriesPanel()` (`src/hooks/useMemoriesPanel.ts`)

Simple state hook for controlling the memories panel.

```typescript
const { isOpen, toggleOpen, open, close } = useMemoriesPanel();

<button onClick={toggleOpen}>Memories</button>
{isOpen && <MemoriesPanel />}
```

#### `useFileExplorer()` (`src/hooks/useFileExplorer.ts`)

State hook with automatic tree loading.

```typescript
const { isOpen, toggleOpen, tree, loadingTree, loadTree } = useFileExplorer('/workspace');

// Tree is loaded automatically on mount
// Manually reload: await loadTree('/new-path')
```

---

### 5. FileSystem API (`src/utils/fileSystem.ts`)

Typed API stubs for file operations. Currently mocked; ready for backend integration.

```typescript
// All functions are async and return { success: boolean, ... | error?: string }

await createFile('/path/to/file.txt', 'content');
await createFolder('/path/to/folder');
await deleteFile('/path/to/file.txt');
await deleteFolder('/path/to/folder', true); // recursive
await renameFile('/old/path', '/new/path');
await moveFile('/old/path', '/new/path');
await listFiles('/folder', false); // recursive?
await getFileTree('/root'); // nested tree structure
await readFile('/path/to/file.txt');
await writeFile('/path/to/file.txt', 'new content');

// Helpers
getFileExtension('file.txt');      // 'txt'
isImageFile('photo.jpg');          // true
isCodeFile('main.ts');             // true
formatFileSize(1024);              // '1 KB'
sanitizeFilename('bad@file.txt');  // 'bad_file.txt'
```

---

## Integration into Dashboard

### Option A: Standalone Panels (Recommended)

Add a menu button to the Dashboard's ControlPanel or right-click menu:

```typescript
// In Dashboard.tsx or ControlPanel.tsx
import { UtilityPanel } from './UtilityPanel';
import { useMemoriesPanel } from '../hooks/useMemoriesPanel';

function Dashboard() {
  const [utilityPanelOpen, setUtilityPanelOpen] = useState(false);

  return (
    <>
      <div className="flex">
        {/* Existing dashboard content */}
        <MainDashboard />

        {/* Utility panel slides in from left */}
        <UtilityPanel
          isOpen={utilityPanelOpen}
          onClose={() => setUtilityPanelOpen(false)}
          fileExplorerRootPath={workspaceId ? `/workspaces/${workspaceId}` : '/'}
        />
      </div>

      {/* Toggle button in header */}
      <button onClick={() => setUtilityPanelOpen(!utilityPanelOpen)}>
        {/* Icon: Book + Files */}
      </button>
    </>
  );
}
```

### Option B: Embedded in Right Panel

Replace or supplement the StagePanel with memories/files:

```typescript
// In Dashboard's right panel
{selectedStage === 'memories' && <MemoriesPanel />}
{selectedStage === 'files' && <FileExplorer rootPath={...} />}
```

### Option C: Modal

Wrap UtilityPanel in a modal/drawer component:

```typescript
import { UtilityPanel } from './UtilityPanel';

function UtilityModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <UtilityPanel isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}
```

---

## Data Persistence

### Memories

Memories are automatically persisted to localStorage via `memoryStore.ts`:
- Storage key: `'nomad_agent_memories'`
- Format: JSON array of Memory objects
- Synced via `useSyncExternalStore` for React 18 reactivity

No additional setup needed. The hook `useMemories()` handles everything.

### Files

Files are mocked in the API stubs. To integrate with a real backend:

1. Edit `src/utils/fileSystem.ts` functions
2. Replace console.log stubs with actual API calls
3. Example: Tauri, REST API, or native file system access

```typescript
// Example: Replace mock with actual API
export async function createFile(path: string, content: string) {
  const response = await fetch('/api/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content }),
  });
  return response.json();
}
```

---

## Styling & Theme

All components use:
- **Tailwind CSS v4** — utility classes
- **Lucide React** — icons (File, Folder, Edit2, Trash2, etc.)
- **Framer Motion** — animations
- **Dark mode** via `useTheme()` context

Colors are responsive to `isDarkMode`:
- Dark: `bg-black/20`, `text-white/80`, `border-white/[0.08]`
- Light: `bg-white/20`, `text-zinc-900`, `border-black/[0.08]`

To customize colors, edit color constants at the top of each component:

```typescript
const TYPE_COLORS: Record<MemoryType, { bg: string; text: string; badge: string }> = {
  general: { bg: 'bg-blue-500/10', text: 'text-blue-400', badge: 'bg-blue-500/20 text-blue-300' },
  // ...
};
```

---

## Error Handling

### MemoriesPanel
- Gracefully handles empty memory lists
- Validation on create/edit (required fields)
- localStorage failures logged to console

### FileExplorer
- Validates filename on create (no empty strings, special chars)
- Confirmation modals for destructive actions
- Drop zone validation (can't drop into self)
- Drag/drop fails silently if backend is unavailable

### FileSystem API
- All functions return `{ success: boolean, error?: string }`
- Errors logged to console
- UI provides user-friendly error feedback

---

## Testing

### Manual Test Checklist

**MemoriesPanel:**
- [ ] Create new memory (all types)
- [ ] Edit memory (inline, all fields)
- [ ] Delete memory (confirm modal appears)
- [ ] Search by keyword
- [ ] Filter by type
- [ ] Expand/collapse card content
- [ ] Tags display and work

**FileExplorer:**
- [ ] Expand/collapse folders
- [ ] Right-click file → rename, copy path, delete
- [ ] Right-click folder → create file, create folder, rename, delete
- [ ] Drag file to folder → moves (visual feedback)
- [ ] Create file/folder → appears in tree
- [ ] Inline rename → Enter/Escape shortcuts
- [ ] Delete confirmation shows item count
- [ ] File sizes display

**UtilityPanel:**
- [ ] Tab switching (Memories ↔ Files)
- [ ] Close button slides panel out
- [ ] Dark mode colors correct
- [ ] Animations smooth

---

## Future Enhancements

1. **Backend Integration**
   - Replace fileSystem.ts stubs with real API calls
   - Support Tauri fs API or backend REST endpoints

2. **Advanced Features**
   - File preview (text/images)
   - Search across memories by content
   - Export memories to JSON/CSV
   - Folder-level operations (bulk move, copy)
   - Favorite memories/files
   - Memory sharing

3. **Performance**
   - Virtualize long file lists
   - Lazy-load file tree for large directories
   - Memory pagination

4. **UX Polish**
   - Keyboard shortcuts (cmd+k for search, cmd+n for new)
   - Breadcrumb navigation for file paths
   - Recent memories/files pinned
   - Smart rename (sanitize on blur)

---

## File Locations

```
src/
├── components/
│   ├── MemoriesPanel.tsx       (1,200 lines)
│   ├── FileExplorer.tsx         (1,100 lines)
│   └── UtilityPanel.tsx         (200 lines)
├── hooks/
│   ├── useMemoriesPanel.ts      (50 lines)
│   └── useFileExplorer.ts       (80 lines)
└── utils/
    └── fileSystem.ts           (350 lines, API stubs)
```

---

## TypeScript Types

Key types exported:

```typescript
// From memoryStore.ts
export interface Memory {
  id: string;
  type: 'general' | 'user' | 'campaign' | 'research';
  content: string;
  tags: string[];
  createdAt: string;
  lastAccessedAt: string;
  accessCount: number;
}

// From fileSystem.ts
export interface FileTreeNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'folder';
  size?: number;
  modifiedAt?: string;
  children?: FileTreeNode[];
}
```

---

## Support

For issues or questions, check:
1. Browser console for errors
2. Component props documentation above
3. Example usage in each component file
4. Test checklist for common scenarios
