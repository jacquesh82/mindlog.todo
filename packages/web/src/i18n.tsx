import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

// Lightweight bilingual i18n (FR/EN). No external dependency: a dictionary plus
// a `t(key, vars?)` helper with `{var}` interpolation, language persisted to
// localStorage. Add keys to both dictionaries below.

export const LANGS = ['fr', 'en'] as const;
export type Lang = (typeof LANGS)[number];

type Dict = Record<string, string>;

const en: Dict = {
  'app.name': 'mindlog.todo',
  'nav.inbox': 'Inbox',
  'nav.today': 'Today',
  'nav.upcoming': 'Upcoming',
  'nav.filtersLabels': 'Filters & Labels',
  'nav.projects': 'My Projects',
  'nav.favorites': 'Favorites',
  'task.add': 'Add task',
  'task.addPlaceholder': 'Task name. Try “report friday 5pm #Work @urgent p1”.',
  'task.empty': 'No tasks here. Enjoy the calm.',
  'task.cancel': 'Cancel',
  'task.save': 'Save',
  'task.delete': 'Delete',
  'task.completed': 'Completed',
  'project.add': 'Add project',
  'project.name': 'Project name',
  'project.deleteConfirm': 'Delete this project and its tasks?',
  'label.add': 'Add label',
  'filter.add': 'Add filter',
  'search.placeholder': 'Search',
  'priority.p1': 'Priority 1',
  'priority.p2': 'Priority 2',
  'priority.p3': 'Priority 3',
  'priority.p4': 'Priority 4',
  'common.loading': 'Loading…',
  'common.logout': 'Log out',
  'date.overdue': 'Overdue',
  'date.today': 'Today',
  'date.tomorrow': 'Tomorrow',
};

const fr: Dict = {
  'app.name': 'mindlog.todo',
  'nav.inbox': 'Boîte de réception',
  'nav.today': "Aujourd'hui",
  'nav.upcoming': 'À venir',
  'nav.filtersLabels': 'Filtres & Étiquettes',
  'nav.projects': 'Mes projets',
  'nav.favorites': 'Favoris',
  'task.add': 'Ajouter une tâche',
  'task.addPlaceholder': 'Nom de la tâche. Essayez « rapport vendredi 17h #Travail @urgent p1 ».',
  'task.empty': 'Aucune tâche ici. Profitez du calme.',
  'task.cancel': 'Annuler',
  'task.save': 'Enregistrer',
  'task.delete': 'Supprimer',
  'task.completed': 'Terminé',
  'project.add': 'Ajouter un projet',
  'project.name': 'Nom du projet',
  'project.deleteConfirm': 'Supprimer ce projet et ses tâches ?',
  'label.add': 'Ajouter une étiquette',
  'filter.add': 'Ajouter un filtre',
  'search.placeholder': 'Rechercher',
  'priority.p1': 'Priorité 1',
  'priority.p2': 'Priorité 2',
  'priority.p3': 'Priorité 3',
  'priority.p4': 'Priorité 4',
  'common.loading': 'Chargement…',
  'common.logout': 'Se déconnecter',
  'date.overdue': 'En retard',
  'date.today': "Aujourd'hui",
  'date.tomorrow': 'Demain',
};

const DICTS: Record<Lang, Dict> = { en, fr };
const STORAGE_KEY = 'mindlog_lang';

function detectLang(): Lang {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'fr' || saved === 'en') return saved;
  return navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);

  const setLang = useCallback((next: Lang) => {
    localStorage.setItem(STORAGE_KEY, next);
    setLangState(next);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let str = DICTS[lang][key] ?? DICTS.en[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) str = str.replace(`{${k}}`, String(v));
      return str;
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
