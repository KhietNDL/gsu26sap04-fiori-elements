# Approval Bulk Excel Rebuild Guide

Muc tieu: keo lai phan approval cho Excel bulk theo dung thu tu, tranh loi active/CDS/service.

Luon active theo thu tu tu tren xuong. Neu object da co san trong ADT thi mo object do, paste full code tu file tuong ung, roi `Ctrl+F3`.

## 1. DDIC

### 1.1 Tao bang item

Object type: **ABAP Dictionary -> Database Table**

Object name: `ZTBL_APRVL_ITEM`

Paste code:

- `09_auth_lock_rollback/approval_bulk_excel/ztbl_aprvl_item.tabl.asddls`

Active xong moi lam tiep.

Bang nay luu tung dong con trong 1 approval bulk request:

- `APRVL_ID`: request cha trong `ZTBL_APRVL`
- `ITEM_NO`: so thu tu item
- `ACTION_TYPE`: `C/U/D`
- `RECORD_KEY`
- `NEW_DATA`
- `OLD_DATA`
- `STATUS`
- `MESSAGE`

## 2. Backend Classes

### 2.1 Bulk approval service

Object: `ZCL_EXCEL_BULK_APRVL`

Paste code:

- `09_auth_lock_rollback/approval_bulk_excel/zcl_excel_bulk_aprvl.clas.abap`

Cong dung:

- Tao 1 request cha trong `ZTBL_APRVL`
- Tao nhieu item con trong `ZTBL_APRVL_ITEM`
- Approve tung item con khi admin bam Approve
- Ho tro `C`, `U`, `D`

### 2.2 Excel approval bridge

Object: `ZCL_EXCEL_APRVL_BRIDGE`

Paste code:

- `09_auth_lock_rollback/approval_bulk_excel/zcl_excel_aprvl_bridge.clas.abap`

Cong dung:

- Nhan diff Excel tu committer
- Gom thanh item list
- Submit 1 bulk request thay vi tao nhieu request le
- Neu `__ACTION = D/DELETE` thi tao item action `D`

### 2.3 Approval presentation helper

BE phai co helper class hoac SADL virtual element calculator de parse JSON
thanh text nghiep vu. Khong duoc chi copy:

```abap
NewData as NewDataText,
OldData as OldDataText
```

Helper phai tao du 6 field:

| Field | Ket qua |
|---|---|
| `ActionText` | `Create`, `Update`, `Delete` |
| `RecordKeyText` | Key da parse thanh label/value |
| `NewDataText` | `NewData` JSON da parse |
| `OldDataText` | `OldData` JSON da parse |
| `ChangedFieldsText` | Danh sach business field thay doi |
| `ChangeSummary` | Tom tat thay doi nghiep vu |

Quy tac xu ly:

- Map action hien tai `C/U/D` thanh `Create/Update/Delete`.
- Neu he thong dung `01/02/03`, map tuong ung
  `01 = Create`, `02 = Update`, `03 = Delete`.
- JSON key/value hien theo format `Field Label: Value`, moi field mot dong.
- Ten field `PRODUCT_CATEGORY` phai thanh `Product Category`.
- `STATUS`: `A = Active`, `I = Inactive`, `B = Blocked`.
- Bo cac technical field khoi presentation:
  `CLIENT`, `MANDT`, `CREATED_BY`, `CREATED_AT`, `LAST_CHANGED_AT`,
  `LOCAL_LAST_CHANGED_AT` va cac system field tuong tu.
- Create: `ChangedFieldsText` lay cac business field co trong `NewData`.
- Update: so sanh `OldData` va `NewData`, chi lay field that su thay doi.
- Delete: `ChangedFieldsText = Deleted record`.
- Null/empty co the bo qua; phai xu ly nhat quan giua Old/New.
- Nested object flatten theo format `Parent.Child: Value`; array noi bang dau phay.
- JSON loi khong duoc lam dump service; tra text rong hoac fallback an toan.

Format `ChangeSummary`:

```text
Create:
Created record with fields: Product Category, Description, Status

Update:
Description: ABC -> TAM
Status: Active -> Inactive

Delete:
Deleted record: Entity ID: 8B95F36A4F271FD19BE21C1245B44E3F
```

Raw fields `RecordKey`, `NewData`, `OldData` van phai giu nguyen cho
technical/debug.

## 3. Approval Behavior Implementation

Object: `ZBP_APRVL_REQUEST`, tab **Local Types / Local Implementation**

Paste full code:

- `09_auth_lock_rollback/approval_bulk_excel/zbp_aprvl_request.clas.locals_imp.full.abap`

Cong dung:

- Nut `Approve` goi `ZCL_EXCEL_BULK_APRVL=>APPROVE_BULK` khi request la `BULK`
- Nut `Reject` reject ca request bulk
- CRUD approval cu van giu logic cu

