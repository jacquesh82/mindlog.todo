import { useI18n } from '../i18n';
import type { SortMode } from '../tree';

interface Props {
  sort: SortMode;
  onSort: (s: SortMode) => void;
  /** undefined hides the toggle (e.g. the Completed view). */
  showCompleted?: boolean;
  onToggleCompleted?: () => void;
}

const SORTS: SortMode[] = ['manual', 'priority', 'dueDate', 'name'];

export function SortBar({ sort, onSort, showCompleted, onToggleCompleted }: Props) {
  const { t } = useI18n();
  return (
    // On phones this sits on its own full-width row (justify-between); from `sm`
    // up it packs to the right of the title.
    <div className="flex items-center justify-between gap-2 text-sm sm:justify-end">
      {showCompleted !== undefined && (
        <button
          onClick={onToggleCompleted}
          className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-2.5 py-1.5 transition ${
            showCompleted ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted hover:bg-line/60'
          }`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          {showCompleted ? t('view.hideCompleted') : t('view.showCompleted')}
        </button>
      )}
      <label className="flex shrink-0 items-center gap-1.5 text-muted">
        <span>{t('sort.label')}</span>
        <select
          value={sort}
          onChange={(e) => onSort(e.target.value as SortMode)}
          className="rounded-md border border-line bg-surface px-2 py-1.5 text-ink outline-none focus:border-brand"
        >
          {SORTS.map((s) => (
            <option key={s} value={s}>
              {t(`sort.${s}`)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
