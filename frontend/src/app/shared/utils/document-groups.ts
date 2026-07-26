import { DocumentSummary } from '../../core/models/models';

export interface DocGroup {
  batchId: string;
  documents: DocumentSummary[];
  isBulk: boolean;
}

/// Files uploaded together share a DocumentSummary.uploadBatchId - grouping by it
/// turns a bulk upload back into one entry instead of N unrelated-looking rows.
/// Assumes `documents` is already ordered (most-recent-first, per the API) and
/// preserves that order at the group level.
export function groupByUploadBatch(documents: DocumentSummary[]): DocGroup[] {
  const order: string[] = [];
  const byBatch = new Map<string, DocumentSummary[]>();
  for (const doc of documents) {
    if (!byBatch.has(doc.uploadBatchId)) {
      byBatch.set(doc.uploadBatchId, []);
      order.push(doc.uploadBatchId);
    }
    byBatch.get(doc.uploadBatchId)!.push(doc);
  }
  return order.map(batchId => {
    const docs = byBatch.get(batchId)!;
    return { batchId, documents: docs, isBulk: docs.length > 1 };
  });
}

export function totalPages(group: DocGroup): number {
  return group.documents.reduce((sum, d) => sum + d.pageCount, 0);
}

export function totalSize(group: DocGroup): number {
  return group.documents.reduce((sum, d) => sum + d.fileSizeBytes, 0);
}

export function fileNames(group: DocGroup): string {
  return group.documents.map(d => d.originalFileName).join(', ');
}

export function groupStatusLabel(group: DocGroup): string {
  const statuses = new Set(group.documents.map(d => d.status));
  if (statuses.size === 1) return group.documents[0].status;
  const failedCount = group.documents.filter(d => d.status === 'Failed').length;
  return failedCount > 0 ? `${failedCount} of ${group.documents.length} failed` : 'Mixed';
}

export function groupStatusClass(group: DocGroup): string {
  const statuses = new Set(group.documents.map(d => d.status));
  return statuses.size === 1 ? group.documents[0].status.toLowerCase() : 'mixed';
}
