/**
 * A picture for a category, used when an item's own photo will not load.
 *
 * The files are the app's own demo photographs. A dead link is common — an
 * upload made against an earlier deployment, a photo deleted from the bucket,
 * a path from an older seed — and the frame used to answer with a grey box
 * that said nothing about the item. A person looking for a laptop needs a
 * picture of a laptop, not a tombstone.
 */
const CATEGORY_FALLBACKS: Record<string, string> = {
  electronics: "/photos/laptop.jpg",
  furniture: "/photos/desk.jpg",
  "lab equipment": "/photos/microscope.jpg",
  vehicles: "/photos/desk.jpg",
  "office supplies": "/photos/desk.jpg",
};

export function categoryFallbackPhoto(categoryName: string | undefined | null): string {
  if (!categoryName) return "/photos/desk.jpg";
  return CATEGORY_FALLBACKS[categoryName.toLowerCase()] ?? "/photos/desk.jpg";
}
