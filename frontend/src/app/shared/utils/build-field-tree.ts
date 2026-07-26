import { ExtractedFieldEdit } from '../../core/models/models';

/// Builds the same section-grouped shape the backend's JSON export produces, computed
/// client-side from whatever is currently loaded/edited on screen - so the "preview JSON"
/// view always reflects in-progress edits, not a stale server snapshot.
export function buildFieldTree(fileName: string, fields: ExtractedFieldEdit[]) {
  const order: string[] = [];
  const byLabel = new Map<string, ExtractedFieldEdit[]>();
  for (const field of [...fields].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const label = field.sectionLabel || 'General';
    if (!byLabel.has(label)) { byLabel.set(label, []); order.push(label); }
    byLabel.get(label)!.push(field);
  }

  return {
    fileName,
    sections: order.map(name => ({
      name,
      fields: byLabel.get(name)!.map(f => ({
        fieldKey: f.fieldKey,
        value: f.fieldValue,
        semanticType: f.semanticType,
        originalFieldKey: f.originalFieldKey,
        wasEditedByUser: f.wasEditedByUser,
        includeInExport: f.includeInExport,
        pageNumber: f.pageNumber
      }))
    }))
  };
}
