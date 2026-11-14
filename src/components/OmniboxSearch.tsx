import { useState, useEffect, useRef, useMemo, useId } from 'react';
import { Search, Compass, MapPin, Layers, FileText, Navigation, Globe2, CornerDownLeft, X, Command } from 'lucide-react';
import type { BasinFeature } from './Globe';
import { DETECTIVE_CASES, type CaseFile } from './CaseFilesModal';
import { searchLocations, OFFLINE_LANDMARKS, type GeocodeLocation } from '../lib/geocoding';
import { useModalDialog } from './shell/useModalDialog';
import { findContainingBasin } from '../lib/geo';

/** An app action listed in the omnibox "Commands" group, so no feature depends on a single button. */
export interface OmniboxCommand {
  id: string;
  label: string;
  /** Group heading inside Commands, e.g. "Learn", "Tools", "View". */
  section?: string;
  /** Extra words that should match, e.g. "matrix dashboard". */
  keywords?: string;
  run: () => void;
}

export interface OmniboxSearchProps {
  isOpen: boolean;
  onClose: () => void;
  allBasins: BasinFeature[];
  summaryMeta?: Record<string, unknown> | null;
  onSelectBasin: (basin: BasinFeature) => void;
  onSelectCase?: (caseItem: CaseFile) => void;
  onTriggerProbe: (lat: number, lon: number) => void;
  onFlyCamera: (lat: number, lon: number) => void;
  /** Optional app commands, shown as a "Commands" group. */
  commands?: OmniboxCommand[];
}

type Entry = { kind: 'command'; command: OmniboxCommand } | { kind: 'place'; place: GeocodeLocation };

const CATEGORY: Record<GeocodeLocation['category'], { label: string; Icon: typeof MapPin }> = {
  basin: { label: 'Region', Icon: Layers },
  case: { label: 'Case study', Icon: FileText },
  city: { label: 'City', Icon: Globe2 },
  landmark: { label: 'Landmark', Icon: Compass },
  coordinate: { label: 'Coordinates', Icon: Navigation },
};

function fmtCoord(lat: number, lon: number) {
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
}

