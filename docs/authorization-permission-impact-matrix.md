# Authorization Permission Impact Matrix

## Purpose

This document is used to track and validate the impact of permissions configured in the Authorization Management app on custom-designed UI applications.

The main concern is:

> When an admin changes authorization settings, end users should not see broken UI, technical errors, invalid buttons, empty screens without explanation, or failed actions without a clear message.

This file can be used as a checklist, testing matrix, and defect tracking reference.

## Permission Model

The Authorization Management app controls permission flags such as:

- `CanView`
- `CanCreate`
- `CanUpdate`
- `CanDelete`
- `CanUpload`

The backend also exposes capability control fields:

- `Update_mc`
- `Delete_mc`

Permission values:

| Stored Value | Meaning |
|---|---|
| `X` | Enabled / Allowed |
| blank | Disabled / Denied |

## Core UX Rule

Custom UI apps must never expose permission changes as technical failures.

Use these UI responses instead:

| Situation | Bad UX | Expected UX |
|---|---|---|
| User cannot view data | Blank page, OData error, table stuck loading | Access Denied state |
| User cannot create | Create button works then fails | Disable or hide Create with explanation |
| User cannot update | Edit button works then save fails | Disable Edit or make fields read-only with explanation |
| User cannot delete | Delete button works then backend error | Disable Delete with explanation |
| User cannot upload | Upload opens then fails | Disable Upload with explanation |
| No matching data | Looks like permission denied | Empty state message |
| Backend/network error | Raw technical error only | Friendly error with technical details available |

## Standard Messages

### Access Denied

```text
Access Denied
You do not have permission to view this data.
Please contact your administrator if you need access.
```

Vietnamese:

```text
Không có quyền truy cập
Bạn không có quyền xem dữ liệu này.
Vui lòng liên hệ quản trị viên nếu bạn cần quyền truy cập.
```

### Update Denied

```text
You do not have permission to update this record.
```

Vietnamese:

```text
Bạn không có quyền cập nhật bản ghi này.
```

### Delete Denied

```text
You do not have permission to delete this record.
```

Vietnamese:

```text
Bạn không có quyền xóa bản ghi này.
```

### Upload Denied

```text
You do not have permission to upload data.
```

Vietnamese:

```text
Bạn không có quyền tải dữ liệu lên.
```

### Empty Data

```text
No data found for the current filters.
```

Vietnamese:

```text
Không có dữ liệu phù hợp với bộ lọc hiện tại.
```

### Technical Error

```text
Unable to load data. Please try again.
```

Vietnamese:

```text
Không thể tải dữ liệu. Vui lòng thử lại.
```

## Permission Impact Summary

Use this table to list every custom-designed screen affected by authorization settings.

| App | Screen | Table / Entity | CanView | CanCreate | CanUpdate | CanDelete | CanUpload | Expected UI Behavior | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| Example Custom App | List Page | ZTABLE_NAME | X | X | X | X | X | Full access | Not Tested | Replace example |
| Example Custom App | List Page | ZTABLE_NAME | blank | X | X | X | X | Show Access Denied | Not Tested | View denied must not show blank page |
| Example Custom App | Detail Page | ZTABLE_NAME | X | blank | blank | blank | blank | Read-only mode; Create/Edit/Delete disabled | Not Tested | User should understand why actions are disabled |

## Detailed Test Matrix

### 1. View Permission

| Test ID | Permission Setup | User Action | Expected Result | Actual Result | Pass/Fail | Defect Link |
|---|---|---|---|---|---|---|
| VIEW-01 | `CanView = X` | Open list page | Data loads normally |  |  |  |
| VIEW-02 | `CanView = blank` | Open list page | Access Denied page/state appears |  |  |  |
| VIEW-03 | `CanView = blank` | Refresh page | Access Denied remains stable, no technical error |  |  |  |
| VIEW-04 | `CanView = blank` | Open deep link to detail | Access Denied or safe redirect, no broken UI |  |  |  |

### 2. Create Permission

| Test ID | Permission Setup | User Action | Expected Result | Actual Result | Pass/Fail | Defect Link |
|---|---|---|---|---|---|---|
| CREATE-01 | `CanCreate = X` | Click Create | Create flow opens normally |  |  |  |
| CREATE-02 | `CanCreate = blank` | Open list page | Create is disabled/hidden with explanation |  |  |  |
| CREATE-03 | `CanCreate = blank` | Try direct create route/action | Blocked safely, no broken UI |  |  |  |

### 3. Update Permission

| Test ID | Permission Setup | User Action | Expected Result | Actual Result | Pass/Fail | Defect Link |
|---|---|---|---|---|---|---|
| UPDATE-01 | `CanUpdate = X` / `Update_mc = true` | Click Edit | Edit mode opens normally |  |  |  |
| UPDATE-02 | `CanUpdate = blank` / `Update_mc = false` | Open detail page | Edit disabled or fields read-only |  |  |  |
| UPDATE-03 | `CanUpdate = blank` / `Update_mc = false` | Hover disabled Edit | Tooltip explains missing update permission |  |  |  |
| UPDATE-04 | `CanUpdate = blank` / `Update_mc = false` | Attempt direct update/save | Blocked safely, backend message handled cleanly |  |  |  |

### 4. Delete Permission

| Test ID | Permission Setup | User Action | Expected Result | Actual Result | Pass/Fail | Defect Link |
|---|---|---|---|---|---|---|
| DELETE-01 | `CanDelete = X` / `Delete_mc = true` | Click Delete | Delete confirmation appears |  |  |  |
| DELETE-02 | `CanDelete = blank` / `Delete_mc = false` | Open list/detail page | Delete disabled/hidden with explanation |  |  |  |
| DELETE-03 | `CanDelete = blank` / `Delete_mc = false` | Attempt direct delete | Blocked safely, no raw technical failure |  |  |  |

