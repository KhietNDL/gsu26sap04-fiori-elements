CLASS zcl_aprvl_presentation DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_sadl_exit_calc_element_read.

    CLASS-METHODS action_text
      IMPORTING iv_action TYPE string
      RETURNING VALUE(rv_text) TYPE string.

    CLASS-METHODS record_key_text
      IMPORTING iv_record_key TYPE string
      RETURNING VALUE(rv_text) TYPE string.

    CLASS-METHODS data_text
      IMPORTING iv_json TYPE string
      RETURNING VALUE(rv_text) TYPE string.

    CLASS-METHODS changed_fields_text
      IMPORTING
        iv_action   TYPE string
        iv_old_data TYPE string
        iv_new_data TYPE string
      RETURNING VALUE(rv_text) TYPE string.

    CLASS-METHODS change_summary
      IMPORTING
        iv_action     TYPE string
        iv_record_key TYPE string
        iv_old_data   TYPE string
        iv_new_data   TYPE string
      RETURNING VALUE(rv_text) TYPE string.

  PRIVATE SECTION.
    TYPES:
      BEGIN OF ty_pair,
        name  TYPE string,
        value TYPE string,
      END OF ty_pair,
      tt_pair TYPE STANDARD TABLE OF ty_pair WITH EMPTY KEY.

    CLASS-DATA gt_technical_fields TYPE HASHED TABLE OF string WITH UNIQUE KEY table_line.

    CLASS-METHODS class_constructor.

    CLASS-METHODS json_to_pairs
      IMPORTING
        iv_json   TYPE string
        iv_prefix TYPE string OPTIONAL
      RETURNING VALUE(rt_pairs) TYPE tt_pair.

    CLASS-METHODS flatten_data
      IMPORTING
        ir_data   TYPE REF TO data
        iv_prefix TYPE string OPTIONAL
      CHANGING
        ct_pairs  TYPE tt_pair.

    CLASS-METHODS is_technical_field
      IMPORTING iv_name TYPE string
      RETURNING VALUE(rv_result) TYPE abap_bool.

    CLASS-METHODS field_label
      IMPORTING iv_name TYPE string
      RETURNING VALUE(rv_label) TYPE string.

    CLASS-METHODS field_value
      IMPORTING
        iv_name  TYPE string
        iv_value TYPE string
      RETURNING VALUE(rv_value) TYPE string.

    CLASS-METHODS business_pairs
      IMPORTING it_pairs TYPE tt_pair
      RETURNING VALUE(rt_pairs) TYPE tt_pair.

    CLASS-METHODS pairs_to_text
      IMPORTING it_pairs TYPE tt_pair
      RETURNING VALUE(rv_text) TYPE string.

    CLASS-METHODS pair_value
      IMPORTING
        it_pairs TYPE tt_pair
        iv_name  TYPE string
      RETURNING VALUE(rv_value) TYPE string.
ENDCLASS.