Neu dang co code teammate moi trong file nay, chi replace khi ban da backup/copy lai code hien tai.

## 4. CDS Interface Views

### 4.1 Approval request root

Object: `ZI_APRVL_REQUEST`

Paste code:

- `09_auth_lock_rollback/approval_bulk_excel/zi_aprvl_request.ddls.asddls`

### 4.2 Approval item child

Object: `ZI_APRVL_ITEM`

Paste code:

- `09_auth_lock_rollback/approval_bulk_excel/zi_aprvl_item.ddls.asddls`

Luu y:

- `ZI_APRVL_ITEM` phai co association to parent `ZI_APRVL_REQUEST`
- Key phai dung thu tu: `AprvlId`, `ItemNo`

## 5. CDS Consumption Views

### 5.1 Approval request consumption

Object: `ZC_APRVL_REQUEST`

Paste code:

- `09_auth_lock_rollback/approval_bulk_excel/zc_aprvl_request.ddls.asddls`

Cong dung:

- Hien list approval request
- Hien object page request
- Hien facet `Excel Approval Items`

### 5.2 Approval item consumption

Object: `ZC_APRVL_ITEM`

Paste code:

- `09_auth_lock_rollback/approval_bulk_excel/zc_aprvl_item.ddls.asddls`

Cong dung:

- Hien item list trong object page
- Expose raw fields `RecordKey`, `NewData`, `OldData` cho technical/debug
- Expose 6 presentation fields:
  `ActionText`, `RecordKeyText`, `NewDataText`, `OldDataText`,
  `ChangedFieldsText`, `ChangeSummary`
- UI chinh dung presentation fields, khong dung raw JSON
- Bam vao item `>` se co object page item detail

Neu dung virtual element, moi presentation field phai tro toi SADL calculator,
vi du:

```abap
@ObjectModel.virtualElementCalculatedBy: 'ABAP:<PRESENTATION_CLASS>'
virtual ActionText : abap.char(10),
```

Khong khai bao presentation field bang alias truc tiep cua raw JSON.

Luu y neu gap loi:

- `Key must be contiguous and start at the first position`
  - Dam bao `key AprvlId`, `key ItemNo` nam dau projection.
- `To parent association ... must point to target entity ZC_APRVL_REQUEST`
  - Dam bao association la:
    `_AprvlRequest : redirected to parent ZC_APRVL_REQUEST`

## 6. Behavior Definitions

### 6.1 Interface BDEF

Object: `ZI_APRVL_REQUEST`

Paste code:

- `09_auth_lock_rollback/approval_bulk_excel/zi_aprvl_request.bdef.asbdef`

### 6.2 Consumption BDEF

Object: `ZC_APRVL_REQUEST`

Paste code:

- `09_auth_lock_rollback/approval_bulk_excel/zc_aprvl_request.bdef.asbdef`

Luu y:

- Strict mode dung `strict ( 2 );`
- Neu co child item read-only thi khong can create/update/delete cho item.

## 7. Service Definition

Object: `ZSD_TBL_CONFIG`

Paste/merge service expose:

- `09_auth_lock_rollback/approval_bulk_excel/zsd_tbl_config.srvd.srvdsrv`

Can expose:

```abap
expose ZC_APRVL_REQUEST as AprvlRequests;
expose ZC_APRVL_ITEM    as AprvlItems;
```

Sau do active service definition.

Kiem tra `$metadata` cua entity set `AprvlItems` co du:

```text
ActionText
RecordKeyText
NewDataText
OldDataText
ChangedFieldsText
ChangeSummary
```

## 8. Service Binding / Fiori Refresh

Trong ADT:

1. Mo service binding dang dung cho Fiori approval.
2. Bam **Publish** lai neu can.
3. Bam **Preview** hoac refresh app.
4. Neu UI van cu:
   - Hard refresh browser
   - Hoac them query:
     `?sap-ui-xx-viewCache=false`

## 9. Test Excel Bulk Approval

### 9.1 Tao request bulk create/update

1. Vao app Dynamic Table Maintenance.
2. Chon table co `approval_required = X`, vi du `Z251_SCHEDULE`.
3. Download Data Excel.
4. Sua 2-3 dong:
   - sua mot dong cu -> `U`
   - them dong moi -> `C`
5. Upload.
6. Review diff.
7. Confirm Import.

Ket qua dung:

- Chi tao 1 request trong approval list.
- `Record Key = BULK`
- `New Data (JSON) = Excel bulk approval: n item(s)`
- Tab `Excel Approval Items` co nhieu dong con.
- Item create hien `ActionText = Create`.
- `RecordKeyText` hien `Entity ID: ...`, khong hien raw JSON.
- `NewDataText` hien moi business field tren mot dong.
- `ChangedFieldsText` liet ke cac business field cua record moi.
- `ChangeSummary` bat dau bang `Created record with fields:`.

