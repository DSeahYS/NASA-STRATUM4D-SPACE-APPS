import { Search, Share2 } from 'lucide-react';
import MenuButton, { type MenuItem } from './MenuButton';
import { shortcutHint } from './shellUtils';

export type ViewMode = '3D' | '2D' | '4D';

export interface HeaderBarProps {
  viewMode: ViewMode;
  /** True while the subsurface block view is open, which counts as the "Subsurface" view. */
  subsurfaceOpen: boolean;
  onChangeView: (v: ViewMode) => void;
  onOpenSearch: () => void;
  learnItems: MenuItem[];
  toolItems: MenuItem[];
  onShare: () => void;
}

const VIEWS: { id: ViewMode; label: string; title: string }[] = [
  { id: '3D', label: '3D globe', title: 'Rotating globe' },
  { id: '2D', label: '2D map', title: 'Flat map with no hidden far side' },
  { id: '4D', label: 'Subsurface', title: 'Cut-away of the underground layers for the selected region' },
];

/** Slim one-row header: brand, search, view switch, Learn, Tools, Share. */
export default function HeaderBar({
  viewMode,
  subsurfaceOpen,
  onChangeView,
  onOpenSearch,
  learnItems,
  toolItems,
  onShare,
}: HeaderBarProps) {
  const hint = shortcutHint();
  const activeView: ViewMode = subsurfaceOpen ? '4D' : viewMode;

  return (
    <header className="shrink-0 flex items-center gap-3 h-14 px-4 bg-surface-1 border-b border-line min-w-0">
      <h1 className="m-0 mr-2 text-base leading-6 font-semibold tracking-tight text-ink-1 whitespace-nowrap">
        Stratum-4D
      </h1>

      <button
        type="button"
        onClick={onOpenSearch}
        className="flex items-center gap-2 h-9 px-2.5 flex-[1_1_220px] max-w-[420px] min-w-[160px] bg-canvas border border-line rounded-md text-left text-ink-3 hover:border-line-strong cursor-pointer"
        aria-label={`Search regions, places and commands (${hint})`}
        aria-keyshortcuts="Control+K Meta+K"
      >
        <Search size={16} aria-hidden="true" className="shrink-0" />
        <span className="flex-1 min-w-0 truncate text-body">Search regions, places, commands</span>
        <kbd className="shrink-0 font-sans text-caption text-ink-3 border border-line rounded px-1.5">{hint}</kbd>
      </button>

      <div className="seg shrink-0" role="group" aria-label="View">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            className="seg-item"
            aria-pressed={activeView === v.id}
            title={v.title}
            onClick={() => onChangeView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-w-0" aria-hidden="true" />

      <nav aria-label="Learn and tools" className="flex items-center gap-2 shrink-0">
        <MenuButton label="Learn" items={learnItems} />
        <MenuButton label="Tools" items={toolItems} />
      </nav>
      <button type="button" className="btn btn-secondary shrink-0" onClick={onShare} title="Copy a link to this exact view">
        <Share2 size={16} aria-hidden="true" />
        <span>Share</span>
      </button>
    </header>
  );
}
