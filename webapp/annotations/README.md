# Annotation Structure

This app keeps one Fiori Elements application and separates UI annotations by business area.

- `table-config.xml`: List Report and Object Page annotations for `SAP.TableConfigType`.
- `field-config.xml`: Child table/detail annotations for `SAP.FieldConfigType`.
- `approval-request.xml`: Placeholder for the future Approval Request tile/page. Target `SAP.ApprovalRequestType`.
- `audit-log.xml`: Placeholder for the future Audit Log tile/page. Target `SAP.AuditLogType`.

When adding a new page, update both:

1. `webapp/manifest.json`: add the FLP inbound, route, target, and annotation data source.
2. The matching annotation file: add `UI.HeaderInfo`, `UI.SelectionFields`, `UI.LineItem`, `UI.Facets`, and `UI.Identification` as needed.

Do not reference placeholder annotation files in `manifest.json`. ABAP app index validation can fail during deploy if a manifest-loaded annotation file is structurally present but has no real annotations.

Keep one entity or closely related child entity per file where possible. This keeps the ownership clear when multiple developers work on the same Fiori Elements app.
