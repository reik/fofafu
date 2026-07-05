import { cn } from '@/utils/cn';
import type { AvailabilitySlot } from '@/types/playdates';

interface WeekCalendarProps {
  weekStart: Date;
  slots: AvailabilitySlot[];
  mode: 'own' | 'view';
  matchingSlotIds?: Set<string>;
  onCellClick?: (date: string) => void;
  onSlotClick?: (slot: AvailabilitySlot) => void;
}

const GRID_START_HOUR = 7;
const HOURS = Array.from({ length: 14 }, (_, i) => i + GRID_START_HOUR); // 7am–8pm
const SLOT_HEIGHT = 56; // px per hour
const LABEL_COL = 44;   // px for time labels

/** Return the Monday of the week containing `d` */
export function weekMonday(d: Date): Date {
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const dow = day.getDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  day.setDate(day.getDate() + diff);
  return day;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toMinutes(t: string): number {
  const parts = t.split(':').map(Number);
  return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
}

function fmtHour(h: number): string {
  const ampm = h < 12 ? 'am' : 'pm';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}${ampm}`;
}

function fmtTime(t: string): string {
  const parts = t.split(':').map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const ampm = h < 12 ? 'am' : 'pm';
  const display = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${display}${ampm}` : `${display}:${String(m).padStart(2, '0')}${ampm}`;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function WeekCalendar({
  weekStart,
  slots,
  mode,
  matchingSlotIds,
  onCellClick,
  onSlotClick,
}: WeekCalendarProps) {
  const monday = weekMonday(weekStart);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });

  const today = isoDate(new Date());
  const gridStart = GRID_START_HOUR * 60;

  const slotsByDate: Record<string, AvailabilitySlot[]> = {};
  slots.forEach((s) => {
    (slotsByDate[s.date] ??= []).push(s);
  });

  return (
    <div className="overflow-x-auto rounded bg-surface-card shadow-lift border border-[#EDE3D4]">
      {/* color.border.subtle = #EDE3D4 */}

      {/* Header row */}
      <div
        className="grid border-b border-[#EDE3D4]"
        style={{ gridTemplateColumns: `${LABEL_COL}px repeat(7, minmax(80px, 1fr))` }}
      >
        <div className="border-r border-[#EDE3D4]" />
        {days.map((d, i) => {
          const iso = isoDate(d);
          const isToday = iso === today;
          return (
            <div
              key={iso}
              className={cn(
                'text-center py-2 text-[0.78rem] font-bold border-r border-[#EDE3D4] last:border-r-0',
                isToday ? 'text-brand-primary bg-brand-primary/10' : 'text-ink-muted',
              )}
            >
              <div>{DAY_LABELS[i]}</div>
              <div className={cn('text-[1rem] font-bold mt-[1px]', isToday ? 'text-brand-primary' : 'text-ink-lead')}>
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Body */}
      <div
        className="grid relative"
        style={{
          gridTemplateColumns: `${LABEL_COL}px repeat(7, minmax(80px, 1fr))`,
          height: `${HOURS.length * SLOT_HEIGHT}px`,
        }}
      >
        {/* Time labels */}
        <div className="border-r border-[#EDE3D4] relative">
          {HOURS.map((h) => (
            <div
              key={h}
              className="absolute w-full text-right pr-2 text-[0.68rem] text-ink-muted leading-none"
              style={{ top: (h - GRID_START_HOUR) * SLOT_HEIGHT - 7 }}
            >
              {fmtHour(h)}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((d) => {
          const iso = isoDate(d);
          const daySlots = slotsByDate[iso] ?? [];

          return (
            <div
              key={iso}
              className="relative border-r border-[#EDE3D4] last:border-r-0"
              style={{ height: `${HOURS.length * SLOT_HEIGHT}px` }}
            >
              {/* Hour grid lines */}
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="absolute w-full border-t border-[#EDE3D4]/60"
                  style={{ top: (h - GRID_START_HOUR) * SLOT_HEIGHT }}
                />
              ))}

              {/* Clickable background in own mode */}
              {mode === 'own' && (
                <button
                  type="button"
                  aria-label={`Add availability slot on ${iso}`}
                  title={`Add availability slot on ${iso}`}
                  className="absolute inset-0 cursor-pointer hover:bg-brand-primary/10 transition-colors border-none bg-transparent w-full"
                  onClick={() => onCellClick?.(iso)}
                />
              )}

              {/* Slot blocks */}
              {daySlots.map((slot) => {
                const startMin = toMinutes(slot.startTime);
                const endMin = toMinutes(slot.endTime);
                const topPx = ((startMin - gridStart) / 60) * SLOT_HEIGHT;
                const heightPx = ((endMin - startMin) / 60) * SLOT_HEIGHT;

                const isFree = slot.status === 'free';
                const isMatch = matchingSlotIds?.has(slot.id) ?? false;

                // color.slot.match = #F0B24F bg (brand.warm), ink.lead text, ring
                // color.slot.free = brand.primary (#4D9463)
                // color.slot.busy = #E4D9C8 bg, ink.muted text
                const slotColor = isMatch
                  ? 'bg-[#F0B24F] border-[#D4921F] text-ink-lead ring-2 ring-[#F0B24F]/60 ring-offset-1'
                  : isFree
                  ? 'bg-brand-primary/90 border-brand-primary text-white'
                  : 'bg-[#E4D9C8] border-[#C8B99A] text-ink-muted';

                const isClickable = mode === 'own' || (mode === 'view' && isFree);

                return (
                  <button
                    key={slot.id}
                    type="button"
                    className={cn(
                      'absolute left-[2px] right-[2px] rounded border-l-[3px] border-solid px-[5px] py-[3px] text-[0.7rem] leading-tight overflow-hidden z-10 transition-opacity text-left',
                      slotColor,
                      isClickable ? 'cursor-pointer hover:opacity-80' : 'cursor-default',
                    )}
                    style={{ top: topPx, height: Math.max(heightPx, 18) }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSlotClick?.(slot);
                    }}
                    aria-label={
                      slot.note
                        ? `${fmtTime(slot.startTime)}–${fmtTime(slot.endTime)}: ${slot.note}`
                        : `${fmtTime(slot.startTime)}–${fmtTime(slot.endTime)}`
                    }
                    title={
                      slot.note
                        ? `${fmtTime(slot.startTime)}–${fmtTime(slot.endTime)}: ${slot.note}`
                        : `${fmtTime(slot.startTime)}–${fmtTime(slot.endTime)}`
                    }
                  >
                    <div className="font-bold truncate flex items-center gap-1">
                      {isMatch && <span aria-label="Matching slot">★</span>}
                      {fmtTime(slot.startTime)}
                    </div>
                    {heightPx >= 36 && slot.note && (
                      <div className="truncate opacity-80">{slot.note}</div>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
