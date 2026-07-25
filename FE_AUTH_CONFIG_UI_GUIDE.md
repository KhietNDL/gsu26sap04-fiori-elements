# FE Integration — Auth Dropdown và Config Authorization

## 1. Thay đổi backend hiện tại

Backend đã bổ sung:

- `RoleType` sử dụng value help, chỉ có:
  - `ADMIN`
  - `USER`
- `ActiveFlag` dùng cùng quy ước với các bảng khác:
  - `X` — active
  - Rỗng — inactive
- Chỉ ADMIN được tạo, sửa và xóa:
  - Table Config
  - Field Config
- User thường vẫn được đọc Table Config và Field Config để ứng dụng lấy metadata.
- User inactive không được đọc config.
- `TablePermissions` chỉ áp dụng cho `USER`.
- `ADMIN` có `ActiveFlag = X` luôn có full quyền, không bị giới hạn bởi `TablePermissions`.
- Chỉ ADMIN được đọc và chỉnh sửa:
  - User Master
  - User Permissions
  - Table Permissions
  - Approval Request/Approval Item
- Backend vẫn kiểm tra authorization dù FE gọi API trực tiếp hoặc người dùng tự nhập URL.

## 2. Service Auth Admin

Base URL:

```text
/sap/opu/odata4/sap/zsb_auth_admin_v2/srvd/sap/zsd_auth_admin/0001
```

Các entity set:

```text
AuthUsers
UserPermissions
TablePermissions
RoleTypeVH
```

## 3. Dropdown Role

Fiori Elements phải tự đọc value help từ metadata của `AuthUsers.RoleType`.

Nếu FE là custom SAPUI5, lấy danh sách bằng:

```http
GET {AUTH_BASE_URL}/RoleTypeVH?$select=RoleType,RoleText
```

Ví dụ response:

```json
{
  "value": [
    {
      "RoleType": "ADMIN",
      "RoleText": "Administrator"
    },
    {
      "RoleType": "USER",
      "RoleText": "User"
    }
  ]
}
```

Binding:

- Key lưu xuống backend: `RoleType`
- Text hiển thị: `RoleText`
- Không cho phép nhập free text.

## 4. Active Flag

`ActiveFlag` không dùng value help riêng.

FE sử dụng cùng quy ước với các cờ Yes/No khác trong project:

- Checked/active: gửi `"X"`
- Unchecked/inactive: gửi `""`

Nếu dùng checkbox hoặc switch:

```javascript
const activeFlag = control.getSelected() ? "X" : "";
```

Không gửi các chuỗi `"Active"`, `"Inactive"`, `"Yes"`, `"No"`, `true` hoặc `false`.

## 5. Xác định ADMIN trên FE

FE cần lấy SAP username hiện tại từ shell/session, sau đó gọi:

```http
GET {AUTH_BASE_URL}/AuthUsers
  ?$filter=Username eq '{CURRENT_USERNAME}'
  &$select=Username,RoleType,ActiveFlag
```

Kết luận:

```javascript
const user = response.value?.[0];
const isAdmin =
  user?.RoleType === "ADMIN" &&
  user?.ActiveFlag === "X";
```

Nếu `isAdmin === true`, FE phải coi user có full quyền cho các thao tác nghiệp vụ và config. Không đọc `TablePermissions` để disable hoặc hide action của admin active.

Với user thường, backend sẽ không trả dữ liệu từ entity admin. Khi response rỗng:

```javascript
isAdmin = false;
```

Không lấy role từ local storage, URL parameter hoặc giá trị do người dùng nhập.

## 6. Ẩn nút Config trên FE

Các nút sau chỉ render khi `isAdmin === true`:

- Create Table Config
- Edit Table Config
- Delete Table Config
- Create Field Config
- Edit Field Config
- Delete Field Config
- Activate/Save draft config

Ví dụ:

```javascript
createButton.setVisible(isAdmin);
editButton.setVisible(isAdmin);
deleteButton.setVisible(isAdmin);
```

Nếu dùng formatter:

```javascript
isAdminVisible(roleType, activeFlag) {
  return roleType === "ADMIN" && activeFlag === "X";
}
```

Việc ẩn nút chỉ giúp UX. Không được bỏ kiểm tra lỗi `403/unauthorized`, vì backend mới là lớp bảo mật chính.

## 7. Table Config API

Base URL:

```text
/sap/opu/odata4/sap/zsb_tbl_config/srvd/sap/zsd_tbl_config/0001
```

User active vẫn được:

```http
GET {TABLE_CONFIG_BASE_URL}/TableConfig
GET {TABLE_CONFIG_BASE_URL}/FieldConfig
```

User thường không được:

```http
POST   {TABLE_CONFIG_BASE_URL}/TableConfig
PATCH  {TABLE_CONFIG_BASE_URL}/TableConfig(...)
DELETE {TABLE_CONFIG_BASE_URL}/TableConfig(...)
```

FE phải xử lý response unauthorized và refresh lại dữ liệu nếu request thất bại.

Đối với các app nghiệp vụ, rule áp quyền theo table là:

```text
ADMIN active -> full quyền
USER active  -> theo UserPermissions/TablePermissions
Inactive     -> không có quyền
```

## 8. Ma trận kiểm thử

| Trường hợp | ADMIN active | USER active | User inactive |
|---|---:|---:|---:|
| Xem Table Config | Có | Có | Không |
| Xem Field Config | Có | Có | Không |
| Tạo/sửa/xóa Table Config | Có | Không | Không |
| Tạo/sửa/xóa Field Config | Có | Không | Không |
| Xem User Permissions | Có | Không | Không |
| Xem Approval Inbox | Có | Không | Không |
| CRUD dữ liệu nghiệp vụ | Full quyền, bỏ qua `TablePermissions` | Theo `UserPermissions`/`TablePermissions` | Không |
| Upload Excel | Full quyền, bỏ qua `CanUpload` table perm | Theo `CanUpload` | Không |
| Rollback/Force Unlock | Có | Không | Không |

## 9. Sau khi backend được activate

1. Activate Role value-help CDS.
2. Activate `ZI_AUTH_USER`.
3. Activate `ZI_TBL_CONFIG`, `ZI_FLD_CONFIG` và behavior liên quan.
4. Activate `ZSD_AUTH_ADMIN` và `ZSD_TBL_CONFIG`.
5. Publish lại service binding nếu metadata chưa cập nhật.
6. Xóa cache metadata hoặc hard refresh ứng dụng FE.
