import { cn } from '@/utils/cn';
import type { AvailabilitySlot } from '@/types/playdates';
import { isoDate, weekMonday } from './WeekCalendar';

interface MonthCalendarProps {
  monthDate: Date;
  slots: AvailabilitySlot[];
  mode: 'own' | 'view';
  matchingSlotIds?: Set<string>;
  onCellClick?: (date: string) => void;
  onSlotClick?: (slot: AvailabilitySlot) => void;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function fmtTime(t: string): string {
  const parts = t.split(':').map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const ampm = h < 12 ? 'am' : 'pm';
  const display = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${display}${ampm}` : `${display}:${String(m).padStart(2, '0')}${ampm}`;
}

function buildMonthGrid(monthDate: Date): Date[] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = weekMonday(firstOfMonth);

  const days: Date[] = [];
  const cursor = new Date(gridStart);
  while (true) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
    if (cursor.getMonth() !== month && cursor.getDay() === 1) break;
    if (days.length > 42) break;
  }
  return days;
}

export function MonthCalendar({
  monthDate,
  slots,
  mode,
  matchingSlotIds,
  onCellClick,
  onSlotClick,
}: MonthCalendarProps) {
  const today = isoDate(new Date());
  const currentMonth = monthDate.getMonth();

  const days = buildMonthGrid(monthDate);

  const slotsByDate: Record<string, AvailabilitySlot[]> = {};
  slots.forEach((s) => {
    (slotsByDate[s.date] ??= []).push(s);
  });

  return (
    <div className="rounded bg-surface-card shadow-lift overflow-hidden border border-[#EDE3D4]">
      {/* color.border.subtle = #EDE3D4 */}

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b border-[#EDE3D4]">
        {DAY_LABELS.map((label) => (
          <div
            key={label}
            className="text-center py-2 text-[0.75rem] font-bold text-ink-muted uppercase tracking-wide border-r border-[#EDE3D4]/60 last:border-r-0"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {days.map((day, idx) => {
          const iso = isoDate(day);
          const isToday = iso === today;
          const isCurrentMonth = day.getMonth() === currentMonth;
          const daySlots = slotsByDate[iso] ?? [];
          const isLastRow = idx >= days.length - 7;
          const isLastCol = (idx + 1) % 7 === 0;
          const isClickableCell = mode === 'own' && isCurrentMonth;

          return (
            <div
              key={iso}
              className={cn(
                'min-h-[90px] p-1 border-r border-b border-[#EDE3D4]/60 flex flex-col gap-[3px] transition-colors',
                isLastRow && 'border-b-0',
                isLastCol && 'border-r-0',
                isCurrentMonth ? 'bg-surface-card' : 'bg-surface-warm',
                isClickableCell && 'cursor-pointer hover:bg-brand-primary/5',
              )}
              onClick={() => {
                if (isClickableCell) onCellClick?.(iso);
              }}
              {...(isClickableCell
                ? {
                    role: 'button' as const,
                    tabIndex: 0,
                    'aria-label': `Add availability slot on ${iso}`,
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.repeat) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onCellClick?.(iso);
                      }
                    },
                  }
                : {})}
            >
              {/* Date number */}
              <div className="flex justify-end">
                <span
                  className={cn(
                    'text-[0.8rem] font-bold w-6 h-6 flex items-center justify-center rounded-full leading-none',
                    isToday
                      ? 'bg-brand-primary-pressed text-white'
                      : isCurrentMonth
                      ? 'text-ink-lead'
                      : 'text-ink-muted',
                  )}
                >
                  {day.getDate()}
                </span>
              </div>

              {/* Slot chips */}
              <div className="flex flex-col gap-[2px]">
                {daySlots.map((slot) => {
                  const isFree = slot.status === 'free';
                  const isMatch = matchingSlotIds?.has(slot.id) ?? false;
                  const isClickable = mode === 'own' || (mode === 'view' && isFree);

                  // color.slot.match = #F0B24F bg (brand.warm)
                  // color.slot.free = brand.primary
                  // color.slot.busy = #E4D9C8 bg
                  const chipColor = isMatch
                    ? 'bg-[#F0B24F] text-ink-lead ring-1 ring-[#D4921F]'
                    : isFree
                    ? 'bg-brand-primary-pressed text-white'
                    : 'bg-[#E4D9C8] text-ink-muted';

                  return (
                    <button
                      key={slot.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isClickable) onSlotClick?.(slot);
                      }}
                      title={
                        slot.note
                          ? `${fmtTime(slot.startTime)}–${fmtTime(slot.endTime)}: ${slot.note}`
                          : `${fmtTime(slot.startTime)}–${fmtTime(slot.endTime)}`
                      }
                      aria-label={
                        slot.note
                          ? `${fmtTime(slot.startTime)}–${fmtTime(slot.endTime)}: ${slot.note}`
                          : `${fmtTime(slot.startTime)}–${fmtTime(slot.endTime)}`
                      }
                      className={cn(
                        'w-full text-left text-[0.68rem] font-semibold px-[5px] py-[2px] rounded leading-tight truncate border-none',
                        chipColor,
                        isClickable ? 'cursor-pointer hover:opacity-75' : 'cursor-default',
                      )}
                    >
                      {isMatch && <span aria-label="Matching slot">★ </span>}
                      {fmtTime(slot.startTime)}
                      {slot.note ? ` · ${slot.note}` : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
