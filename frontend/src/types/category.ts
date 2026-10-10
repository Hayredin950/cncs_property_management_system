export interface Category {
  id: string;
  name: string;
  /**
   * How many items are filed under this category. Always present on `GET
   * /categories` — the admin screen shows it and links through to the filtered
   * register, and it is what the delete endpoint checks before refusing.
   */
  itemCount: number;
}
