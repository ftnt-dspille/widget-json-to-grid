| [Home](../README.md) |
|--------------------------------------------|

# Usage

The JSON to Grid widget helps render the JSON list result returned from the **JSON Data Provider** Playbook in a grid view. It also has the option to add playbooks as action buttons.

## Features

- Configure the widget by choosing *Title*, *Playbook Collection*, *Playbooks*, and *Icons*

- Visualize the JSON data result from the playbook specified under the `JSON Data Provider Playbook` field

- Execute the playbooks either when **_no records are selected_** or when one or more **_records are selected_** on grid data

    <table>
        <tr>
            <th>NOTE</th>
        </tr>
        <tr>
            <td>The playbook <em>JSON Data Provider</em> must return <strong>two</strong> variables:
                <ol>
                    <li><code>grid_data</code>: Contains the list of JSON data to render on grid view. Every record should have a unique IRI (<code>@id</code>) field.</li>
                    <li><code>grid_columns</code>: Map <code>grid_data</code> variable fields with the column fields of the grid.</li>
                </ol>
            </td>
        </tr>
    </table>

## Configuring JSON to Grid Widget

In this section, we use *Continuos Delivery* solution pack as an example for configuring the **JSON to Grid** widget.

1. Edit a module's view template and select the **Add Widget** button.

2. Select **JSON to Grid** from the list of installed widgets.

3. Specify a title of the widget in the **Title** field.

    ![Title field](./res/edit-view-00.png)

4. Select the playbook collection containing the playbooks to execute. This collection must also contain the playbooks to be executed as action buttons.

    As an example, select the collection **02 - Use Case - CICD**.

    ![Playbook collection](./res/edit-view-01.png)

5. Select the playbook that returns the JSON data to be rendered in the grid view.

    ![Playbook containing JSON data](./res/edit-view-03.png)

6. Select the checkbox **Action Buttons (No Record Selection)**

    - Select playbooks to be executed when no records are selected.

        ![Select Playbooks run when no records are selected](./res/edit-view-04.png)

7. Select the checkbox **Action Buttons (With Record Selection)**

    - Select playbooks to be executed when one or more records are selected.

        ![Select playbooks to run after selecting records](./res/edit-view-05.png)

8. Select the playbooks whose execution progress is to be displayed by the playbook execution wizard. Install **Playbook Execution Wizard** to view playbooks' execution progress.

    ![View playbooks execution in playbook execution wizard](./res/edit-view-06.png)

9. Specify the widget to launch when displaying the playbook execution progress under **Advanced Settings**. Currently, only **Playbook Execution Wizard** is supported in this field.

    ![Widget to display playbook execution](./res/edit-view-07.png)

    The following screen shows the playbook execution wizard about to show the playbook execution progress.

    ![Playbook Execution Wizard Screen](./res/playbook-execution-wizard.png)

>You can download this [Sample - JSON to Grid (ZIPPED)](./res/Sample-JSON-to-grid.zip) collection and import using the FortiSOAR&trade;'s import wizard to try out this widget. **_The ZIP file contains a playbook that generates a sample grid data._**

## `grid_columns` Reference

The `grid_columns` playbook variable controls how the widget renders each column. It must be a JSON object with a `columns` array:

```json
{
  "columns": [
    { "name": "severity", "displayName": "Severity", "width": 120 },
    { "name": "name",     "displayName": "Name" }
  ]
}
```

The widget renders columns in the order they appear in the `columns` array.

### Supported Keywords

Only `name` is required. The widget copies `name` into the grid's internal
`field` (the property it reads each cell from), so you never set `field`
yourself — just make `name` match the `grid_data` key exactly.

