/**
 * A building of the college.
 *
 * `itemCount` is how many items are filed against it — the management screen
 * shows it beside each name and refuses to delete a building that is in use,
 * so the number has to be on the list rather than fetched one building at a
 * time.
 */
export interface Building {
  id: string;
  name: string;
  /** The short code the item form and the reports carry. */
  code: string;
  description: string | null;
  address: string | null;
  itemCount: number;
}
