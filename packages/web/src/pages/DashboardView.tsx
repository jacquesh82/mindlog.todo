import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useI18n } from '../i18n';
import type { DashboardStats } from '../types';

function Kpi({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className={`rounded-xl border border-line p-4 ${accent ? 'bg-brand-soft' : 'bg-surface'}`}>
      <div className={`text-2xl font-semibold ${accent ? 'text-brand' : 'text-ink'}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div className="mt-1 text-xs text-muted">{label}</div>
    </div>
  );
}

function GroupTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 mt-6 text-sm font-semibold uppercase tracking-wide text-muted">{children}</h2>;
}

export function DashboardView() {
  const { t } = useI18n();
  const [s, setS] = useState<DashboardStats | null>(null);

  useEffect(() => {
    void api.dashboard().then(setS);
  }, []);

  if (!s) return <div className="p-8 text-muted">{t('common.loading')}</div>;

  const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  const quotaPct = s.notes.storageQuota
    ? Math.min(100, Math.round((s.notes.storageBytes / s.notes.storageQuota) * 100))
    : 0;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-xl font-semibold text-ink">{t('nav.dashboard')}</h1>

      <GroupTitle>{t('dash.tasks')}</GroupTitle>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label={t('dash.active')} value={s.tasks.active} accent />
        <Kpi label={t('dash.completed')} value={s.tasks.completed} />
        <Kpi label={t('dash.overdue')} value={s.tasks.overdue} />
        <Kpi label={t('dash.dueToday')} value={s.tasks.dueToday} />
        <Kpi label={t('dash.completedThisWeek')} value={s.tasks.completedThisWeek} />
        <Kpi label={t('dash.completionRate')} value={`${s.tasks.completionRate}%`} />
        <Kpi label={t('dash.total')} value={s.tasks.total} />
      </div>

      <GroupTitle>{t('dash.byPriority')}</GroupTitle>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="P1" value={s.tasks.byPriority.p1} />
        <Kpi label="P2" value={s.tasks.byPriority.p2} />
        <Kpi label="P3" value={s.tasks.byPriority.p3} />
        <Kpi label="P4" value={s.tasks.byPriority.p4} />
      </div>

      {s.karma && (
        <>
          <GroupTitle>{t('dash.karma')}</GroupTitle>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label={t('dash.level')} value={s.karma.level} accent />
            <Kpi label={t('dash.points')} value={s.karma.points} />
            <Kpi label={t('dash.streak')} value={`${s.karma.streakDays} ${t('karma.dayStreak')}`} />
            <Kpi label={t('dash.completedThisWeek')} value={s.karma.completedThisWeek} />
          </div>
        </>
      )}

      <GroupTitle>{t('dash.notes')}</GroupTitle>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label={t('dash.notebooks')} value={s.notes.notebooks} accent />
        <Kpi label={t('dash.pages')} value={s.notes.pages} />
        <Kpi label={t('dash.storage')} value={mb(s.notes.storageBytes)} />
        <Kpi label={t('dash.quotaUsed')} value={`${quotaPct}%`} />
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded bg-line">
        <div className="h-full bg-brand" style={{ width: `${quotaPct}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted">
        {mb(s.notes.storageBytes)} / {mb(s.notes.storageQuota)}
      </p>
    </div>
  );
}