| Keyword | Type | Description |
|---------|------|-------------|
| `name` | string | **Required.** The field key from `grid_data` objects. Must match the property name exactly — it is what the cell value is read from, and what column order / sort / filter operate on. |
| `displayName` | string | Column header label. Defaults to `name` if omitted. |
| `width` | number | Fixed column width in pixels (e.g. `120`). Omit to let the column size automatically. |
| `minWidth` | number | Minimum column width in pixels. |
| `maxWidth` | number | Maximum column width in pixels. |
| `type` | string | Data type hint. Sorting auto-detects numbers vs text regardless, so this mainly documents intent. |
| `cellFilter` | string | AngularJS filter expression applied to the cell value before display. Examples: `"date:'MM/dd/yyyy'"`, `"number:2"`, `"uppercase"`. |
| `cellTemplate` | string | Custom HTML template for the cell. The cell value is available as `row.entity[col.field]` (recall `field` === your `name`). Use sparingly — plain `cellFilter` is simpler for formatting. |
| `enableSorting` | boolean | Allow the user to sort by this column. Default: `true`. Set `false` to disable sorting on a specific column. |
| `enableFiltering` | boolean | Show a filter input for this column. Default: `true` (inherited from grid). Set `false` to disable filtering on a specific column. |
| `visible` | boolean | Whether the column is initially visible. Default: `true`. |
| `pinnedLeft` | boolean | Pin the column to the left edge of the grid. |
| `pinnedRight` | boolean | Pin the column to the right edge of the grid. |

### Column order, sorting & filtering

- **Default column order** is exactly the order of entries in the `columns`
  array — independent of the property order inside `grid_data` objects.
- **Reordering** is per-user and persistent: drag a column header and the new
  order is saved (via the platform user-settings store) and restored on your
  next visit. If a later playbook run adds a new column, it appears at the end;
  removed columns are dropped from the saved order automatically.
- **Sorting** is client-side over the returned rows — click a column header to
  sort; numeric columns sort numerically, everything else case-insensitively.
  No extra playbook run happens. Disable per column with `"enableSorting": false`.
- **Filtering** is client-side too: the per-column filter inputs do a
  case-insensitive substring match over the rows already returned (they do not
  re-run the playbook). Disable per column with `"enableFiltering": false`.

### Examples

**Date formatting:**
```json
{ "name": "dueDate", "displayName": "Due Date", "type": "date", "cellFilter": "date:'MM/dd/yyyy'" }
```

**Number with two decimal places:**
```json
{ "name": "cost", "displayName": "Cost ($)", "type": "number", "cellFilter": "number:2" }
```

**Fixed-width pinned status column with sorting disabled:**
```json
{ "name": "status", "displayName": "Status", "width": 100, "pinnedLeft": true, "enableSorting": false }
```

**Hide a technical field while keeping it in `grid_data` for playbook use:**
```json
{ "name": "internalId", "visible": false }
```

**Custom cell template (render a link):**
```json
{
  "name": "ticketUrl",
  "displayName": "Ticket",
  "cellTemplate": "<div class='ui-grid-cell-contents'><a href='{{row.entity.ticketUrl}}' target='_blank'>{{row.entity.ticketUrl}}</a></div>"
}
```

### Notes

- **Column order** is determined by the order of entries in the `columns` array. The grid always renders columns in this sequence regardless of the property order in `grid_data` objects.
- **Unsupported fields** in `grid_data` (i.e. fields with no matching `columns` entry) are not rendered. To show all fields, include an entry for each key you want visible.
- **Detail-view context**: when the widget is placed on a record detail page, the current record is automatically passed to the data-provider playbook as the selected record. This allows the playbook to scope `grid_data` to data relevant to that record without the user having to select a row first.

## JSON to Grid Widget Views

| ![JSON to Grid widget with no record selected](./res/json-to-grid-no-record-selected.png) | ![JSON to Grid widget with a record selected](./res/json-to-grid-record-selected.png) |
|:----------------------------------------------------------------------------------------------:|:------------------------------------------------------------------------------------------:|
|                          JSON to Grid widget with no record selected                           |                         JSON to Grid widget with a record selected                         |

## Next Steps

| [Installation](./setup.md#installation) | [Configuration](./setup.md#configuration) |
|-----------------------------------------|-------------------------------------------|