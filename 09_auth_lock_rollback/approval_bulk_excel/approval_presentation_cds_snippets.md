# Approval Presentation CDS Merge Snippets

Repo hien tai khong co full source cua `ZI_APRVL_REQUEST`, `ZI_APRVL_ITEM`,
`ZC_APRVL_REQUEST`, `ZC_APRVL_ITEM`, `ZSD_TBL_CONFIG` hoac BDEF. Merge cac
snippet duoi day vao object that trong ADT, khong replace full object neu dang
co logic teammate.

## Consumption view fields

Them 6 virtual elements nay vao ca entity consumption can hien approval request
va approval item, toi thieu la `ZC_APRVL_REQUEST` va `ZC_APRVL_ITEM`.

```abap
@ObjectModel.virtualElement: true
@ObjectModel.virtualElementCalculatedBy: 'ABAP:ZCL_APRVL_PRESENTATION'
virtual ActionText : abap.char(10),

@ObjectModel.virtualElement: true
@ObjectModel.virtualElementCalculatedBy: 'ABAP:ZCL_APRVL_PRESENTATION'
virtual RecordKeyText : abap.string,

@ObjectModel.virtualElement: true
@ObjectModel.virtualElementCalculatedBy: 'ABAP:ZCL_APRVL_PRESENTATION'
virtual NewDataText : abap.string,

@ObjectModel.virtualElement: true
@ObjectModel.virtualElementCalculatedBy: 'ABAP:ZCL_APRVL_PRESENTATION'
virtual OldDataText : abap.string,

@ObjectModel.virtualElement: true
@ObjectModel.virtualElementCalculatedBy: 'ABAP:ZCL_APRVL_PRESENTATION'
virtual ChangedFieldsText : abap.string,

@ObjectModel.virtualElement: true
@ObjectModel.virtualElementCalculatedBy: 'ABAP:ZCL_APRVL_PRESENTATION'
virtual ChangeSummary : abap.string,
```

Khong dung:

```abap
NewData as NewDataText,
OldData as OldDataText,
RecordKey as RecordKeyText,
```

## ZC_APRVL_ITEM key/order reminder

Trong `ZC_APRVL_ITEM`, key phai nam dau projection:

```abap
key AprvlId,
key ItemNo,
...
_AprvlRequest : redirected to parent ZC_APRVL_REQUEST
```

## Service definition

Dam bao `ZSD_TBL_CONFIG` expose du:

```abap
expose ZC_APRVL_REQUEST as AprvlRequests;
expose ZC_APRVL_ITEM    as AprvlItems;
```

## Activation order

1. `ZCL_APRVL_PRESENTATION`
2. `ZC_APRVL_REQUEST`
3. `ZC_APRVL_ITEM`
4. `ZSD_TBL_CONFIG`
5. Publish service binding
6. Refresh `$metadata`

Sau publish, `$metadata` cua entity request/item phai co:

- `ActionText`
- `RecordKeyText`
- `NewDataText`
- `OldDataText`
- `ChangedFieldsText`
- `ChangeSummary`
