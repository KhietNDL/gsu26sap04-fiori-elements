# FE API Guide: Auth, Permission, Lock, Rollback

Base URL ví dụ:

```text
/sap/opu/odata4/sap/{SERVICE_BINDING}/srvd/sap/{SERVICE_DEFINITION}/0001
```

Với service hiện tại:

```text
Table Config:
/sap/opu/odata4/sap/zsb_tbl_config/srvd/sap/zsd_tbl_config/0001

Auth Admin:
/sap/opu/odata4/sap/zsb_auth_admin/srvd/sap/zsd_auth_admin/0001
```

Các request `POST/PATCH/DELETE/action` cần CSRF token như OData V4 bình thường.

## 1. Auth / User

Service:

```text
GET {AUTH_BASE}/AuthUsers
```

Entity chính:

```text
AuthUsers
UserPermissions
TablePermissions
```

User fields:

```json
{
  "Username": "DEV-253",
  "RoleType": "ADMIN",
  "ActiveFlag": "X"
}
```

FE nên dùng `AuthUsers` để biết user hiện tại là `ADMIN` hay `USER`.

Rule ưu tiên:

```text
ADMIN + ActiveFlag = X -> full quyền
USER  + ActiveFlag = X -> quyền theo UserPermissions và TablePermissions
ActiveFlag rỗng       -> không có quyền
```

`TablePermissions` chỉ có tác dụng với `USER`. Không dùng `TablePermissions` để giới hạn `ADMIN` đang active.

Ví dụ đọc user hiện tại:

```http
GET {AUTH_BASE}/AuthUsers('DEV-253')
```

## 2. Permission theo table

### User permission

```http
GET {AUTH_BASE}/UserPermissions(Username='DEV-253',TableName='Z251_SCHEDULE')
```

Response fields:

```json
{
  "Username": "DEV-253",
  "TableName": "Z251_SCHEDULE",
  "CanView": "X",
  "CanCreate": "X",
  "CanUpdate": "X",
  "CanDelete": "X",
  "CanUpload": "X"
}
```

FE mapping:

```text
CanView   -> cho load Table Data, Audit Log, Field Schema liên quan table
CanCreate -> enable Create/Add Row
CanUpdate -> enable Edit/Save update
CanDelete -> enable Delete
CanUpload -> enable Excel upload/import
```

Nếu field rỗng hoặc không có row permission thì coi như không có quyền.

Rule này chỉ áp dụng cho user có `RoleType = USER`. Nếu user hiện tại là `ADMIN` và `ActiveFlag = X`, FE phải coi như có đủ `CanView`, `CanCreate`, `CanUpdate`, `CanDelete`, `CanUpload`.

### Table permission default

```http
GET {AUTH_BASE}/TablePermissions('Z251_SCHEDULE')
```

`TablePermissions` là policy/default theo table cho `USER`. FE có thể dùng để render config/admin screen hoặc tính quyền mặc định cho user thường, nhưng không được dùng nó để chặn `ADMIN` đang active. Quyền thực thi cuối cùng vẫn do BE check.

## 3. CRUD action payload rule

Bound actions nằm trên `TableConfig`.

Action namespace:

```text
com.sap.gateway.srvd.zsd_tbl_config.v0001
```

Ví dụ action URL:

```http
POST {TABLE_BASE}/TableConfig(ConfigUuid={uuid},IsActiveEntity=true)/com.sap.gateway.srvd.zsd_tbl_config.v0001.updateRecord
```

Payload single record:

```json
{
  "table_name": "Z253_CAT",
  "record_key": "",
  "record_data": "{\"CATEGORY_ID\":\"C004\",\"CATEGORY_NAME\":\"1\",\"DESCRIPTION\":\"1\",\"STATUS\":\"1\"}",
  "records_data": "",
  "etag_field": "",
  "etag_value": ""
}
```

Payload bulk records:

```json
{
  "table_name": "Z253_CAT",
  "record_key": "",
  "record_data": "",
  "records_data": "[{\"CATEGORY_ID\":\"C002\",\"CATEGORY_NAME\":\"Soft Skillsss\",\"DESCRIPTION\":\"Soft skills courses\",\"STATUS\":\"Active\"},{\"CATEGORY_ID\":\"C003\",\"CATEGORY_NAME\":\"1s\",\"DESCRIPTION\":\"2\",\"STATUS\":\"3\"}]",
  "etag_field": "",
  "etag_value": ""
}
```

