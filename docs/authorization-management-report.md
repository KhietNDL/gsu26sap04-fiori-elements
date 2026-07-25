# Authorization Management App Report

## 1. Overview

Authorization Management is a SAP Fiori Elements and SAPUI5 module for managing user access configuration.

The application area contains three functional modules:

- Users
- User Permissions
- Table Permissions

The goal of the app is to provide a single, cohesive authorization management experience while preserving the existing backend service, entity sets, CRUD behavior, and dynamic capability logic.

## 2. Technical Scope

The implementation is located under:

```text
apps/authorization-management
```

The app uses OData V2 through the service:

```text
/sap/opu/odata/sap/ZSB_AUTH_ADMIN_V2/
```

The following business behavior is preserved:

- OData service URL
- Entity names
- List Report and Object Page route structure
- CRUD behavior
- `Update_mc` and `Delete_mc` capability logic
- `X` / blank persistence for permission flags
- Backend authorization and validation

## 3. Application Structure

The Authorization Management area is composed of a lightweight shell and three independent Fiori Elements applications.

### Shell App

```text
apps/authorization-management/webapp
```

Main files:

- `Component.js`
- `manifest.json`
- `index.html`
- `css/authorization.css`

The shell is responsible for:

- Showing the shared product header
- Showing compact module navigation
- Loading the selected child Fiori Elements module
- Preventing invalid cross-module navigation while inside detail pages

### Users Module

```text
apps/authorization-management/webapp/users
```

Main entity set:

```text
AuthUsers
```

Main purpose:

- Manage users
- Maintain role
- Maintain active status

### User Permissions Module

```text
apps/authorization-management/webapp/user-permissions
```

Main entity set:

```text
UserPermissions
```

Main purpose:

- Assign table-level permissions to users
- Maintain View, Create, Update, Delete, and Upload permissions

### Table Permissions Module

```text
apps/authorization-management/webapp/table-permissions
```

Main entity set:

```text
TablePermissions
```

Main purpose:

- Maintain default permission settings per table
- Maintain View, Create, Update, Delete, and Upload permissions

## 4. UI Design

The app uses a compact shared header to make the three modules feel like one product.

Header content:

```text
Authorization Management
Manage users, assignments, and table-level permissions.
```

Navigation:

```text
Users | User Permissions | Table Permissions
```

The navigation uses a standard SAPUI5 `sap.m.SegmentedButton` with standard SAP icons.

Design goals:

- Compact layout
- Clear active module state
- No truncated labels
- Consistent spacing
- Responsive behavior on smaller screens
- Minimal custom CSS

## 5. Navigation Behavior

The current app keeps the three Fiori Elements modules independent but displays them under one Authorization Management wrapper.

The selected module is controlled by the `area` URL parameter:

```text
area=users
area=user-permissions
area=table-permissions
```

Example:

```text
...#ZAuthorizationManagement-manage&/
```

The shell loads the corresponding child component based on the selected area.

## 6. Detail Page Navigation Protection

A navigation issue existed when the user entered a detail page and then clicked another module in the shared header.

Example risk:

```text
Table Permissions detail
-> click User Permissions
-> old TablePermissions(...) route remains in the hash
-> User Permissions router receives an invalid route
-> Target was not found
```

To prevent this, the shell now detects Object Page routes such as:

```text
AuthUsers(...)
UserPermissions(...)
TablePermissions(...)
```

When the user is inside a detail page:

- Only the current module remains visible in the header navigation
- The other two module navigation items are hidden
- The user must return to the List Report before switching modules

When the user returns to the List Report:

- All three module navigation items become visible again

This keeps navigation simple and avoids cross-module route leakage.

## 7. Users List Report

The Users List Report displays:

- User Name
- Role
- Status

The active flag is displayed as a readable status instead of a raw technical value.

Status display:

- `X` -> Active
- blank -> Inactive

The existing filters, columns, Create/Delete actions, table settings, and initial loading behavior are preserved.

## 8. Users Object Page

The Users Object Page is structured around general user information.

Section:

```text
General Information
```

Fields:

- User Name
- Role
- Status

Display mode focuses on readable text/status presentation.

Edit mode preserves the existing behavior:

- User Name remains immutable
- Role remains editable according to existing FE behavior
- Status uses the existing `X` / blank binding logic

## 9. User Permissions List Report

The User Permissions List Report displays:

- User Name
- Table Name
- View
- Create
- Update
- Delete
- Upload

