/** Per-user storage consumption across the account's large data stores. */
export interface StorageUsage {
  /** Bytes of note-page content (HTML + inline base64 images). */
  notesBytes: number;
  /** Bytes of task attachments. */
  attachmentsBytes: number;
  /** Sum of all tracked stores. */
  totalBytes: number;
  /** Notes quota in bytes (USER_NOTES_QUOTA); informational in cloud-hosted mode. */
  quota: number;
  /** True when running against the shared cloud deployment. */
  cloudHosted: boolean;
}
