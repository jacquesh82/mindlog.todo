import type { Label, LabelCreateInput, LabelUpdateInput } from '../domain/label.js';
import { Conflict, NotFound } from '../errors.js';
import { emitChange } from './changes.js';
import * as repo from '../repository/label.repo.js';

/** Postgres unique-violation error code. */
const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === UNIQUE_VIOLATION;
}

export async function createLabel(userId: string, input: LabelCreateInput): Promise<Label> {
  try {
    const created = await repo.insert(userId, input.name, input.color ?? null, input.isFavorite ?? false);
    emitChange(userId, { entity: 'label', action: 'create', id: created.id });
    return created;
  } catch (err) {
    if (isUniqueViolation(err)) throw Conflict('A label with that name already exists');
    throw err;
  }
}

export function listLabels(userId: string): Promise<Label[]> {
  return repo.list(userId);
}

export async function getLabel(userId: string, id: string): Promise<Label> {
  const label = await repo.getById(userId, id);
  if (!label) throw NotFound('Label not found');
  return label;
}

export async function updateLabel(
  userId: string,
  id: string,
  patch: LabelUpdateInput,
): Promise<Label> {
  try {
    const updated = await repo.update(userId, id, patch);
    if (!updated) throw NotFound('Label not found');
    emitChange(userId, { entity: 'label', action: 'update', id });
    return updated;
  } catch (err) {
    if (isUniqueViolation(err)) throw Conflict('A label with that name already exists');
    throw err;
  }
}

export async function deleteLabel(userId: string, id: string): Promise<void> {
  if (!(await repo.remove(userId, id))) throw NotFound('Label not found');
  emitChange(userId, { entity: 'label', action: 'delete', id });
}
