# Z-MAINT Fiori Elements Project Guide

## 1. Project nay la gi?

Repo nay la monorepo cho nhieu SAP Fiori Elements UI5 app cua phan quan tri Z-MAINT.

Tat ca app FE dung chung SAP RAP OData V4 service:

```text
/sap/opu/odata4/sap/zsb_tbl_config/srvd/sap/zsd_tbl_config/0001/
```

Backend RAP/CDS la source of truth cho entity, field, action, behavior, validation va authorization.
Frontend Fiori Elements chi khai bao app, route, tile intent va UI annotation de render List Report/Object Page.

## 2. Cau truc source code

```text
apps/
  table-config/
    webapp/
      manifest.json
      Component.js
      annotations/
        table-config.xml
        field-config.xml

  approval-request/
    webapp/
      manifest.json
      Component.js
      annotations/
        approval-request.xml

  audit-log/
    webapp/
      manifest.json
      Component.js
      annotations/
        audit-log.xml

ui5.yaml
ui5-approval.yaml
ui5-audit.yaml

ui5-deploy.yaml
ui5-deploy-approval.yaml
ui5-deploy-audit.yaml

package.json
```

Quy tac chinh:

- `apps/table-config` la app rieng cho Table Config va Field Config.
- `apps/approval-request` la app rieng cho Approval Inbox.
- `apps/audit-log` la app rieng cho Audit Log.
- Moi app co `manifest.json` rieng, component id rieng, deploy BSP rieng va FLP tile rieng.

## 3. Vi sao tach app?

Voi Fiori Elements, cach sach nhat cho case nay la:

```text
1 FLP tile = 1 FE app/component = 1 root business flow
```

Table Config va Field Config nen o chung mot app vi `FieldConfig` la child/composition cua `TableConfig`.

Approval Request khong phai child cua Table Config. No la nghiep vu rieng: approver xem request va approve/reject. Vi vay Approval nen la mot app rieng de tranh route/context bi lech khi Fiori Elements tao Object Page.

Audit Log cung la nghiep vu doc/read-only rieng, nen tach app rieng.

## 4. App hien tai

### Table & Field Configuration

Path:

```text
apps/table-config/webapp
```

Component id:

```text
ztbl.config.ui
```

Entity chinh:

```text
/TableConfig
```

Annotation:

```text
apps/table-config/webapp/annotations/table-config.xml
apps/table-config/webapp/annotations/field-config.xml
```

FLP intent:

```text
#ZTableConfig-manage
```

ABAP BSP app:

```text
ZZTBL_CONFIG_UI
```

### Approval Inbox

Path:

```text
apps/approval-request/webapp
```

Component id:

```text
ztbl.approval.ui
```

Entity chinh:

```text
/ApprovalRequest
```

Annotation:

```text
apps/approval-request/webapp/annotations/approval-request.xml
```

FLP intent:

```text
#ZApprovalRequest-manage
```

ABAP BSP app:

```text
ZZTBL_APRVL_UI
```

### Audit Log

Path:

```text
apps/audit-log/webapp
```

Component id:

```text
ztbl.audit.ui
```

Entity chinh:

```text
/AuditLog
```

Annotation:

```text
apps/audit-log/webapp/annotations/audit-log.xml
```

FLP intent:

```text
#ZAuditLog-display
```

ABAP BSP app:

```text
ZZTBL_AUDIT_UI
```

### Authorization Management

Path:

```text
apps/authorization-management/webapp
```

Component id:

```text
ztbl.authorization.ui
```

FLP intent:

```text
#ZAuthorizationManagement-manage
```

ABAP BSP app:

```text
ZZTBL_AUTH_UI
```

## 5. Cach chay local

Table Config:

```powershell
npm run start:table
```

Approval Inbox:

```powershell
npm run start:approval
```

Audit Log:

```powershell
npm run start:audit
```

Authorization Management:

```powershell
npm run start:authorization
```

Neu can login backend local, dang nhap bang SAP user/password khi browser hoi.

## 6. Cach build

```powershell
npm run build:table
npm run build:approval
npm run build:audit
npm run build:authorization
npm run build:all
```

Build output:

```text
dist/table-config
dist/approval-request
dist/audit-log
dist/authorization-management
```

## 7. Cach deploy

Set credential:

```powershell
$env:SAP_USER="your_sap_user"
$env:SAP_PASSWORD="your_sap_password"
```

Deploy Table Config:

```powershell
npm run build:deploy
```

Deploy Approval:

```powershell
npm run build:deploy:approval
```

Deploy Audit:

```powershell
npm run build:deploy:audit
```

Deploy Authorization:

```powershell
npm run build:deploy:authorization
```

## 8. FLP target mapping

Table Config:

```text
Semantic Object: ZTableConfig
Action: manage
Application Type: SAPUI5 Fiori App
URL: /sap/bc/ui5_ui5/sap/zztbl_config_ui
ID / Component ID: ztbl.config.ui
```

Approval:

```text
Semantic Object: ZApprovalRequest
Action: manage
Application Type: SAPUI5 Fiori App
URL: /sap/bc/ui5_ui5/sap/zztbl_aprvl_ui
ID / Component ID: ztbl.approval.ui
```

Audit:

```text
Semantic Object: ZAuditLog
Action: display
Application Type: SAPUI5 Fiori App
URL: /sap/bc/ui5_ui5/sap/zztbl_audit_ui
ID / Component ID: ztbl.audit.ui
```

Authorization:

```text
Semantic Object: ZAuthorizationManagement
Action: manage
Application Type: SAPUI5 Fiori App
URL: /sap/bc/ui5_ui5/sap/zztbl_auth_ui
ID / Component ID: ztbl.authorization.ui
```

## 9. Nhiem vu thanh vien 2

Thanh vien 2 lam tiep trong:

```text
apps/approval-request/webapp/annotations/approval-request.xml
apps/audit-log/webapp/annotations/audit-log.xml
```

Approval can tap trung:

- List Report danh sach request cho duyet.
- Filter theo status, table name, submitted by, submitted at.
- Object Page xem chi tiet request.
- FieldGroup hien thi old/new JSON.
- Action approve/reject lay tu RAP action backend.

Audit can tap trung:

- List Report read-only.
- Filter theo table name, user, thoi gian, action type.
- Table hien thi old value, new value, field name, record key, changed by, changed at.
- Object Page detail neu can xem day du noi dung.

## 10. Luu y quan trong

- Khong tao root page moi trong cung mot FE component neu no la nghiep vu/tile doc lap.
- Chi giu chung entity trong mot app khi no la child/navigation cua flow do.
- `Path="TableName"` trong annotation chi la binding path, data that van den tu OData service.
- Link BSP truc tiep khong phai cach test chuan. Test/deploy nen di qua FLP tile/intent.
- Sau khi tao/chinh tile, neu tile chua hien thi, chay cache invalidation:

```text
/UI2/INVALIDATE_GLOBAL_CACHES
/UI2/INVALIDATE_CLIENT_CACHES
```
