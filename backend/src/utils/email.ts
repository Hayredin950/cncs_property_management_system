/**
 * Email comparison, in one place.
 *
 * An email address is not case-sensitive in practice — nobody types their own
 * twice in two casings, and every mail system treats `Abebe@x` and `abebe@x` as
 * one mailbox. `User.email` is `@unique` on PostgreSQL, where `=` *is*
 * case-sensitive, so without a rule the database believes `Abebe@x` and
 * `abebe@x` are two different addresses and will happily store two accounts.
 *
 * The rule is two halves, and both are needed:
 *
 *   - **written lowercase** (`normalizeEmail` below), so the column has one
 *     spelling per address; and
 *   - **read case-insensitively** (`mode: "insensitive"` on the login and
 *     conflict queries), so an account created before this rule — or through
 *     the seed — still signs in with any casing.
 *
 * Either half alone leaves a hole. Normalizing only on write means the existing
 * mixed-case rows can never be found again; comparing only on read means two
 * rows can still be created for one address, and `findFirst` then picks between
 * them arbitrarily.
 *
 * ### Why the `@` guard
 *
 * `POST /auth/register` doubles as "register by staff ID": the value that lands
 * in the `email` column may be an identifier like `STAFF-007`. Lowercasing that
 * would silently rewrite the identifier an administrator typed, and an id is
 * not an address. Only values that contain `@` are treated as emails.
 */
export function normalizeEmail(value: string): string {
  return value.includes("@") ? value.toLowerCase() : value;
}
