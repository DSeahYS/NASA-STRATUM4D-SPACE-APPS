import { LayoutPanelLeft, X } from 'lucide-react';
import { useModalDialog } from './shell/useModalDialog';

export interface StartupOnboardingOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onStartTour: () => void;
  onStartAutoDemo: () => void;
  onOpenIntakeWizard: () => void;
}

interface Region {
  name: string;
  where: string;
  purpose: string;
}

const REGIONS: Region[] = [
  {
    name: 'Header and search',
    where: 'Top bar',
    purpose:
      'Search finds regions, places and commands (press Ctrl K or Cmd K). The view switch changes between 3D globe, 2D map and Subsurface. Share copies a link to the current view.',
  },
  {
    name: 'Learn menu',
    where: 'Top bar, right',
    purpose:
      'Start with a question, the guided tour (12 lessons), the 90-second demo, this interface map, a featured comparison, and About this project.',
  },
  {
    name: 'Tools menu',
    where: 'Top bar, right',
    purpose:
      'Case studies, Compare all basins, Compare paired regions, Probe any point on Earth, and Reset onboarding.',
  },
  {
    name: 'Left panel: layers and regions',
    where: 'Left column',
    purpose:
      'Choose the variable and an optional satellite image layer, filter by significance, read the colour legend (water-storage trend, cm/yr), and search or sort the 30 regions.',
  },
  {
    name: 'Map and Map options',
    where: 'Centre',
    purpose:
      'Click a region to select it, or click an open spot to probe that point. Map options (top right of the map) holds 3D relief, wind, paired-region arcs, change since the first year and layer spacing.',
  },
  {
    name: 'Timeline',
    where: 'Under the map',
    purpose:
      'Play, change speed, reset, or drag the year slider. Years from 2025 to 2035 are a linear extrapolation, shown for illustration only.',
  },
  {
    name: 'Right panel: answer and evidence',
    where: 'Right column',
    purpose:
      'The header switches wording between Plain and Technical. Inspect gives the answer first, then Statistics, Other variables, evidence and cross-checks. Region select lets you draw an area. Ask opens the analyst.',
  },
];

export default function StartupOnboardingOverlay({
  isOpen,
  onClose,
  onStartTour,
  onStartAutoDemo,
  onOpenIntakeWizard,
}: StartupOnboardingOverlayProps) {
  const dialog = useModalDialog<HTMLDivElement>(onClose, isOpen);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-canvas/80 flex items-center justify-center p-4" onClick={onClose}>
      <div
        {...dialog.props}
        aria-labelledby="interface-map-title"
        onClick={(e) => e.stopPropagation()}
        className="popover w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3 border-b border-line shrink-0">
          <div className="flex items-start gap-3">
            <LayoutPanelLeft size={20} className="text-ink-2 mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <h2 id="interface-map-title" className="text-title font-semibold text-ink-1">
                Interface map
              </h2>
              <p className="text-label text-ink-2 mt-1">
                What each part of the screen is for, from the top bar to the right panel.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close the interface map" className="btn btn-ghost btn-sm px-2">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <ol className="overflow-y-auto flex-1 px-5">
          {REGIONS.map((r, i) => (
            <li key={r.name} className={`py-3 ${i > 0 ? 'border-t border-line' : ''}`}>
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <h3 className="text-body font-semibold text-ink-1">{r.name}</h3>
                <span className="text-caption text-ink-3">{r.where}</span>
              </div>
              <p className="text-label text-ink-2 mt-1">{r.purpose}</p>
            </li>
          ))}
        </ol>

        <div className="flex items-center justify-end gap-2 flex-wrap px-5 py-3 border-t border-line shrink-0">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              onClose();
              onOpenIntakeWizard();
            }}
          >
            Start with a question
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              onClose();
              onStartAutoDemo();
            }}
          >
            Watch the demo (90s)
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              onClose();
              onStartTour();
            }}
          >
            Start the guided tour
          </button>
        </div>
      </div>
    </div>
  );
}
