// Aggregates every piece of a user's data into one JSON document for a
// "download all my data" / backup feature. Reads through the repositories
// directly (this is a read-only snapshot) and inlines note-page and attachment
// content so the export is self-contained.
import * as aiLogRepo from '../repository/ai-log.repo.js';
import * as attachmentRepo from '../repository/attachment.repo.js';
import * as calendarRepo from '../repository/calendar-source.repo.js';
import * as filterRepo from '../repository/filter.repo.js';
import * as labelRepo from '../repository/label.repo.js';
import * as noteRepo from '../repository/note.repo.js';
import * as projectRepo from '../repository/project.repo.js';
import * as sectionRepo from '../repository/section.repo.js';
import * as taskRepo from '../repository/task.repo.js';
import * as aiLogService from './ai-log.service.js';
import * as authService from './auth.service.js';
import * as karmaService from './karma.service.js';

/** Build a complete, self-contained JSON snapshot of everything the user owns. */
export async function buildExport(userId: string): Promise<Record<string, unknown>> {
  const [user, tasks, projects, labels, filters, notebooks, calendarSources, karma, aiLogs, aiUsage] =
    await Promise.all([
      authService.getUser(userId),
      taskRepo.listAll(userId),
      projectRepo.list(userId, true),
      labelRepo.list(userId),
      filterRepo.list(userId),
      noteRepo.listNotebooks(userId),
      calendarRepo.list(userId),
      karmaService.getKarma(userId),
      aiLogService.listLogs(userId, 1000),
      aiLogService.getUsage(userId),
    ]);

  // Sections live under projects; flatten them all.
  const sections = (
    await Promise.all(projects.map((p) => sectionRepo.listByProject(userId, p.id)))
  ).flat();

  // Attachments hang off tasks; inline their full text content.
  const attachments = (
    await Promise.all(
      tasks.map(async (taskItem) => {
        const list = await attachmentRepo.listByTask(userId, taskItem.id);
        return Promise.all(list.map((a) => attachmentRepo.getById(userId, a.id)));
      }),
    )
  )
    .flat()
    .filter(Boolean);

  // Notebooks contain pages; inline each page's full content.
  const notes = await Promise.all(
    notebooks.map(async (nb) => {
      const summaries = await noteRepo.listPages(userId, nb.id);
      const pages = await Promise.all(summaries.map((s) => noteRepo.getPage(userId, s.id)));
      return { notebook: nb, pages: pages.filter(Boolean) };
    }),
  );

  return {
    schema: 'mindlog.todo/export',
    version: 1,
    exportedAt: new Date().toISOString(),
    account: user,
    karma,
    tasks,
    projects,
    sections,
    labels,
    filters,
    attachments,
    notes,
    calendarSources,
    ai: { logs: aiLogs, usage: aiUsage },
  };
}