CLASS zcl_aprvl_presentation IMPLEMENTATION.
  METHOD class_constructor.
    gt_technical_fields = VALUE #(
      ( `CLIENT` )
      ( `MANDT` )
      ( `CREATED_BY` )
      ( `CREATED_AT` )
      ( `CHANGED_BY` )
      ( `CHANGED_AT` )
      ( `LAST_CHANGED_AT` )
      ( `LOCAL_LAST_CHANGED_AT` )
      ( `LOCAL_CREATED_BY` )
      ( `LOCAL_CREATED_AT` )
    ).
  ENDMETHOD.

  METHOD action_text.
    DATA(lv_action) = to_upper( condense( iv_action ) ).

    rv_text = SWITCH #( lv_action
      WHEN `C`      THEN `Create`
      WHEN `CREATE` THEN `Create`
      WHEN `01`     THEN `Create`
      WHEN `U`      THEN `Update`
      WHEN `UPDATE` THEN `Update`
      WHEN `02`     THEN `Update`
      WHEN `D`      THEN `Delete`
      WHEN `DELETE` THEN `Delete`
      WHEN `03`     THEN `Delete`
      ELSE iv_action ).
  ENDMETHOD.

  METHOD record_key_text.
    IF iv_record_key IS INITIAL.
      RETURN.
    ENDIF.

    IF to_upper( condense( iv_record_key ) ) = `BULK`.
      rv_text = `BULK`.
      RETURN.
    ENDIF.

    rv_text = pairs_to_text( json_to_pairs( iv_record_key ) ).
  ENDMETHOD.

  METHOD data_text.
    rv_text = pairs_to_text( business_pairs( json_to_pairs( iv_json ) ) ).
  ENDMETHOD.

  METHOD changed_fields_text.
    DATA(lv_action) = action_text( iv_action ).
    DATA(lt_old) = business_pairs( json_to_pairs( iv_old_data ) ).
    DATA(lt_new) = business_pairs( json_to_pairs( iv_new_data ) ).
    DATA lt_labels TYPE STANDARD TABLE OF string WITH EMPTY KEY.

    IF lv_action = `Delete`.
      rv_text = `Deleted record`.
      RETURN.
    ENDIF.

    IF lv_action = `Create`.
      LOOP AT lt_new ASSIGNING FIELD-SYMBOL(<new_create>).
        APPEND field_label( <new_create>-name ) TO lt_labels.
      ENDLOOP.
    ELSE.
      LOOP AT lt_old ASSIGNING FIELD-SYMBOL(<old>).
        DATA(lv_new_value) = pair_value( lt_new, <old>-name ).
        IF lv_new_value <> <old>-value.
          APPEND field_label( <old>-name ) TO lt_labels.
        ENDIF.
      ENDLOOP.

      LOOP AT lt_new ASSIGNING FIELD-SYMBOL(<new>).
        IF pair_value( lt_old, <new>-name ) IS INITIAL AND <new>-value IS NOT INITIAL.
          APPEND field_label( <new>-name ) TO lt_labels.
        ENDIF.
      ENDLOOP.
    ENDIF.

    rv_text = concat_lines_of( table = lt_labels sep = `, ` ).
  ENDMETHOD.

  METHOD change_summary.
    DATA(lv_action) = action_text( iv_action ).
    DATA(lt_old) = business_pairs( json_to_pairs( iv_old_data ) ).
    DATA(lt_new) = business_pairs( json_to_pairs( iv_new_data ) ).
    DATA lt_lines TYPE STANDARD TABLE OF string WITH EMPTY KEY.

    IF lv_action = `Delete`.
      rv_text = |Deleted record: { record_key_text( iv_record_key ) }|.
      RETURN.
    ENDIF.

    IF lv_action = `Create`.
      DATA(lv_fields) = changed_fields_text(
        iv_action   = iv_action
        iv_old_data = iv_old_data
        iv_new_data = iv_new_data ).
      rv_text = |Created record with fields: { lv_fields }|.
      RETURN.
    ENDIF.

    LOOP AT lt_old ASSIGNING FIELD-SYMBOL(<old>).
      DATA(lv_new_value) = pair_value( lt_new, <old>-name ).
      IF lv_new_value <> <old>-value.
        APPEND |{ field_label( <old>-name ) }: { field_value( <old>-name, <old>-value ) } -> { field_value( <old>-name, lv_new_value ) }| TO lt_lines.
      ENDIF.
    ENDLOOP.

    rv_text = concat_lines_of( table = lt_lines sep = cl_abap_char_utilities=>newline ).
  ENDMETHOD.

  METHOD json_to_pairs.
    DATA lr_data TYPE REF TO data.

    IF iv_json IS INITIAL OR to_upper( condense( iv_json ) ) = `BULK`.
      RETURN.
    ENDIF.

    TRY.
        lr_data = /ui2/cl_json=>generate( json = iv_json ).
        flatten_data(
          EXPORTING
            ir_data   = lr_data
            iv_prefix = iv_prefix
          CHANGING
            ct_pairs  = rt_pairs ).
      CATCH cx_root.
        CLEAR rt_pairs.
    ENDTRY.
  ENDMETHOD.

  METHOD flatten_data.
    FIELD-SYMBOLS <data> TYPE any.
    ASSIGN ir_data->* TO <data>.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.

    DATA(lo_descr) = cl_abap_typedescr=>describe_by_data( <data> ).

    CASE lo_descr->kind.
      WHEN cl_abap_typedescr=>kind_struct.
        DATA(lo_struct) = CAST cl_abap_structdescr( lo_descr ).
        LOOP AT lo_struct->components ASSIGNING FIELD-SYMBOL(<component>).
          ASSIGN COMPONENT <component>-name OF STRUCTURE <data> TO FIELD-SYMBOL(<field>).
          IF sy-subrc = 0.
            DATA(lr_field) = REF #( <field> ).
            DATA(lv_name) = COND string(
              WHEN iv_prefix IS INITIAL THEN <component>-name
              ELSE |{ iv_prefix }.{ <component>-name }| ).
            flatten_data(
              EXPORTING
                ir_data   = lr_field
                iv_prefix = lv_name
              CHANGING
                ct_pairs  = ct_pairs ).
          ENDIF.
        ENDLOOP.

      WHEN cl_abap_typedescr=>kind_table.
        DATA lt_values TYPE STANDARD TABLE OF string WITH EMPTY KEY.
        LOOP AT <data> ASSIGNING FIELD-SYMBOL(<row>).
          APPEND |{ <row> }| TO lt_values.
        ENDLOOP.
        APPEND VALUE #( name = iv_prefix value = concat_lines_of( table = lt_values sep = `, ` ) ) TO ct_pairs.

      WHEN OTHERS.
        IF iv_prefix IS NOT INITIAL AND |{ <data> }| IS NOT INITIAL.
          APPEND VALUE #( name = iv_prefix value = |{ <data> }| ) TO ct_pairs.
        ENDIF.
    ENDCASE.
  ENDMETHOD.

  METHOD is_technical_field.
    DATA(lv_name) = to_upper( iv_name ).
    SPLIT lv_name AT `.` INTO TABLE DATA(lt_parts).
    READ TABLE lt_parts INTO DATA(lv_leaf) INDEX lines( lt_parts ).
    rv_result = xsdbool( line_exists( gt_technical_fields[ table_line = lv_leaf ] ) ).
  ENDMETHOD.

  METHOD field_label.
    DATA(lv_name) = to_upper( iv_name ).
    SPLIT lv_name AT `.` INTO TABLE DATA(lt_parts).
    READ TABLE lt_parts INTO DATA(lv_leaf) INDEX lines( lt_parts ).

    rv_label = SWITCH #( lv_leaf
      WHEN `ENTITY_ID`             THEN `Entity ID`
      WHEN `ITEM_ID`               THEN `Item ID`
      WHEN `PRODUCT_CATEGORY`      THEN `Product Category`
      WHEN `DESCRIPTION`           THEN `Description`
      WHEN `STATUS`                THEN `Status`
      WHEN `VALID_FROM`            THEN `Valid From`
      WHEN `VALID_TO`              THEN `Valid To`
      WHEN `COMPANY_CODE`          THEN `Company Code`
      WHEN `PLANT`                 THEN `Plant`
      WHEN `MATERIAL_GROUP`        THEN `Material Group`
      WHEN `QUANTITY`              THEN `Quantity`
      WHEN `UNIT`                  THEN `Unit`
      WHEN `CREATED_BY`            THEN `Created By`
      WHEN `CREATED_AT`            THEN `Created At`
      WHEN `CHANGED_BY`            THEN `Changed By`
      WHEN `CHANGED_AT`            THEN `Changed At`
      WHEN `LAST_CHANGED_AT`       THEN `Last Changed At`
      WHEN `LOCAL_LAST_CHANGED_AT` THEN `Local Last Changed At`
      ELSE replace( val = to_mixed( replace( val = lv_leaf sub = `_` with = ` ` occ = 0 ) ) sub = ` Id` with = ` ID` occ = 0 ) ).

    IF lines( lt_parts ) > 1.
      DELETE lt_parts INDEX lines( lt_parts ).
      rv_label = |{ concat_lines_of( table = lt_parts sep = `.` ) }.{ rv_label }|.
    ENDIF.
  ENDMETHOD.

  METHOD field_value.
    DATA(lv_name) = to_upper( iv_name ).
    DATA(lv_value) = to_upper( condense( iv_value ) ).

    IF lv_name = `STATUS` OR lv_name CP `*.STATUS`.
      rv_value = SWITCH #( lv_value
        WHEN `A` THEN `Active`
        WHEN `ACTIVE` THEN `Active`
        WHEN `I` THEN `Inactive`
        WHEN `INACTIVE` THEN `Inactive`
        WHEN `B` THEN `Blocked`
        WHEN `BLOCKED` THEN `Blocked`
        ELSE iv_value ).
      RETURN.
    ENDIF.

    rv_value = iv_value.
  ENDMETHOD.

  METHOD business_pairs.
    LOOP AT it_pairs ASSIGNING FIELD-SYMBOL(<pair>).
      IF is_technical_field( <pair>-name ) = abap_false AND <pair>-value IS NOT INITIAL.
        APPEND <pair> TO rt_pairs.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD pairs_to_text.
    DATA lt_lines TYPE STANDARD TABLE OF string WITH EMPTY KEY.

    LOOP AT it_pairs ASSIGNING FIELD-SYMBOL(<pair>).
      APPEND |{ field_label( <pair>-name ) }: { field_value( <pair>-name, <pair>-value ) }| TO lt_lines.
    ENDLOOP.

    rv_text = concat_lines_of( table = lt_lines sep = cl_abap_char_utilities=>newline ).
  ENDMETHOD.

  METHOD pair_value.
    READ TABLE it_pairs ASSIGNING FIELD-SYMBOL(<pair>) WITH KEY name = iv_name.
    IF sy-subrc = 0.
      rv_value = <pair>-value.
    ENDIF.
  ENDMETHOD.

  METHOD if_sadl_exit_calc_element_read~get_calculation_info.
    LOOP AT it_requested_calc_elements ASSIGNING FIELD-SYMBOL(<element>).
      CASE to_upper( <element> ).
        WHEN `ACTIONTEXT`.
          APPEND `ACTIONTYPE` TO et_requested_orig_elements.
        WHEN `RECORDKEYTEXT`.
          APPEND `RECORDKEY` TO et_requested_orig_elements.
        WHEN `NEWDATATEXT`.
          APPEND `NEWDATA` TO et_requested_orig_elements.
        WHEN `OLDDATATEXT`.
          APPEND `OLDDATA` TO et_requested_orig_elements.
        WHEN `CHANGEDFIELDSTEXT` OR `CHANGESUMMARY`.
          APPEND `ACTIONTYPE` TO et_requested_orig_elements.
          APPEND `RECORDKEY` TO et_requested_orig_elements.
          APPEND `OLDDATA` TO et_requested_orig_elements.
          APPEND `NEWDATA` TO et_requested_orig_elements.
      ENDCASE.
    ENDLOOP.
  ENDMETHOD.

  METHOD if_sadl_exit_calc_element_read~calculate.
    DATA lt_original TYPE STANDARD TABLE OF string WITH EMPTY KEY.

    LOOP AT it_original_data ASSIGNING FIELD-SYMBOL(<original>).
      APPEND INITIAL LINE TO ct_calculated_data ASSIGNING FIELD-SYMBOL(<calculated>).

      ASSIGN COMPONENT `ACTIONTYPE` OF STRUCTURE <original> TO FIELD-SYMBOL(<action>).
      ASSIGN COMPONENT `RECORDKEY` OF STRUCTURE <original> TO FIELD-SYMBOL(<record_key>).
      ASSIGN COMPONENT `OLDDATA` OF STRUCTURE <original> TO FIELD-SYMBOL(<old_data>).
      ASSIGN COMPONENT `NEWDATA` OF STRUCTURE <original> TO FIELD-SYMBOL(<new_data>).

      DATA(lv_action) = CONV string( COND #( WHEN <action> IS ASSIGNED THEN <action> ELSE `` ) ).
      DATA(lv_record_key) = CONV string( COND #( WHEN <record_key> IS ASSIGNED THEN <record_key> ELSE `` ) ).
      DATA(lv_old_data) = CONV string( COND #( WHEN <old_data> IS ASSIGNED THEN <old_data> ELSE `` ) ).
      DATA(lv_new_data) = CONV string( COND #( WHEN <new_data> IS ASSIGNED THEN <new_data> ELSE `` ) ).

      ASSIGN COMPONENT `ACTIONTEXT` OF STRUCTURE <calculated> TO FIELD-SYMBOL(<action_text>).
      IF sy-subrc = 0.
        <action_text> = action_text( lv_action ).
      ENDIF.

      ASSIGN COMPONENT `RECORDKEYTEXT` OF STRUCTURE <calculated> TO FIELD-SYMBOL(<record_key_text>).
      IF sy-subrc = 0.
        <record_key_text> = record_key_text( lv_record_key ).
      ENDIF.

      ASSIGN COMPONENT `NEWDATATEXT` OF STRUCTURE <calculated> TO FIELD-SYMBOL(<new_data_text>).
      IF sy-subrc = 0.
        <new_data_text> = data_text( lv_new_data ).
      ENDIF.

      ASSIGN COMPONENT `OLDDATATEXT` OF STRUCTURE <calculated> TO FIELD-SYMBOL(<old_data_text>).
      IF sy-subrc = 0.
        <old_data_text> = data_text( lv_old_data ).
      ENDIF.

      ASSIGN COMPONENT `CHANGEDFIELDSTEXT` OF STRUCTURE <calculated> TO FIELD-SYMBOL(<changed_fields_text>).
      IF sy-subrc = 0.
        <changed_fields_text> = changed_fields_text(
          iv_action   = lv_action
          iv_old_data = lv_old_data
          iv_new_data = lv_new_data ).
      ENDIF.

      ASSIGN COMPONENT `CHANGESUMMARY` OF STRUCTURE <calculated> TO FIELD-SYMBOL(<change_summary>).
      IF sy-subrc = 0.
        <change_summary> = change_summary(
          iv_action     = lv_action
          iv_record_key = lv_record_key
          iv_old_data   = lv_old_data
          iv_new_data   = lv_new_data ).
      ENDIF.
    ENDLOOP.
  ENDMETHOD.
ENDCLASS.
