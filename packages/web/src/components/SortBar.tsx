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
    <div className="flex items-center gap-2 text-sm">
      {showCompleted !== undefined && (
        <button
          onClick={onToggleCompleted}
          className={`rounded-md border px-2 py-1 ${showCompleted ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted'}`}
        >
          {showCompleted ? `✓ ${t('view.hideCompleted')}` : `✓ ${t('view.showCompleted')}`}
        </button>
      )}
      <label className="flex items-center gap-1 text-muted">
        <span>{t('sort.label')}</span>
        <select
          value={sort}
          onChange={(e) => onSort(e.target.value as SortMode)}
          className="rounded-md border border-line bg-surface px-2 py-1 text-ink outline-none focus:border-brand"
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