### 9.2 Test bulk delete bang `__ACTION`

1. Download Data Excel moi.
2. O cot `__ACTION`, dien `D` hoac `DELETE` tai dong can xoa.
3. Giu nguyen key column cua dong do.
4. Upload.
5. Review diff phai hien status `DELETE`.
6. Confirm Import.
7. Vao Approval.

Ket qua dung:

- Request cha van la `BULK`.
- Item con co `Action = D`.
- `Old Data (JSON)` co data cu.
- `New Data (JSON)` rong.
- `ActionText = Delete`.
- `ChangedFieldsText = Deleted record`.
- `ChangeSummary = Deleted record: <RecordKeyText>`.
- Approve xong row bi xoa khoi table nghiep vu.

### 9.3 Test presentation cho update

Tao mot update co:

```json
OldData: {"DESCRIPTION":"ABC","STATUS":"A","CLIENT":"100"}
NewData: {"DESCRIPTION":"TAM","STATUS":"I","CLIENT":"100"}
```

Ket qua dung:

```text
ActionText: Update
OldDataText:
Description: ABC
Status: Active

NewDataText:
Description: TAM
Status: Inactive

ChangedFieldsText: Description, Status
ChangeSummary:
Description: ABC -> TAM
Status: Active -> Inactive
```

`CLIENT` khong duoc hien va khong duoc tinh la field thay doi.

## 10. Expected Business Rules

- 1 lan upload Excel chi tao 1 approval request cha.
- Moi row thay doi tao 1 item con.
- Approve request cha se approve/execute tat ca item con.
- Neu 1 item loi, item do status `ERROR`; request cha khong nen duoc coi la approve thanh cong hoan toan.
- `D/DELETE` chi chay khi user dien ro trong cot `__ACTION`.
- Khong tu dong xoa cac dong bi thieu trong file Excel.

## 11. Quick Troubleshooting

### Khong thay tab Excel Approval Items

Kiem tra:

- `ZC_APRVL_REQUEST` co facet target `_Items`
- `ZSD_TBL_CONFIG` expose `ZC_APRVL_ITEM`
- Service binding da publish/refresh

### Bam vao item `>` bi blank

Kiem tra `ZC_APRVL_ITEM` co:

```abap
@UI.headerInfo
@UI.facet
@UI.identification
```

### Presentation field van hien raw JSON

Kiem tra:

- Logic helper/virtual element co parse JSON that su hay chi alias raw field.
- `NewDataText` va `OldDataText` khong duoc gan truc tiep tu
  `NewData`/`OldData`.
- SADL calculator co request du original fields:
  `ActionType`, `RecordKey`, `NewData`, `OldData`.
- Service binding da publish lai va metadata cache da refresh.

### Khong thay presentation fields trong metadata

Kiem tra `ZC_APRVL_ITEM` co:

```abap
ActionText,
RecordKeyText,
NewDataText,
OldDataText,
ChangedFieldsText,
ChangeSummary
```

Sau do active lai consumption view, service definition va publish service
binding.

### Approve bao syntax/runtime

Vao ST22 xem short dump. Thuong loi nam o:

- `ZBP_APRVL_REQUEST`
- `ZCL_EXCEL_BULK_APRVL`
- Type mismatch `record_key`
- `strict ( 2 )` / authorization master missing trong BDEF

## 12. Checklist Done

- [ ] `ZTBL_APRVL_ITEM` active
- [ ] `ZCL_EXCEL_BULK_APRVL` active
- [ ] `ZCL_EXCEL_APRVL_BRIDGE` active
- [ ] Helper class / SADL virtual element calculator parse JSON active
- [ ] `ZBP_APRVL_REQUEST` local implementation active
- [ ] `ZI_APRVL_REQUEST` active
- [ ] `ZI_APRVL_ITEM` active
- [ ] `ZC_APRVL_REQUEST` active
- [ ] `ZC_APRVL_ITEM` active
- [ ] `ZI_APRVL_REQUEST.bdef` active
- [ ] `ZC_APRVL_REQUEST.bdef` active
- [ ] `ZSD_TBL_CONFIG` active
- [ ] Service binding published/refreshed
- [ ] `$metadata` co du 6 presentation fields
- [ ] Raw JSON van duoc expose cho technical/debug
- [ ] Create presentation tested
- [ ] Update chi hien field that su thay doi
- [ ] Delete hien `Deleted record`
- [ ] Status `A/I/B` map thanh `Active/Inactive/Blocked`
- [ ] Technical fields khong xuat hien trong presentation
- [ ] Bulk create/update tested
- [ ] Bulk delete with `__ACTION = D` tested
