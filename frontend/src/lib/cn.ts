/** Minimal conditional-classname joiner — small enough not to need `clsx` as a dependency. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