### 5. Upload Permission

| Test ID | Permission Setup | User Action | Expected Result | Actual Result | Pass/Fail | Defect Link |
|---|---|---|---|---|---|---|
| UPLOAD-01 | `CanUpload = X` | Click Upload | Upload flow opens normally |  |  |  |
| UPLOAD-02 | `CanUpload = blank` | Open page | Upload disabled/hidden with explanation |  |  |  |
| UPLOAD-03 | `CanUpload = blank` | Attempt direct upload | Blocked safely, no broken dialog/page |  |  |  |

## Combined Permission Scenarios

Use this section to test realistic permission combinations. Permission flags apply to active users with `RoleType = USER`; active admins bypass these table permission flags.

| Scenario ID | CanView | CanCreate | CanUpdate | CanDelete | CanUpload | Expected User Experience | Pass/Fail | Notes |
|---|---|---|---|---|---|---|---|---|
| ADMIN-ACTIVE | blank | blank | blank | blank | blank | Admin can view and perform all actions |  | `RoleType = ADMIN` and `ActiveFlag = X` ignores table permissions |
| FULL-ACCESS | X | X | X | X | X | User can view and perform all actions |  |  |
| READ-ONLY | X | blank | blank | blank | blank | User can view data only; all actions disabled/hidden with explanation |  |  |
| NO-VIEW | blank | X | X | X | X | Access Denied; no action buttons should be usable |  | View denial overrides other permissions |
| CREATE-ONLY | X | X | blank | blank | blank | User can view and create, but cannot edit/delete/upload |  |  |
| MAINTAIN-NO-DELETE | X | X | X | blank | X | User can maintain data but cannot delete |  |  |
| UPLOAD-ONLY-ACTION | X | blank | blank | blank | X | User can view and upload, but cannot create/edit/delete records manually |  |  |

## UI Risk Register

| Risk ID | Risk | Example Symptom | Prevention | Status |
|---|---|---|---|---|
| RISK-01 | View denied displays technical OData error | User sees 403/raw backend message | Catch authorization errors and show Access Denied | Open |
| RISK-02 | Action button remains enabled without permission | User clicks Edit/Delete then error appears | Bind action visibility/enabled state to permission/capability | Open |
| RISK-03 | Empty data confused with no permission | Table shows empty but user is denied | Separate Empty State from Access Denied State | Open |
| RISK-04 | Deep link opens broken detail page | User opens bookmark without permission | Validate permission on route entry | Open |
| RISK-05 | Permission changed while user session is open | UI still shows old buttons | Refresh permission model after save/login/navigation | Open |
| RISK-06 | Custom header navigation breaks detail route | `Target was not found` | Hide/disable module navigation in detail pages | Mitigated in Authorization Management |
| RISK-07 | Backend denies save after UI allowed edit | Save fails unexpectedly | Handle backend error clearly and refresh capability state | Open |

## Statistics Template

Use this table to summarize test coverage and defects.

| Area | Total Screens | Tested Screens | Passed | Failed | Not Tested | Critical Defects | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| View Permission |  |  |  |  |  |  |  |
| Create Permission |  |  |  |  |  |  |  |
| Update Permission |  |  |  |  |  |  |  |
| Delete Permission |  |  |  |  |  |  |  |
| Upload Permission |  |  |  |  |  |  |  |
| Deep Links |  |  |  |  |  |  |  |
| Refresh / Reload |  |  |  |  |  |  |  |
| Mobile / Responsive |  |  |  |  |  |  |  |

## Recommended Implementation Rules For Custom Design Apps

1. Check `RoleType` and `ActiveFlag` before applying table permission flags.
2. If `RoleType = ADMIN` and `ActiveFlag = X`, allow full access and ignore `TablePermissions`.
3. For active `USER`, always check `CanView` before rendering sensitive data.
4. For active `USER`, if `CanView` is denied, show Access Denied instead of an empty table.
5. For active `USER`, disable or hide Create when `CanCreate` is denied.
6. For active `USER`, disable Edit or render read-only fields when `CanUpdate` or `Update_mc` is denied.
7. For active `USER`, disable Delete when `CanDelete` or `Delete_mc` is denied.
8. For active `USER`, disable Upload when `CanUpload` is denied.
9. Add tooltips or helper messages for disabled actions.
10. Do not expose raw backend authorization errors to end users.
11. Treat direct URL/deep-link access as a separate test case.
12. Refresh permission state after permission changes where technically possible.

## Manual Review Checklist

Before releasing authorization changes, verify each affected custom-designed app:

- [ ] List page with full access
- [ ] List page with view denied
- [ ] Detail page with view denied
- [ ] Create button with create denied
- [ ] Edit button with update denied
- [ ] Delete button with delete denied
- [ ] Upload button with upload denied
- [ ] Browser refresh on list page
- [ ] Browser refresh on detail page
- [ ] Deep link to detail page
- [ ] Permission changed while user is already logged in
- [ ] Mobile or narrow screen behavior
- [ ] Backend error message remains available for support/debugging
- [ ] End user sees business-friendly messages

## Final Acceptance Criteria

Authorization settings are considered safe for custom-designed UI apps when:

- No user sees `Target was not found` due to authorization navigation.
- No user sees raw 403/OData authorization errors as the main screen.
- Denied actions are disabled/hidden with clear explanation.
- View-denied screens show Access Denied.
- Empty data and no permission are visually different.
- Deep links and refresh do not break the UI.
- Permission changes do not cause stale buttons to perform invalid actions.