export default function OmniboxSearch({
  isOpen,
  onClose,
  allBasins,
  summaryMeta,
  onSelectBasin,
  onSelectCase,
  onTriggerProbe,
  onFlyCamera,
  commands = [],
}: OmniboxSearchProps) {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodeLocation[] | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [searchedQuery, setSearchedQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  // Reset when the palette opens
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setQuery('');
      setSearchResults(null);
      setSearchedQuery('');
      setActiveIndex(0);
    }
  }

  // Escape, Tab trap, focus into the palette on open and back to the trigger on close.
  const dialog = useModalDialog<HTMLDivElement>(onClose, isOpen);

  // Suggestions for an empty query
  const featuredRecommendations = useMemo<GeocodeLocation[]>(() => {
    return [
      ...DETECTIVE_CASES.slice(0, 3).map((c) => ({
        id: `case-${c.id}`,
        name: `${c.caseNumber}: ${c.title}`,
        category: 'case' as const,
        lat: c.cameraCenter[1],
        lon: c.cameraCenter[0],
        subtitle: c.subtitle,
        caseObj: c,
        basinPair: c.regionAId && c.regionBId ? ([c.regionAId, c.regionBId] as [string, string]) : undefined,
      })),
      ...allBasins.slice(0, 4).map((b) => {
        const s = b.properties.theil_sen_slope;
        const signed = `${s < 0 ? '−' : '+'}${Math.abs(s).toFixed(2)}`;
        return {
          id: `basin-${b.properties.basin_id}`,
          name: b.properties.basin_name,
          category: 'basin' as const,
          lat: b.properties.centroid[1],
          lon: b.properties.centroid[0],
          basinId: b.properties.basin_id,
          subtitle: `${b.properties.continent} · ${signed} cm/yr`,
        };
      }),
      {
        id: 'lm-lakemead',
        name: 'Lake Mead / Hoover Dam',
        category: 'landmark' as const,
        lat: 36.015,
        lon: -114.737,
        subtitle: 'Nevada and Arizona · Colorado River reservoir',
      },
      {
        id: 'lm-aralsea',
        name: 'Aral Sea (former)',
        category: 'landmark' as const,
        lat: 45.0,
        lon: 60.0,
        subtitle: 'Kazakhstan and Uzbekistan · dried-up inland sea',
      },
    ];
  }, [allBasins]);

  // Debounced search across basins, cases, offline landmarks and coordinates. The network geocoder can take
  // seconds, so local matches (below) are shown at once and the remote answer is merged in when it arrives.
  useEffect(() => {
    if (!isOpen || !query.trim()) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const hits = await searchLocations(query, allBasins, DETECTIVE_CASES, summaryMeta);
      if (cancelled) return;
      setSearchResults(hits);
      setSearchedQuery(query.trim().toLowerCase());
      setActiveIndex(0);
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, isOpen, allBasins, summaryMeta]);

  const q = query.trim().toLowerCase();
  const searchPending = !!q && searchedQuery !== q;
  const localMatches = useMemo<GeocodeLocation[]>(() => {
    if (!q) return [];
    const out: GeocodeLocation[] = [];
    for (const c of DETECTIVE_CASES) {
      if (`${c.caseNumber} ${c.title} ${c.subtitle} ${c.id}`.toLowerCase().includes(q)) {
        out.push({
          id: `case-${c.id}`,
          name: `${c.caseNumber}: ${c.title}`,
          category: 'case',
          lat: c.cameraCenter[1],
          lon: c.cameraCenter[0],
          subtitle: c.subtitle,
          caseObj: c,
          basinPair: c.regionAId && c.regionBId ? ([c.regionAId, c.regionBId] as [string, string]) : undefined,
        });
      }
    }
    for (const b of allBasins) {
      const pr = b.properties;
      if (`${pr.basin_name} ${pr.basin_id} ${pr.continent}`.toLowerCase().includes(q)) {
        const s = pr.theil_sen_slope;
        out.push({
          id: `basin-${pr.basin_id}`,
          name: pr.basin_name,
          category: 'basin',
          lat: pr.centroid[1],
          lon: pr.centroid[0],
          basinId: pr.basin_id,
          subtitle: `${pr.continent} · ${s < 0 ? '−' : '+'}${Math.abs(s).toFixed(2)} cm/yr`,
        });
      }
    }
    for (const lm of OFFLINE_LANDMARKS) {
      if (lm.name.toLowerCase().includes(q) || lm.subtitle.toLowerCase().includes(q)) out.push(lm);
    }
    return out.slice(0, 10);
  }, [q, allBasins]);
  const places = q ? (searchPending ? localMatches : (searchResults ?? [])) : featuredRecommendations;
  const matchedCommands = useMemo(() => {
    if (!q) return commands;
    return commands.filter((c) =>
      `${c.label} ${c.section ?? ''} ${c.keywords ?? ''}`.toLowerCase().includes(q)
    );
  }, [commands, q]);

  // With a query, commands come first (they are exact app actions); without one, places lead.
  const entries: Entry[] = q
    ? [
        ...matchedCommands.map((command) => ({ kind: 'command' as const, command })),
        ...places.map((place) => ({ kind: 'place' as const, place })),
      ]
    : [
        ...places.map((place) => ({ kind: 'place' as const, place })),
        ...matchedCommands.map((command) => ({ kind: 'command' as const, command })),
      ];
  const safeActive = entries.length ? Math.min(activeIndex, entries.length - 1) : 0;

  const handleSelectPlace = (item: GeocodeLocation) => {
    onClose();

    if (item.category === 'case') {
      const caseId = item.id.replace('case-', '').replace('dipole-', '');
      const caseObj =
        item.caseObj ||
        DETECTIVE_CASES.find(
          (c) =>
            c.id === caseId ||
            c.id === item.id ||
            c.regionAId === item.basinPair?.[0] ||
            c.regionBId === item.basinPair?.[1] ||
            c.title.toLowerCase().includes(item.name.toLowerCase()) ||
            c.subtitle.toLowerCase().includes(item.name.toLowerCase())
        );
      if (caseObj && onSelectCase) {
        onSelectCase(caseObj);
      } else if (item.basinPair && item.basinPair.length >= 2) {
        const primaryBasin = allBasins.find((b) => b.properties.basin_id === item.basinPair![0]);
        if (primaryBasin) onSelectBasin(primaryBasin);
        onFlyCamera(item.lat, item.lon);
      } else {
        onFlyCamera(item.lat, item.lon);
      }
      return;
    }

    if (item.category === 'basin') {
      const basin = allBasins.find(
        (b) =>
          b.properties.basin_id === item.basinId ||
          b.properties.basin_name.toLowerCase() === item.name.toLowerCase()
      );
      if (basin) {
        onSelectBasin(basin);
        onFlyCamera(item.lat, item.lon);
      }
      return;
    }

    // Landmarks, cities or raw coordinates: inspect the containing region, or probe the point
    const containing = findContainingBasin(item.lat, item.lon, allBasins);
    if (containing) {
      onSelectBasin(containing);
      onFlyCamera(item.lat, item.lon);
    } else {
      onTriggerProbe(item.lat, item.lon);
      onFlyCamera(item.lat, item.lon);
    }
  };

  const activate = (entry: Entry | undefined) => {
    if (!entry) return;
    if (entry.kind === 'command') {
      onClose();
      entry.command.run();
    } else {
      handleSelectPlace(entry.place);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(entries.length ? (safeActive + 1) % entries.length : 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(entries.length ? (safeActive - 1 + entries.length) % entries.length : 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      activate(entries[safeActive]);
    }
  };

  // Keep the active row in view
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${safeActive}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [safeActive]);

  if (!isOpen) return null;

  const optionId = (i: number) => `${listboxId}-opt-${i}`;
  const firstCommandIndex = entries.findIndex((e) => e.kind === 'command');
  const firstPlaceIndex = entries.findIndex((e) => e.kind === 'place');

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-canvas/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        {...dialog.props}
        aria-label="Search regions, places and commands"
        className="popover w-full max-w-2xl flex flex-col overflow-hidden bg-surface-1"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 h-14 border-b border-line">
          <Search size={18} aria-hidden="true" className="text-ink-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listboxId}
            aria-activedescendant={entries.length ? optionId(safeActive) : undefined}
            aria-autocomplete="list"
            aria-label="Search regions, places and commands"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search regions, places, commands, or coordinates such as 2.1S, 60.0W"
            className="flex-1 min-w-0 h-10 bg-transparent border-0 text-body text-ink-1 placeholder:text-ink-3 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="btn btn-ghost btn-sm px-1.5"
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close search">
            Esc
          </button>
        </div>

        <div ref={listRef} id={listboxId} role="listbox" aria-label="Results" className="max-h-[420px] overflow-y-auto p-1.5">
          {entries.length === 0 ? (
            <div className="p-8 text-center text-label text-ink-3">
              {searchPending ? 'Searching places…' : 'No matching regions, places or commands.'}
            </div>
          ) : (
            entries.map((entry, index) => {
              const isActive = index === safeActive;
              const heading =
                index === firstCommandIndex ? 'Commands' : index === firstPlaceIndex ? (q ? 'Places and regions' : 'Suggestions') : null;
              const rowClass = `flex items-center justify-between gap-3 min-h-11 px-2.5 py-1.5 rounded-md cursor-pointer ${
                isActive ? 'bg-surface-2 text-ink-1' : 'text-ink-2'
              }`;

              if (entry.kind === 'command') {
                const c = entry.command;
                return (
                  <div key={`cmd-${c.id}`}>
                    {heading && <div className="px-2.5 pt-2 pb-1 text-caption font-medium text-ink-3">{heading}</div>}
                    <div
                      id={optionId(index)}
                      data-index={index}
                      role="option"
                      aria-selected={isActive}
                      onClick={() => activate(entry)}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={rowClass}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Command size={16} aria-hidden="true" className="text-ink-3 shrink-0" />
                        <span className="text-body text-ink-1 truncate">{c.label}</span>
                        {c.section && <span className="tag shrink-0">{c.section}</span>}
                      </div>
                      {isActive && <CornerDownLeft size={14} aria-hidden="true" className="text-ink-3 shrink-0" />}
                    </div>
                  </div>
                );
              }

              const item = entry.place;
              const { label, Icon } = CATEGORY[item.category] ?? { label: 'Place', Icon: MapPin };
              return (
                <div key={`place-${item.id}`}>
                  {heading && <div className="px-2.5 pt-2 pb-1 text-caption font-medium text-ink-3">{heading}</div>}
                  <div
                    id={optionId(index)}
                    data-index={index}
                    role="option"
                    aria-selected={isActive}
                    onClick={() => activate(entry)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={rowClass}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon size={16} aria-hidden="true" className="text-ink-3 shrink-0" />
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-body text-ink-1 truncate">{item.name}</span>
                          <span className="tag shrink-0">{label}</span>
                        </div>
                        <span className="text-caption text-ink-3 truncate">{item.subtitle}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-caption text-ink-3 tnum">{fmtCoord(item.lat, item.lon)}</span>
                      {isActive && <CornerDownLeft size={14} aria-hidden="true" className="text-ink-3" />}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        {searchPending && entries.length > 0 && (
          <div className="px-4 py-1.5 border-t border-line text-caption text-ink-3" role="status">
            Searching places…
          </div>
        )}

        <div className="flex items-center gap-4 px-4 py-2 border-t border-line text-caption text-ink-3">
          <span>
            <kbd className="font-sans border border-line rounded px-1">↑</kbd>{' '}
            <kbd className="font-sans border border-line rounded px-1">↓</kbd> move
          </span>
          <span>
            <kbd className="font-sans border border-line rounded px-1">Enter</kbd> open
          </span>
          <span>
            <kbd className="font-sans border border-line rounded px-1">Esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
