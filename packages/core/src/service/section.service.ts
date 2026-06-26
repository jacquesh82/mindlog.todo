import type { Section, SectionCreateInput, SectionUpdateInput } from '../domain/section.js';
import { BadRequest, NotFound } from '../errors.js';
import * as projectRepo from '../repository/project.repo.js';
import * as repo from '../repository/section.repo.js';

export async function createSection(
  userId: string,
  input: SectionCreateInput,
): Promise<Section> {
  const project = await projectRepo.getById(userId, input.projectId);
  if (!project) throw BadRequest('projectId does not reference an existing project');
  return repo.insert(input.projectId, input.name, input.position ?? 0);
}

export function listSections(userId: string, projectId: string): Promise<Section[]> {
  return repo.listByProject(userId, projectId);
}

export async function getSection(userId: string, id: string): Promise<Section> {
  const section = await repo.getById(userId, id);
  if (!section) throw NotFound('Section not found');
  return section;
}

export async function updateSection(
  userId: string,
  id: string,
  patch: SectionUpdateInput,
): Promise<Section> {
  const updated = await repo.update(userId, id, patch);
  if (!updated) throw NotFound('Section not found');
  return updated;
}

export async function deleteSection(userId: string, id: string): Promise<void> {
  if (!(await repo.remove(userId, id))) throw NotFound('Section not found');
}