Quan trọng:

- FE nên luôn gửi đủ cả `record_data` và `records_data`.
- Single thì `record_data` có JSON, `records_data` là chuỗi rỗng.
- Bulk thì `records_data` có JSON array, `record_data` là chuỗi rỗng.
- Không bỏ hẳn `records_data`, nếu metadata BE chưa optional sẽ bị lỗi `No value for mandatory parameter 'records_data' specified`.

## 4. Lock API

Lock là UI/session lock để tránh nhiều người sửa cùng table/record cùng lúc.

Actions:

```text
acquireLock
heartbeat
releaseLock
forceUnlock
```

URL mẫu:

```http
POST {TABLE_BASE}/TableConfig(ConfigUuid={uuid},IsActiveEntity=true)/com.sap.gateway.srvd.zsd_tbl_config.v0001.acquireLock
```

Payload:

```json
{
  "session_id": "6f2b0c3d4e5f67890123456789abcdef",
  "lock_scope": "RECORD",
  "record_key": "{\"SCHEDULE_ID\":\"SCH010\"}",
  "lock_reason": "EDIT",
  "ttl_seconds": 120
}
```

Response:

```json
{
  "table_name": "Z251_SCHEDULE",
  "session_id": "6f2b0c3d4e5f67890123456789abcdef",
  "success": "X",
  "message": "Lock acquired",
  "locked_by": "DEV-253",
  "expires_at": "2026-07-16T08:00:00Z"
}
```

FE flow đề xuất:

1. Khi user vào edit mode: gọi `acquireLock`.
2. Nếu `success` rỗng/false: disable edit và show `message`.
3. Khi đang edit: gọi `heartbeat` định kỳ trước khi TTL hết hạn.
4. Khi Save/Cancel/leave page: gọi `releaseLock`.
5. `forceUnlock` chỉ dành cho admin có quyền force unlock.

`record_key` phải là JSON key của dòng, ví dụ:

```json
{"SCHEDULE_ID":"SCH010"}
```

Nếu lock cả table thì dùng `lock_scope` theo BE config và `record_key` rỗng.

## 5. Pending approval lock

Đây là business lock, khác với UI/session lock.

Nếu một record đang có approval request `PENDING`, user khác không được tạo request mới cho đúng record đó.

FE không cần tự enforce bằng logic riêng; BE đã check khi gọi:

```text
createRecord
updateRecord
deleteRecord
confirmImport
```

Khi BE trả lỗi kiểu:

```text
Record đang chờ duyệt bởi DEV-253. Không thể tạo request mới.
```

FE nên:

- show message từ BE;
- giữ các dòng không conflict nếu BE trả partial result;
- không retry cùng record cho tới khi request được approve/reject.

Với Excel/bulk:

- Dòng bị pending sẽ bị skip/error theo response preview.
- Dòng không pending vẫn được gửi approve bình thường.

## 6. Rollback API

Rollback là action trên `AuditLog`.

Chỉ admin có quyền rollback mới được gọi.

URL mẫu:

```http
POST {TABLE_BASE}/AuditLog(AuditId={audit_id})/com.sap.gateway.srvd.zsd_tbl_config.v0001.rollback
```

Payload:

```json
{}
```

Response:

```json
{
  "table_name": "Z253_CAT",
  "success": "X",
  "message": "Rollback completed"
}
```

FE flow:

1. Load audit logs:

```http
GET {TABLE_BASE}/AuditLog?$filter=TableName eq 'Z253_CAT'
```

2. User chọn một audit row.
3. Nếu user là admin, enable nút Rollback.
4. Gọi action `rollback`.
5. Refresh lại:
   - Table Data
   - AuditLog

Audit log cũ không bị xóa sau rollback. BE sẽ tạo thêm audit action `R` để giữ lịch sử rollback.

Lưu ý:

- Rollback update/delete cần audit row có full `OldValue`.
- Rollback create cần audit row có full `NewValue`.
- Các audit log cũ được tạo trước khi BE lưu full snapshot có thể không rollback đủ data.

## 7. Approve / Reject API

Approval request nằm trong service `ZSD_TBL_CONFIG`.

Entity:

