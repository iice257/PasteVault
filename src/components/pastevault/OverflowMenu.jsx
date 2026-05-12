import { ClipboardCopy, CopyPlus, Download, Edit3, FilePlus2, MoreHorizontal, Trash2, XCircle } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";

export function OverflowMenu({ onRename, onDuplicate, onExport, onDelete, onClear, onNewClip, onCopyLatest, label = "More actions" }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="pv-icon-button" type="button" aria-label={label}>
          <MoreHorizontal size={22} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="pv-menu" align="end">
        {onNewClip && (
          <DropdownMenuItem onSelect={onNewClip}>
            <FilePlus2 size={16} />
            New clip
          </DropdownMenuItem>
        )}
        {onCopyLatest && (
          <DropdownMenuItem onSelect={onCopyLatest}>
            <ClipboardCopy size={16} />
            Copy latest
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={onRename}>
          <Edit3 size={16} />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onDuplicate}>
          <CopyPlus size={16} />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onExport}>
          <Download size={16} />
          Export
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onClear}>
          <XCircle size={16} />
          Clear content
        </DropdownMenuItem>
        <DropdownMenuItem className="pv-danger-item" onSelect={onDelete}>
          <Trash2 size={16} />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
