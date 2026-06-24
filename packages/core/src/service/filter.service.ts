import type { Filter, FilterCreateInput, FilterUpdateInput } from '../domain/filter.js';
import { FilterError, parseFilter } from '../domain/filter-query.js';
import { BadRequest, NotFound } from '../errors.js';
import * as repo from '../repository/filter.repo.js';

/** Validate that a query string parses, surfacing a 400 with the reason. */
function assertValidQuery(query: string): void {
  try {
    parseFilter(query);
  } catch (err) {
    if (err instanceof FilterError) throw BadRequest(`Invalid filter query: ${err.message}`);
    throw err;
  }
}

export async function createFilter(userId: string, input: FilterCreateInput): Promise<Filter> {
  assertValidQuery(input.query);
  return repo.insert(userId, input.name, input.query, input.color ?? null, input.position ?? 0);
}

export function listFilters(userId: string): Promise<Filter[]> {
  return repo.list(userId);
}

export async function getFilter(userId: string, id: string): Promise<Filter> {
  const filter = await repo.getById(userId, id);
  if (!filter) throw NotFound('Filter not found');
  return filter;
}

export async function updateFilter(
  userId: string,
  id: string,
  patch: FilterUpdateInput,
): Promise<Filter> {
  if (patch.query !== undefined) assertValidQuery(patch.query);
  const updated = await repo.update(userId, id, patch);
  if (!updated) throw NotFound('Filter not found');
  return updated;
}

export async function deleteFilter(userId: string, id: string): Promise<void> {
  if (!(await repo.remove(userId, id))) throw NotFound('Filter not found');
}
