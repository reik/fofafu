import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { Layout } from '@/components/Layout';
import {
  WeekCalendar,
  MonthCalendar,
  SlotForm,
  RequestCard,
  weekMonday,
} from '@/features/playdates/components';
import { getAvailability, getRequests, playdateKeys } from '@/api/playdates';
import { getMyFamily, familyKeys } from '@/api/family';
import type { AvailabilitySlot } from '@/types/playdates';

// ── Inline dialog ─────────────────────────────────────────────────

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

function Dialog({ open, title, onClose, children }: DialogProps) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0 bg-ink-lead/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-md rounded-lg bg-surface-card shadow-lift p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-ink-lead">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink-muted hover:text-ink-lead transition-colors"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────

export default function PlaydatesPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const [calView, setCalView] = useState<'week' | 'month'>('week');
  const [weekStart, setWeekStart] = useState(() => weekMonday(new Date()));
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [slotModalOpen, setSlotModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | undefined>();
  const [editingSlot, setEditingSlot] = useState<AvailabilitySlot | undefined>();

  const { data: myFamily } = useQuery({
    queryKey: familyKeys.me,
    queryFn: getMyFamily,
    enabled: !!user,
  });

  const { data: slots = [], isLoading: slotsLoading } = useQuery({
    queryKey: playdateKeys.availability(myFamily?.id ?? ''),
    queryFn: () => getAvailability(myFamily!.id),
    enabled: !!myFamily,
  });

  const { data: requests = [], isLoading: requestsLoading } = useQuery({
    queryKey: playdateKeys.requests(),
    queryFn: getRequests,
    enabled: !!user,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: playdateKeys.availability(myFamily?.id ?? '') });
    qc.invalidateQueries({ queryKey: playdateKeys.requests() });
  };

  const openAdd = (date?: string) => {
    setEditingSlot(undefined);
    setSelectedDate(date);
    setSlotModalOpen(true);
  };

  const openEdit = (slot: AvailabilitySlot) => {
    setEditingSlot(slot);
    setSelectedDate(undefined);
    setSlotModalOpen(true);
  };

  const closeModal = () => {
    setSlotModalOpen(false);
    setEditingSlot(undefined);
    setSelectedDate(undefined);
  };

  const prevPeriod = () => {
    if (calView === 'week') {
      const d = new Date(weekStart);
      d.setDate(d.getDate() - 7);
      setWeekStart(d);
    } else {
      const d = new Date(monthDate);
      d.setMonth(d.getMonth() - 1);
      setMonthDate(d);
    }
  };

  const nextPeriod = () => {
    if (calView === 'week') {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + 7);
      setWeekStart(d);
    } else {
      const d = new Date(monthDate);
      d.setMonth(d.getMonth() + 1);
      setMonthDate(d);
    }
  };

  const goToToday = () => {
    setWeekStart(weekMonday(new Date()));
    setMonthDate(new Date());
  };

  const periodLabel =
    calView === 'week'
      ? `${format(weekStart, 'MMM d')} – ${format(new Date(weekStart.getTime() + 6 * 86400000), 'MMM d, yyyy')}`
      : format(monthDate, 'MMMM yyyy');

  const pendingIncoming = requests.filter(
    (r) => r.ownerFamilyId === myFamily?.id && r.status === 'pending',
  );
  const others = requests.filter(
    (r) => !(r.ownerFamilyId === myFamily?.id && r.status === 'pending'),
  );

  if (!user) {
    return (
      <Layout>
        <p className="text-ink-muted">Please sign in to view your playdates.</p>
        <Link to="/login" className="text-brand-primary underline-offset-4 hover:underline">
          Sign in
        </Link>
      </Layout>
    );
  }

  return (
    <Layout wide>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-lead">Playdates</h1>
          <p className="text-ink-muted mt-1 text-sm">Manage your availability and playdate requests</p>
        </div>
        <button
          type="button"
          onClick={() => openAdd()}
          className="rounded-full bg-brand-primary px-5 py-2.5 font-semibold text-white shadow-lift hover:bg-brand-primary/90 transition-colors text-sm"
        >
          + Add Slot
        </button>
      </div>

      {/* Two-column: calendar + sidebar */}
      <div className="flex gap-5 items-start flex-col lg:flex-row">

        {/* Calendar panel */}
        <section className="flex-1 min-w-0">
          {/* Controls row */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <button
              type="button"
              onClick={prevPeriod}
              className="px-3 py-1 rounded border border-[#EDE3D4] text-[0.85rem] font-semibold text-ink-muted hover:border-brand-primary hover:text-brand-primary transition-colors bg-transparent cursor-pointer"
            >
              ← Prev
            </button>
            <span className="flex-1 text-center font-semibold text-[0.95rem] text-ink-lead">
              {periodLabel}
            </span>
            <button
              type="button"
              onClick={goToToday}
              className="px-3 py-1 rounded border border-[#EDE3D4] text-[0.85rem] font-semibold text-ink-muted hover:border-brand-primary hover:text-brand-primary transition-colors bg-transparent cursor-pointer"
            >
              Today
            </button>
            <button
              type="button"
              onClick={nextPeriod}
              className="px-3 py-1 rounded border border-[#EDE3D4] text-[0.85rem] font-semibold text-ink-muted hover:border-brand-primary hover:text-brand-primary transition-colors bg-transparent cursor-pointer"
            >
              Next →
            </button>

            {/* Week / Month toggle — active segment uses color.brand.primary */}
            <div className="flex rounded border border-[#EDE3D4] overflow-hidden ml-2">
              {(['week', 'month'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setCalView(v)}
                  className={
                    calView === v
                      ? 'px-3 py-1 text-[0.82rem] font-semibold capitalize bg-brand-primary text-white border-none cursor-pointer'
                      : 'px-3 py-1 text-[0.82rem] font-semibold capitalize bg-transparent text-ink-muted border-none cursor-pointer hover:bg-brand-primary/10'
                  }
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex gap-4 text-[0.78rem] mb-2 text-ink-muted flex-wrap">
            {/* color.slot.free = brand.primary */}
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-brand-primary inline-block" /> Free
            </span>
            {/* color.slot.busy = #E4D9C8 */}
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-[#E4D9C8] inline-block" /> Busy
            </span>
            <span>
              {calView === 'week'
                ? 'Click a slot to edit · Click a cell to add'
                : 'Click a slot to edit · Click a date to add'}
            </span>
          </div>

          {slotsLoading ? (
            <div className="flex justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-primary/20 border-t-brand-primary" />
            </div>
          ) : calView === 'week' ? (
            <WeekCalendar
              weekStart={weekStart}
              slots={slots}
              mode="own"
              onCellClick={(date) => openAdd(date)}
              onSlotClick={openEdit}
            />
          ) : (
            <MonthCalendar
              monthDate={monthDate}
              slots={slots}
              mode="own"
              onCellClick={(date) => openAdd(date)}
              onSlotClick={openEdit}
            />
          )}
        </section>

        {/* Requests sidebar */}
        <aside className="w-full lg:w-[300px] shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-semibold text-[1.1rem] text-ink-lead">Playdate Requests</h2>
            {pendingIncoming.length > 0 && (
              /* color.request.pending bg+fg */
              <span className="text-[0.72rem] font-bold bg-[#FBF1DC] text-[#8A5D1F] px-2 py-[2px] rounded-full">
                {pendingIncoming.length} pending
              </span>
            )}
          </div>

          {requestsLoading ? (
            <div className="flex justify-center py-8">
              <div className="h-7 w-7 animate-spin rounded-full border-4 border-brand-primary/20 border-t-brand-primary" />
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-8 px-4 bg-surface-card rounded shadow-lift border border-[#EDE3D4] text-ink-muted text-[0.85rem]">
              No playdate requests yet. Share your calendar with other families!
            </div>
          ) : (
            <div className="flex flex-col gap-3 max-h-[calc(100vh-200px)] overflow-y-auto pr-1">
              {pendingIncoming.length > 0 && (
                <>
                  {/* color.feedback.warning text */}
                  <div className="text-[0.75rem] font-bold text-feedback-warning uppercase tracking-wide">
                    Needs your response
                  </div>
                  {pendingIncoming.map((r) => (
                    <RequestCard key={r.id} request={r} myId={myFamily?.id ?? ''} onUpdate={invalidate} />
                  ))}
                  {others.length > 0 && <div className="border-t border-[#EDE3D4]" />}
                </>
              )}
              {others.map((r) => (
                <RequestCard key={r.id} request={r} myId={myFamily?.id ?? ''} onUpdate={invalidate} />
              ))}
            </div>
          )}
        </aside>
      </div>

      {/* Add / Edit slot dialog */}
      <Dialog
        open={slotModalOpen}
        title={editingSlot ? 'Edit Slot' : 'Add Availability Slot'}
        onClose={closeModal}
      >
        <SlotForm
          initialDate={selectedDate}
          existing={editingSlot}
          onSaved={() => { closeModal(); invalidate(); }}
          onCancel={closeModal}
          onDeleted={() => { closeModal(); invalidate(); }}
        />
      </Dialog>
    </Layout>
  );
}
