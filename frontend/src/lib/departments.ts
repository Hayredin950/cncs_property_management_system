/**
 * The CNCS departments.
 *
 * `Item.department` is free-text `String` on the schema and there is no
 * `GET /departments` endpoint (gap G9), so before this file the only source of
 * department values was whatever happened to be on the first page of `GET
 * /items`. That made the picker useless on an empty register and let a typo
 * ("Computer Scince") become its own department forever.
 *
 * This is the fixed vocabulary the college actually files property under —
 * `Select`ed everywhere a department is chosen (item registration/edit, the
 * register's filter), rather than typed. It is deliberately a plain array and
 * not an enum: the API still stores a bare string, so a value outside this list
 * is tolerated by the backend and shown rather than silently dropped.
 */
export const CNCS_DEPARTMENTS = [
  "Biology",
  "Chemistry",
  "Physics",
  "Mathematics",
  "Statistics",
  "Earth Science (Geology)",
  "Computer Science",
  "Information Science (INSY)",
] as const;

export type CncsDepartment = (typeof CNCS_DEPARTMENTS)[number];

export const DEPARTMENT_OPTIONS: { value: string; label: string }[] = CNCS_DEPARTMENTS.map(
  (name) => ({ value: name, label: name }),
);
