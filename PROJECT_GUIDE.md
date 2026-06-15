# Z-MAINT Fiori Elements Project Guide

## 1. Project này là gì?

Đây là một SAP Fiori Elements UI5 application dùng cho phần quản trị của hệ thống Z-MAINT.

App này không tự tạo dữ liệu. App đọc dữ liệu và metadata từ SAP RAP OData V4 service:

```text
/sap/opu/odata4/sap/zsb_tbl_config/srvd/sap/zsd_tbl_config/0001/
```

Backend RAP/CDS là nơi định nghĩa "thân cây":

- Entity: `TableConfig`, `FieldConfig`, `ApprovalRequest`, `AuditLog`
- Field: `TableName`, `Description`, `ActiveFlag`, ...
- Navigation: `_FieldConfig`
- Actions: `approve`, `reject`, ...
- Behavior, authorization, validation, draft

Fiori Elements app này là lớp frontend hiển thị:

- `manifest.json` khai báo app, service, tile/intent, route, page template
- `webapp/annotations/*.xml` khai báo UI layout cho từng entity/page
- Fiori Elements tự sinh List Report/Object Page và tự bind data dựa trên metadata + annotation

## 2. Luồng hoạt động

Luồng tổng quát:

```text
SAP RAP/CDS
  -> OData V4 metadata + data
  -> manifest.json trỏ tới service
  -> annotations XML mô tả UI
  -> sap.fe.templates render List Report/Object Page
  -> FLP tile mở app bằng intent
```

Ví dụ màn Table Config:

```text
manifest.json:
  contextPath = /TableConfig

table-config.xml:
  Target = SAP.TableConfigType
  Path = TableName, Description, ApprovalRequired, ActiveFlag

Fiori Elements:
  tạo table columns
  gọi backend /TableConfig
  bind data vào table
```

`Path="TableName"` trong annotation không chứa data. Nó chỉ nói với Fiori Elements rằng cell/field này lấy dữ liệu từ property `TableName` trong JSON backend trả về.

## 3. Cấu trúc source code chính

```text
webapp/
  manifest.json
  Component.js
  index.html
  i18n/
    i18n.properties
    i18n_en.properties
  annotations/
    table-config.xml
    field-config.xml
    approval-request.xml
    audit-log.xml
    README.md

ui5.yaml
ui5-deploy.yaml
package.json
```

### `webapp/manifest.json`

File trung tâm của Fiori Elements app.

Nhiệm vụ:

- Khai báo OData service `mainService`
- Khai báo annotation files được load
- Khai báo FLP inbound/tile intent
- Khai báo routes và targets
- Chọn template `sap.fe.templates.ListReport` hoặc `sap.fe.templates.ObjectPage`

Hiện tại app có intent:

```text
#ZTableConfig-manage
```

### `webapp/annotations/table-config.xml`

UI annotation cho:

```text
SAP.TableConfigType
```

Đang quản lý:

- List Report columns
- Filter fields
- Object Page header
- Object Page facets
- General Information section
- Field Configuration child section

### `webapp/annotations/field-config.xml`

UI annotation cho:

```text
SAP.FieldConfigType
```

Đang quản lý child table/detail của Field Configuration.

### `webapp/annotations/approval-request.xml`

Placeholder cho màn Approval Inbox.

Target backend tương ứng:

```text
SAP.ApprovalRequestType
```

Hiện file này chưa được load trong `manifest.json`.

### `webapp/annotations/audit-log.xml`

Placeholder cho màn Audit Log Viewer.

Target backend tương ứng:

```text
SAP.AuditLogType
```

Hiện file này chưa được load trong `manifest.json`.

## 4. Cách chạy local

Fiori Elements cần FLP shell/navigation service. Vì vậy không mở trực tiếp `index.html`.

Chạy bằng FLP sandbox:

```powershell
$env:FIORI_TOOLS_USER="your_sap_user"
$env:FIORI_TOOLS_PASSWORD="your_sap_password"
npm run start:flp
```

URL local đúng:

```text
http://localhost:8080/test/flpSandbox.html?sap-client=324#ZTableConfig-manage
```

`ui5.yaml` có proxy để forward request local `/sap/...` tới backend:

```yaml
backend:
  - path: /sap
    url: https://s40lp1.ucc.cit.tum.de
    client: '324'
```

## 5. Cách deploy

Set credential:

```powershell
$env:SAP_USER="your_sap_user"
$env:SAP_PASSWORD="your_sap_password"
```

Build và deploy:

```powershell
npm run build:deploy
```

App deploy lên ABAP repository với tên:

```text
ZZTBL_CONFIG_UI
```

FLP target mapping:

```text
Semantic Object: ZTableConfig
Action: manage
Application Type: SAPUI5 Fiori App
Title: Table Config
URL: /sap/bc/ui5_ui5/sap/zztbl_config_ui
ID / Component ID: ztbl.config.ui
```

