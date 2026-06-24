import type {
  Project,
  ProjectCreateInput,
  ProjectUpdateInput,
} from '../domain/project.js';
import { BadRequest, NotFound } from '../errors.js';
import * as repo from '../repository/project.repo.js';

export async function createProject(
  userId: string,
  input: ProjectCreateInput,
): Promise<Project> {
  if (input.parentId) {
    const parent = await repo.getById(userId, input.parentId);
    if (!parent) throw BadRequest('parentId does not reference an existing project');
  }
  return repo.insert(userId, {
    name: input.name,
    color: input.color ?? null,
    parentId: input.parentId ?? null,
    isFavorite: input.isFavorite,
    viewMode: input.viewMode,
    position: input.position,
  });
}

export function listProjects(userId: string, includeArchived = false): Promise<Project[]> {
  return repo.list(userId, includeArchived);
}

export async function getProject(userId: string, id: string): Promise<Project> {
  const project = await repo.getById(userId, id);
  if (!project) throw NotFound('Project not found');
  return project;
}

export async function updateProject(
  userId: string,
  id: string,
  patch: ProjectUpdateInput,
): Promise<Project> {
  const existing = await repo.getById(userId, id);
  if (!existing) throw NotFound('Project not found');
  if (existing.isInbox && (patch.parentId !== undefined || patch.archived)) {
    throw BadRequest('The Inbox project cannot be moved or archived');
  }

  // Re-parenting: validate target and guard against cycles.
  if (patch.parentId !== undefined && patch.parentId !== null) {
    if (patch.parentId === id) throw BadRequest('A project cannot be its own parent');
    const parent = await repo.getById(userId, patch.parentId);
    if (!parent) throw BadRequest('parentId does not reference an existing project');
    const descendants = await repo.descendantIds(userId, id);
    if (descendants.includes(patch.parentId)) {
      throw BadRequest('Cannot move a project under one of its own descendants');
    }
  }

  const updated = await repo.update(userId, id, patch);
  if (!updated) throw NotFound('Project not found');
  return updated;
}

export async function deleteProject(userId: string, id: string): Promise<void> {
  const existing = await repo.getById(userId, id);
  if (!existing) throw NotFound('Project not found');
  if (existing.isInbox) throw BadRequest('The Inbox project cannot be deleted');
  await repo.remove(userId, id);
}

/** Idempotently provision the user's Inbox; returns it either way. */
export function ensureInbox(userId: string): Promise<Project> {
  return repo.ensureInbox(userId);
}

export function getInbox(userId: string): Promise<Project | null> {
  return repo.getInbox(userId);
}
