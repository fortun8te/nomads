import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, ChevronDown, Folder, File } from "lucide-react";

export type FileNode = {
  id: string;
  name: string;
  type: "file" | "folder";
  children?: FileNode[];
};

export type FileTreeProps = {
  data: FileNode[];
  defaultExpanded?: Record<string, boolean>;
  onSelect?: (node: FileNode) => void;
};

function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(" ");
}

export default function FileTree({ data, defaultExpanded = {}, onSelect }: FileTreeProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(defaultExpanded);
  const [selected, setSelected] = useState<string | null>(null);

  const toggle = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderNodes = (nodes: FileNode[], level = 0) => {
    return nodes.map((n) => (
      <div key={n.id} className="relative">
        <div
          role="treeitem"
          tabIndex={0}
          aria-expanded={n.type === "folder" ? !!expanded[n.id] : undefined}
          className={cn(
            "flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer transition-colors select-none outline-none",
            selected === n.id
              ? "bg-white/10 text-white border-l-2 border-blue-400"
              : "hover:bg-white/5 text-white/60 hover:text-white/90"
          )}
          style={{ paddingLeft: level * 14 + 8 }}
          onClick={() => {
            if (n.type === "folder") toggle(n.id);
            setSelected(n.id);
            onSelect?.(n);
          }}
          onKeyDown={(e) => {
            if (n.type === "folder" && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              toggle(n.id);
            }
          }}
        >
          {n.type === "folder" ? (
            <>
              {expanded[n.id] ? (
                <ChevronDown size={12} className="text-white/40 flex-shrink-0" />
              ) : (
                <ChevronRight size={12} className="text-white/40 flex-shrink-0" />
              )}
              <Folder size={14} className="text-blue-400/70 flex-shrink-0" />
            </>
          ) : (
            <>
              <span className="w-3 flex-shrink-0" />
              <File size={12} className="text-white/30 flex-shrink-0" />
            </>
          )}
          <span className="text-xs truncate">{n.name}</span>
        </div>
        <AnimatePresence initial={false}>
          {n.children && n.children.length > 0 && expanded[n.id] && (
            <motion.div
              key="children"
              role="group"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              style={{ overflow: "hidden" }}
            >
              {renderNodes(n.children, level + 1)}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    ));
  };

  return (
    <div role="tree" className="space-y-0.5 text-sm">
      {renderNodes(data)}
    </div>
  );
}