Permission flags are shown consistently:

- `X` -> Enabled
- blank -> Disabled

The list uses `ObjectStatus` presentation for clear visual feedback.

## 10. User Permissions Object Page

The User Permissions Object Page is divided into two sections.

### Assignment

Fields:

- User Name
- Table Name

### Permissions

Fields:

- View
- Create
- Update
- Delete
- Upload

Display mode shows clear Enabled/Disabled values.

Edit mode keeps the existing checkbox behavior:

- Checked -> `X`
- Unchecked -> blank

Persistence logic is unchanged.

## 11. Table Permissions Object Page

The Table Permissions Object Page follows the same visual pattern as User Permissions.

### Table Information

Fields:

- Table Name

### Default Permissions

Fields:

- View
- Create
- Update
- Delete
- Upload

The consistent structure helps users understand that User Permissions and Table Permissions use the same permission model at different levels. Table Permissions define table-level defaults for active users with `RoleType = USER`; active admins keep full access and are not restricted by these flags.

## 12. Permission UX

The backend capability fields are respected:

```text
Update_mc
Delete_mc
```

These fields are not replaced by frontend role checks.

The UI improves clarity by adding explanatory tooltips where update capability disables editable controls.

Example:

```text
You do not have permission to update this record.
```

The existing backend-controlled edit and delete behavior remains the source of truth.

## 13. Responsive Behavior

The shared navigation is designed to remain usable on smaller screens.

Responsive handling:

- The module navigation uses available width
- Labels are not intentionally truncated
- Horizontal overflow is allowed on small screens when needed
- Object Page forms continue using Fiori Elements responsive layouts
- Tables retain existing ResponsiveTable behavior

## 14. Validation

The following validation commands were run:

```bash
node --check apps/authorization-management/webapp/Component.js
npm run build:authorization
```

Result:

```text
Build succeeded
```

The UI5 build completed successfully using SAPUI5 `1.108.33`.

## 15. Runtime Test Scenarios

Recommended manual test scenarios:

1. Open Authorization Management from FLP sandbox.
2. Verify Users List Report loads.
3. Switch to User Permissions from the header.
4. Switch to Table Permissions from the header.
5. Open a Table Permissions detail page.
6. Confirm only Table Permissions remains visible in the header navigation.
7. Go back to the Table Permissions List Report.
8. Confirm Users and User Permissions become visible again.
9. Repeat the same detail/list test for Users and User Permissions.
10. Verify edit mode still preserves existing checkbox and save behavior.
11. Verify disabled update behavior still follows `Update_mc`.
12. Verify disabled delete behavior still follows `Delete_mc`.

## 16. Key Files

Shell:

```text
apps/authorization-management/webapp/Component.js
apps/authorization-management/webapp/manifest.json
apps/authorization-management/webapp/css/authorization.css
```

Users:

```text
apps/authorization-management/webapp/users/manifest.json
apps/authorization-management/webapp/users/annotations/users.xml
```

User Permissions:

```text
apps/authorization-management/webapp/user-permissions/manifest.json
apps/authorization-management/webapp/user-permissions/annotations/user-permissions.xml
```

Table Permissions:

```text
apps/authorization-management/webapp/table-permissions/manifest.json
apps/authorization-management/webapp/table-permissions/annotations/table-permissions.xml
```

Shared UI extensions:

```text
apps/authorization-management/webapp/ext/formatter/AuthorizationFormatter.js
apps/authorization-management/webapp/ext/fragment/ActiveStatusCell.fragment.xml
apps/authorization-management/webapp/ext/fragment/ActiveStatusColumn.fragment.xml
apps/authorization-management/webapp/ext/fragment/ActiveStatusSection.fragment.xml
apps/authorization-management/webapp/ext/fragment/UserPermissionStatusCells.fragment.xml
apps/authorization-management/webapp/ext/fragment/UserPermissionStatusColumns.fragment.xml
apps/authorization-management/webapp/ext/fragment/UserPermissionFlagsSection.fragment.xml
apps/authorization-management/webapp/ext/type/StringFlag.js
```

## 17. Conclusion

Authorization Management now presents the three authorization modules as one cohesive Fiori-style product while keeping each Fiori Elements application independent.

The UI polish improves:

- Header consistency
- Module navigation clarity
- Status readability
- Permission explanation
- Detail page navigation safety
- Responsive behavior

Business functionality, backend service behavior, entity sets, CRUD behavior, and authorization logic remain unchanged.
