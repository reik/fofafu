import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { communityKeys, getRecentCommunity, toLocalNow, type ListedFamilyDTO } from '@/api/community';
import { searchFamilies, searchKeys } from '@/api/search';
import { useAuthStore } from '@/stores/auth';

/** Both endpoints clamp `limit` to this, so it is the whole directory the filters can see. */
const DIRECTORY_LIMIT = 50;
const RAIL_SIZE = 5;
const RAIL_WINDOW_DAYS = 7;
const NEAR_UNAVAILABLE_HINT = "We don't have a city and state for your family.";
const QUERY_EMPTY_HINT = 'Try a name, a city, or a few words from their bio.';

/** Shared with the search form's schema so the URL and the form agree on what a query is. */
export const QUERY_LENGTH = { min: 2, max: 100 } as const;

export type LoadStatus = 'loading' | 'error' | 'ready';

/** A family's next free slot, known to start after now. */
export interface OpenSlot {
  id: string;
  start: string;
}

export interface DirectoryEntry {
  family: ListedFamilyDTO;
  slot: OpenSlot | null;
}

export interface RailEntry {
  family: ListedFamilyDTO;
  slot: OpenSlot;
}

export interface FilterOption {
  key: 'near' | 'open';
  label: string;
  hint: string;
  checked: boolean;
  /** Shown, but it cannot be turned on; `hint` says why. */
  unavailable: boolean;
  toggle: () => void;
}

export interface DirectoryFilters {
  options: FilterOption[];
  anyActive: boolean;
  clear: () => void;
}

export interface DirectoryResults {
  status: LoadStatus;
  entries: DirectoryEntry[];
  /** Text of the one status element: loading text, the count, the empty line, or '' on error. */
  statusText: string;
  /** Visually hidden tail of the status element; names the query. */
  statusSuffix: string;
  /** Visible tail of the count line, kept outside the status element. */
  sortNote: string;
  emptyHint: string;
  errorText: string;
  retry: () => void;
}

export interface DirectoryRail {
  status: LoadStatus;
  entries: RailEntry[];
}

export interface FamilyDirectory {
  /** The submitted query; '' while browsing. */
  query: string;
  submitQuery: (query: string) => void;
  filters: DirectoryFilters;
  results: DirectoryResults;
  rail: DirectoryRail;
}

/** What the URL and the signed-in user's location say the page is showing. */
interface DirectoryView {
  query: string;
  near: boolean;
  open: boolean;
  city: string;
  state: string;
  /** "Oakland, CA"; '' when the user has no city or no state on file. */
  location: string;
}

type UrlState = Pick<DirectoryView, 'query' | 'near' | 'open'>;

/** First letter of the first word that is not an article: "The Brooks Family" gives "B". */
export function familyInitial(name: string): string {
  const words = name.trim().split(/\s+/);
  const word = words.find((candidate) => !/^(the|a|an)$/i.test(candidate)) ?? words[0] ?? '';
  return word.charAt(0).toUpperCase();
}

function readView(params: URLSearchParams, userCity: string, userState: string): DirectoryView {
  const typed = (params.get('q') ?? '').trim().slice(0, QUERY_LENGTH.max);
  const city = userCity.trim();
  const state = userState.trim();
  const located = city !== '' && state !== '';
  return {
    query: typed.length >= QUERY_LENGTH.min ? typed : '',
    near: located && params.get('near') === '1',
    open: params.get('open') === '1',
    city,
    state,
    location: located ? `${city}, ${state}` : '',
  };
}

function writeParams(current: URLSearchParams, next: UrlState): URLSearchParams {
  const params = new URLSearchParams(current);
  for (const key of ['q', 'near', 'open']) params.delete(key);
  if (next.query) params.set('q', next.query);
  if (next.near) params.set('near', '1');
  if (next.open) params.set('open', '1');
  return params;
}

function filterOptions(view: DirectoryView, toggle: Record<FilterOption['key'], () => void>): FilterOption[] {
  return [
    {
      key: 'near',
      label: 'Near me',
      hint: view.location || NEAR_UNAVAILABLE_HINT,
      checked: view.near,
      unavailable: view.location === '',
      toggle: toggle.near,
    },
    {
      key: 'open',
      label: 'Open for playdates',
      hint: 'Has a free slot coming up',
      checked: view.open,
      unavailable: false,
      toggle: toggle.open,
    },
  ];
}

