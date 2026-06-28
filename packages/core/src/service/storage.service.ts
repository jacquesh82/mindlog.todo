import { cloudHosted } from '../config.js';
import { USER_NOTES_QUOTA } from '../domain/note.js';
import type { StorageUsage } from '../domain/storage.js';
import * as attachmentRepo from '../repository/attachment.repo.js';
import * as noteRepo from '../repository/note.repo.js';

/**
 * Compute how much database storage the user's notes and attachments occupy.
 * All user content lives in Postgres (see docs/STORAGE.md), so these byte counts
 * are the account's effective disk footprint.
 */
export async function getStorageUsage(userId: string): Promise<StorageUsage> {
  const [notesBytes, attachmentsBytes] = await Promise.all([
    noteRepo.userContentBytes(userId),
    attachmentRepo.userContentBytes(userId),
  ]);
  return {
    notesBytes,
    attachmentsBytes,
    totalBytes: notesBytes + attachmentsBytes,
    quota: USER_NOTES_QUOTA,
    cloudHosted: cloudHosted(),
  };
}