```text
ApprovalRequest
ApprovalItem
```

Approve:

```http
POST {TABLE_BASE}/ApprovalRequest(AprvlId={aprvl_id},IsActiveEntity=true)/com.sap.gateway.srvd.zsd_tbl_config.v0001.approve
```

Payload:

```json
{
  "remarks": "OK"
}
```

Reject:

```http
POST {TABLE_BASE}/ApprovalRequest(AprvlId={aprvl_id},IsActiveEntity=true)/com.sap.gateway.srvd.zsd_tbl_config.v0001.reject
```

Payload:

```json
{
  "remarks": "Invalid data"
}
```

Sau approve/reject:

- refresh `ApprovalRequest`;
- refresh `ApprovalItem`;
- refresh Table Data nếu approve thành công;
- refresh AuditLog nếu approve tạo thay đổi thật.

## 8. Bulk / Excel approval flow

Bulk ở FE nên hiểu là một approval request đại diện cho nhiều dòng thay đổi.

### Submit bulk create/update/delete

Với action CRUD trên `TableConfig`, FE gửi nhiều record qua `records_data`:

```json
{
  "table_name": "Z253_CAT",
  "record_key": "",
  "record_data": "",
  "records_data": "[{\"CATEGORY_ID\":\"C002\",\"CATEGORY_NAME\":\"Soft Skillsss\"},{\"CATEGORY_ID\":\"C003\",\"CATEGORY_NAME\":\"1s\"}]",
  "etag_field": "",
  "etag_value": ""
}
```

Rule FE:

- `records_data` luôn là JSON string của array object.
- `record_data` để chuỗi rỗng khi submit bulk.
- Không stringify từng dòng riêng lẻ; chỉ stringify cả array một lần.
- Không tự tách bulk thành nhiều approval request nếu user đang thao tác một lần import/save bulk.

Nếu BE trả partial result:

- dòng thành công: giữ trạng thái submitted/pending;
- dòng lỗi: show lỗi theo dòng;
- dòng bị pending approval lock: show message BE và không retry tự động.

### Nhận diện bulk request trong Approval Inbox

FE có thể coi request là bulk khi `RecordKey` hoặc field presentation tương ứng có giá trị:

```text
BULK
```

Với request bulk, object page nên hiển thị section item-level để reviewer thấy từng dòng trong file/import.

Entity liên quan:

```text
ApprovalItem
```

Nếu service expose navigation từ request sang item, ưu tiên bind qua navigation đó. Nếu cần query trực tiếp, filter theo approval id:

```http
GET {TABLE_BASE}/ApprovalItem?$filter=AprvlId eq {aprvl_id}
```

Mỗi item nên render tối thiểu:

```text
Line/row number
ActionType
RecordKey
OldData
NewData
Status/message nếu có
```

Với non-bulk request, ẩn section `ApprovalItem` để object page không bị rối.

### Approve / reject bulk

FE vẫn gọi action trên `ApprovalRequest`, không approve từng `ApprovalItem` riêng lẻ:

```http
POST {TABLE_BASE}/ApprovalRequest(AprvlId={aprvl_id},IsActiveEntity=true)/com.sap.gateway.srvd.zsd_tbl_config.v0001.approve
```

```json
{
  "remarks": "OK"
}
```

Reject cũng tương tự action `reject`.

Sau approve bulk:

- refresh `ApprovalRequest`;
- refresh `ApprovalItem`;
- refresh table data của `TableName`;
- refresh `AuditLog`;
- nếu BE trả item-level error, giữ request/item response để reviewer thấy dòng nào fail.

FE không nên tự apply dữ liệu bulk vào table trước khi approve thành công. Table data chỉ refresh sau response approve thành công từ BE.

## 9. FE error handling chung

BE thường trả lỗi trong OData error response:

```json
{
  "error": {
    "message": "..."
  }
}
```

FE nên ưu tiên lấy message theo thứ tự:

```text
error.message
error.details[0].message
response.statusText
```

Các lỗi cần show nguyên message BE:

```text
Không có quyền VIEW/CREATE/UPDATE/DELETE/UPLOAD
Record đang chờ duyệt bởi ...
Action ... chỉ dành cho ADMIN
ADMIN ... chưa được cấp quyền ROLLBACK/FORCE_UNLOCK
No value for mandatory parameter ...
```