Intent:

```text
#ZTableConfig-manage
```

Lưu ý: link BSP deploy trực tiếp như `/sap/bc/ui5_ui5/sap/zztbl_config_ui/index.html` không phải cách chạy chuẩn. App cần chạy qua FLP tile/intent.

## 6. Lưu ý về deploy placeholder files

Trong `ui5-deploy.yaml`, các file placeholder chưa dùng đang bị exclude:

```yaml
- /annotations/approval-request.xml
- /annotations/audit-log.xml
- /annotations/README.md
```

Lý do: ABAP app index có thể fail nếu upload annotation XML placeholder chưa có annotation thật.

Khi `approval-request.xml` hoặc `audit-log.xml` đã có annotation thật và được khai báo trong `manifest.json`, hãy bỏ file đó khỏi danh sách exclude.

## 7. Nhiệm vụ thành viên 2

Thành viên 2 phụ trách 2 màn:

```text
Approval Inbox
Audit Log Viewer
```

### 7.1. Màn Approval Inbox

File chính:

```text
webapp/annotations/approval-request.xml
```

Backend target:

```text
SAP.ApprovalRequestType
```

Mục tiêu UI:

- List Report danh sách phiếu chờ duyệt
- Filter theo status, table name, submitted by, submitted date
- Object Page hiển thị chi tiết request
- Hiển thị dữ liệu cũ/mới ở mức tĩnh
- Có action `Approve`
- Có action `Reject`, nếu backend yêu cầu thì reject cần remarks/comment

Việc cần làm:

1. Viết annotation thật trong `approval-request.xml`:
   - `UI.HeaderInfo`
   - `UI.SelectionFields`
   - `UI.LineItem`
   - `UI.Facets`
   - `UI.Identification`
2. Cập nhật `manifest.json`:
   - Add annotation data source `approvalRequestAnnotation`
   - Add vào `mainService.settings.annotations`
   - Add inbound tile intent, ví dụ `ZApprovalRequest-manage`
   - Add List Report target cho `/ApprovalRequest`
   - Add Object Page target nếu cần detail
3. Cập nhật `i18n.properties` và `i18n_en.properties` cho title/subtitle/labels nếu dùng text bundle.
4. Bỏ `/annotations/approval-request.xml` khỏi exclude trong `ui5-deploy.yaml`.
5. Test local bằng FLP sandbox.
6. Deploy và tạo FLP tile/target mapping.

Gợi ý intent:

```text
#ZApprovalRequest-manage
```

### 7.2. Màn Audit Log Viewer

File chính:

```text
webapp/annotations/audit-log.xml
```

Backend target:

```text
SAP.AuditLogType
```

Mục tiêu UI:

- List Report read-only
- Filter theo table name, changed by, changed at, action type
- Table hiển thị old value, new value, field name, record key, changed by, changed at
- Có Object Page detail nếu cần xem đầy đủ old/new value

Việc cần làm:

1. Viết annotation thật trong `audit-log.xml`:
   - `UI.HeaderInfo`
   - `UI.SelectionFields`
   - `UI.LineItem`
   - `UI.Identification`
   - `UI.Facets` nếu có Object Page
2. Cập nhật `manifest.json`:
   - Add annotation data source `auditLogAnnotation`
   - Add vào `mainService.settings.annotations`
   - Add inbound tile intent, ví dụ `ZAuditLog-display`
   - Add List Report target cho `/AuditLog`
   - Add Object Page target nếu cần detail
3. Cập nhật `i18n.properties` và `i18n_en.properties`.
4. Bỏ `/annotations/audit-log.xml` khỏi exclude trong `ui5-deploy.yaml`.
5. Test local bằng FLP sandbox.
6. Deploy và tạo FLP tile/target mapping.

Gợi ý intent:

```text
#ZAuditLog-display
```

## 8. Quy tắc làm việc

- Backend RAP/CDS là source of truth cho entity, field, action, behavior.
- Frontend annotation chỉ được dùng để mô tả cách hiển thị UI.
- Không viết `Path` tới field không tồn tại trong OData metadata.
- Không add placeholder annotation vào `manifest.json`.
- Mỗi màn/entity nên có annotation file riêng.
- Mỗi khi thêm màn mới phải kiểm tra cả:
  - annotation XML
  - `manifest.json`
  - `i18n`
  - `ui5-deploy.yaml`
  - FLP tile/target mapping

## 9. Commands thường dùng

```powershell
npm run start:flp
npm run build
npm run deploy
npm run build:deploy
```

Sau deploy hoặc chỉnh FLP, nếu tile chưa hiện:

```text
/UI2/INVALIDATE_GLOBAL_CACHES
/UI2/INVALIDATE_CLIENT_CACHES
```