/** Query and filters live in the URL; nothing here is mirrored into component state. */
function useDirectoryParams() {
  const [params, setParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const view = readView(params, user?.city ?? '', user?.state ?? '');
  const anyActive = view.near || view.open;
  const go = (change: Partial<UrlState>, replace: boolean) =>
    setParams(writeParams(params, { ...view, ...change }), { replace });

  const filters: DirectoryFilters = {
    options: filterOptions(view, {
      near: () => {
        if (view.location !== '') go({ near: !view.near }, true);
      },
      open: () => go({ open: !view.open }, true),
    }),
    anyActive,
    clear: () => {
      if (anyActive) go({ near: false, open: false }, true);
    },
  };
  const submitQuery = (query: string) => {
    if (query !== view.query) go({ query }, false);
  };

  return { view, filters, submitQuery };
}

function loadStatus(query: { data: unknown; isError: boolean }): LoadStatus {
  if (query.data !== undefined) return 'ready';
  return query.isError ? 'error' : 'loading';
}

/**
 * `now` is read when a request is made and stays out of the query keys, so
 * the passing of time never causes a refetch.
 */
function useDirectoryQueries(query: string) {
  const queryClient = useQueryClient();
  const browseKey = communityKeys.recent(DIRECTORY_LIMIT);
  const searchKey = searchKeys.families(query, DIRECTORY_LIMIT);
  const browse = useQuery({
    queryKey: browseKey,
    queryFn: () => getRecentCommunity(DIRECTORY_LIMIT, toLocalNow(new Date())),
  });
  const search = useQuery({
    queryKey: searchKey,
    queryFn: () => searchFamilies(query, DIRECTORY_LIMIT, toLocalNow(new Date())),
    enabled: query !== '',
  });
  // Resetting, unlike refetching, puts the list back into its loading state.
  const retry = () => {
    void queryClient.resetQueries({ queryKey: query ? searchKey : browseKey, exact: true });
  };

  return { browse, list: query ? search : browse, retry };
}

/** The slot counts only when both halves arrived and it starts after `now`. */
function futureSlot(family: ListedFamilyDTO, now: string): OpenSlot | null {
  const { nextFreeSlotId: id, nextFreeSlotStart: start } = family;
  return id !== null && start !== null && start > now ? { id, start } : null;
}

function samePlace(place: string | null, mine: string): boolean {
  return place !== null && place.trim().toLowerCase() === mine.toLowerCase();
}

function visibleEntries(families: ListedFamilyDTO[], view: DirectoryView, now: string): DirectoryEntry[] {
  return families
    .map((family) => ({ family, slot: futureSlot(family, now) }))
    .filter(({ family, slot }) => {
      if (view.open && slot === null) return false;
      return !view.near || (samePlace(family.city, view.city) && samePlace(family.state, view.state));
    });
}

function byStart(a: RailEntry, b: RailEntry): number {
  if (a.slot.start === b.slot.start) return 0;
  return a.slot.start < b.slot.start ? -1 : 1;
}

function railEntries(families: ListedFamilyDTO[], now: Date): RailEntry[] {
  const from = toLocalNow(now);
  const windowEnd = new Date(now);
  windowEnd.setDate(windowEnd.getDate() + RAIL_WINDOW_DAYS);
  const until = toLocalNow(windowEnd);
  return families
    .flatMap((family) => {
      const slot = futureSlot(family, from);
      return slot !== null && slot.start <= until ? [{ family, slot }] : [];
    })
    .sort(byStart)
    .slice(0, RAIL_SIZE);
}

function countLine({ query, near, open, location }: DirectoryView, count: number): string {
  const noun = count === 1 ? 'family' : 'families';
  const what = query ? `matching ${noun}` : noun;
  return `${count} ${what}${open ? ' open for playdates' : ''}${near ? ` in ${location}` : ''}`;
}

function emptyLine({ query, near, open, location }: DirectoryView): string {
  if (query) {
    return `No families${open ? ' open for playdates' : ''}${near ? ` in ${location}` : ''} matched “${query}”.`;
  }
  if (near && open) return `No families in ${location} are open for playdates right now.`;
  if (near) return `No other families in ${location} yet.`;
  if (open) return 'No families are open for playdates right now.';
  return "No other families yet. They'll show up here as they join.";
}

type ResultsCopy = Pick<DirectoryResults, 'statusText' | 'statusSuffix' | 'sortNote' | 'emptyHint' | 'errorText'>;

/** Driven by the query, the filters and the settled count only, so a background refetch changes nothing. */
function resultsCopy(view: DirectoryView, status: LoadStatus, count: number): ResultsCopy {
  const searching = view.query !== '';
  const copy: ResultsCopy = {
    statusText: '',
    statusSuffix: '',
    sortNote: '',
    emptyHint: '',
    errorText: searching
      ? "We couldn't run that search. Try again in a moment."
      : "We couldn't load families. Try again in a moment.",
  };
  if (status === 'error') return copy;
  if (status === 'loading') return { ...copy, statusText: searching ? 'Searching…' : 'Loading families…' };
  if (count === 0) {
    return { ...copy, statusText: emptyLine(view), emptyHint: searching && !view.near && !view.open ? QUERY_EMPTY_HINT : '' };
  }
  return {
    ...copy,
    statusText: countLine(view, count),
    statusSuffix: searching ? `, for “${view.query}”` : '',
    sortNote: !searching && count > 1 ? ' · newest first' : '',
  };
}

/**
 * Everything `/search` shows: the browse list or query results narrowed by
 * the two filters, and the rail of slots opening in the next 7 days. The
 * rail always comes from the browse list, so neither the query nor the
 * filters narrow it.
 */
export function useFamilyDirectory(): FamilyDirectory {
  const { view, filters, submitQuery } = useDirectoryParams();
  const { browse, list, retry } = useDirectoryQueries(view.query);
  const now = new Date();
  const status = loadStatus(list);
  const entries = visibleEntries(list.data ?? [], view, toLocalNow(now));

  return {
    query: view.query,
    submitQuery,
    filters,
    results: { status, entries, ...resultsCopy(view, status, entries.length), retry },
    rail: { status: loadStatus(browse), entries: railEntries(browse.data ?? [], now) },
  };
}
