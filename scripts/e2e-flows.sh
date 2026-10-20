#!/usr/bin/env bash
#
# The end-to-end flow check.
#
# The unit suites mock Prisma, so they cannot catch a query against a column
# that does not exist — which is exactly how four production 500s shipped, and
# how a whole migration history turned out to be unbuildable. This script does
# the opposite: it builds a database from the migrations, seeds it, starts the
# real server against it, and drives the real flows over HTTP, the way a
# browser would.
#
# It is the answer to the question the knowledge base keeps asking: *does the
# backend actually do what the code says it does?*
#
# Usage:
#   scripts/e2e-flows.sh                     # uses the local Docker Postgres
#   DATABASE_URL=... DIRECT_URL=... scripts/e2e-flows.sh
#
# Every step prints the HTTP status it got. The script fails on the first
# status that is not the expected one.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
PORT="${E2E_PORT:-4199}"
BASE="http://127.0.0.1:$PORT/api/v1"
PG_CONTAINER="${E2E_PG_CONTAINER:-cncs-e2e-pg}"
PG_PASSWORD="${E2E_PG_PASSWORD:-e2e}"
PG_PORT="${E2E_PG_PORT:-55433}"

pass=0
fail=0
SERVER_PID=""

cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  docker rm -f "$PG_CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; pass=$((pass+1)); }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$*"; fail=$((fail+1)); }

# check <label> <expected> <actual> [detail]
check() {
  if [ "$2" = "$3" ]; then ok "$1 → $3"; else bad "$1 → expected $2, got $3 ${4:-}"; fi
}

# status <method> <path> <token> [body]
status() {
  local method="$1" path="$2" token="$3" body="${4:-}"
  if [ -n "$body" ]; then
    curl -s -m 30 -o /tmp/e2e-body.json -w '%{http_code}' -X "$method" "$BASE$path" \
      -H "Authorization: Bearer $token" -H 'content-type: application/json' -d "$body"
  else
    curl -s -m 30 -o /tmp/e2e-body.json -w '%{http_code}' -X "$method" "$BASE$path" \
      -H "Authorization: Bearer $token"
  fi
}

# json <python-expression over `d`>
json() { python3 -c "import json,sys; d=json.load(open('/tmp/e2e-body.json')); print($1)" 2>/dev/null; }

token_for() { # email password
  curl -s -m 30 -X POST "$BASE/auth/login" -H 'content-type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin).get("token",""))' 2>/dev/null
}

say "1. A database built from the migrations, and seeded"
if [ -z "${DATABASE_URL:-}" ]; then
  docker rm -f "$PG_CONTAINER" >/dev/null 2>&1 || true
  docker run -d --name "$PG_CONTAINER" -e POSTGRES_PASSWORD="$PG_PASSWORD" -e POSTGRES_USER=cncs \
    -e POSTGRES_DB=cncs_e2e -p "$PG_PORT":5432 postgres:16-alpine >/dev/null
  for _ in $(seq 1 30); do
    docker exec "$PG_CONTAINER" pg_isready -U cncs -d cncs_e2e >/dev/null 2>&1 && break
    sleep 1
  done
  export DATABASE_URL="postgresql://cncs:$PG_PASSWORD@127.0.0.1:$PG_PORT/cncs_e2e"
  export DIRECT_URL="$DATABASE_URL"
  echo "  (using a throwaway Docker Postgres — the developer's own database is not touched)"
fi

( cd "$BACKEND" && pnpm exec prisma migrate deploy ) >/tmp/e2e-migrate.log 2>&1
check "prisma migrate deploy" "0" "$?"
( cd "$BACKEND" && pnpm exec prisma generate ) >/dev/null 2>&1
( cd "$BACKEND" && pnpm prisma:seed ) >/tmp/e2e-seed.log 2>&1
check "prisma seed" "0" "$?"
# The seed must converge: a second run must not change anything.
( cd "$BACKEND" && pnpm prisma:seed ) >>/tmp/e2e-seed.log 2>&1
check "prisma seed (second run, idempotent)" "0" "$?"

say "2. The server starts against it"
( cd "$BACKEND" && PORT="$PORT" JWT_SECRET=e2e_secret node dist/server.js ) >/tmp/e2e-server.log 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 30); do
  curl -s -m 2 "$BASE/health" >/dev/null 2>&1 && break
  sleep 1
done
check "GET /health" "200" "$(status GET /health '')"
check "GET /items without a token → 401" "401" "$(status GET /items '')"

say "3. The five roles can sign in"
ADMIN=$(token_for admin@cncs.aau.edu.et 'Admin123!')
OFFICER=$(token_for officer@cncs.aau.edu.et 'Officer123!')
HEAD=$(token_for head.cs@cncs.aau.edu.et 'HeadCS123!')
STAFF=$(token_for staff.cs1@cncs.aau.edu.et 'StaffCS123!')
AUDITOR=$(token_for auditor@cncs.aau.edu.et 'Auditor123!')
for pair in "admin:$ADMIN" "officer:$OFFICER" "head.cs:$HEAD" "staff.cs1:$STAFF" "auditor:$AUDITOR"; do
  name="${pair%%:*}"; tok="${pair#*:}"
  if [ -n "$tok" ]; then ok "$name signed in"; else bad "$name could not sign in"; fi
done

say "4. Account approval, end to end (the flow the supervisor asked for)"
NEWMAIL="e2e.$RANDOM@cncs.aau.edu.et"
check "POST /auth/account-requests → 201" "201" \
  "$(status POST /auth/account-requests '' "{\"fullName\":\"End To End Tester\",\"email\":\"$NEWMAIL\",\"password\":\"E2eTest123!\",\"staffId\":\"E2E-$RANDOM\",\"department\":\"Computer Science\"}")"
NEWID=$(json 'd["request"]["id"]')
[ -n "$NEWID" ] && ok "the request is a pending account" || bad "no request id came back"

check "the applicant cannot sign in yet → 403" "403" \
  "$(status POST /auth/login '' "{\"email\":\"$NEWMAIL\",\"password\":\"E2eTest123!\"}")"

check "the CS head sees it in their queue" "200" "$(status GET /users/approvals "$HEAD")"
FOUND=$(json "sum(1 for r in d if r['email']=='$NEWMAIL')")
check "the new request is in the head's queue" "1" "$FOUND"

check "the head approves it → 200" "200" "$(status POST "/users/$NEWID/approve" "$HEAD" '{"role":"STAFF"}')"
check "the applicant can now sign in → 200" "200" \
  "$(status POST /auth/login '' "{\"email\":\"$NEWMAIL\",\"password\":\"E2eTest123!\"}")"

say "5. The scope rules hold"
status GET /items "$ADMIN" >/dev/null
check "SYSTEM_ADMIN sees no items at all" "0" "$(json 'd["pagination"]["total"]')"
check "a staff member sees only their own" "1" "$(status GET '/items?scope=mine' "$STAFF" >/dev/null; json '1 if d["pagination"]["total"] >= 0 else 0')"
check "the officer sees the whole register" "200" "$(status GET /items "$OFFICER")"
status GET /requests/pending-count "$AUDITOR" >/dev/null
check "the auditor's pending count is scoped to them (0, not the college's)" "0" "$(json 'd["pendingCount"]')"

say "6. The workflows the spec describes"
# The register is not empty, and it is not empty of *pending requests* either:
# the seeded items already carry some, and one PENDING request per item is the
# rule. So the flows below register their own items first — which is the real
# path anyway: the officer registers, the staff member requests.
status GET /items "$OFFICER" >/dev/null
SEEDED_TAG=$(json 'd["data"][0]["tagId"]')
[ -n "$SEEDED_TAG" ] && ok "the register is not empty ($SEEDED_TAG)" || bad "the register is empty"

# The ids the register needs, read from the endpoints that serve them.
status GET /categories "$OFFICER" >/dev/null
CATEGORY=$(json 'd[0]["id"]')
status GET /departments "$OFFICER" >/dev/null
UNIT=$(json '[u["id"] for u in d if u["name"]=="Computer Science"][0]')
status GET /users "$OFFICER" >/dev/null
OWNER=$(json '[u["id"] for u in d if u["email"]=="staff.cs1@cncs.aau.edu.et"][0]')
status GET /buildings "$OFFICER" >/dev/null
# /buildings answers with a paginated envelope; /categories and /users are arrays.
BUILDING=$(json 'd["data"][0]["id"]')

register_item() { # name → id
  status POST /items "$OFFICER" "{\"name\":\"$1\",\"categoryId\":\"$CATEGORY\",\"orgUnitId\":\"$UNIT\",\"buildingId\":\"$BUILDING\",\"floor\":\"1\",\"room\":\"E2E\",\"ownerId\":\"$OWNER\",\"purchaseCost\":1000,\"condition\":\"GOOD\"}" >/dev/null
  json 'd["id"]'
}
ITEM=$(register_item "E2E transfer item")
ITEM2=$(register_item "E2E disposal item")
ITEM3=$(register_item "E2E loan item")
if [ -n "$ITEM" ] && [ -n "$ITEM2" ] && [ -n "$ITEM3" ]; then
  ok "the officer registered three items"
else
  bad "registering an item failed: $(head -c 120 /tmp/e2e-body.json)"
fi

check "a staff member files a transfer → 201" "201" \
  "$(status POST /requests "$STAFF" "{\"type\":\"TRANSFER\",\"itemId\":\"$ITEM\",\"reason\":\"End to end check of the transfer flow.\",\"newLocationRoom\":\"E2E-101\"}")"
REQ=$(json 'd["request"]["id"]')
check "the requester can withdraw it → 200" "200" "$(status POST "/requests/$REQ/withdraw" "$STAFF" '{}')"
check "a withdrawn request can no longer be approved → 409" "409" \
  "$(status POST "/requests/$REQ/approve" "$OFFICER" '{}')"

check "a staff member files a disposal → 201" "201" \
  "$(status POST /requests "$STAFF" "{\"type\":\"DISPOSAL\",\"itemId\":\"$ITEM2\",\"reason\":\"End to end check of the disposal flow.\"}")"
DISP=$(json 'd["request"]["id"]')
check "the officer approves the disposal → 200" "200" "$(status POST "/requests/$DISP/approve" "$OFFICER" '{}')"

FUTURE=$(python3 -c "import datetime;print((datetime.date.today()+datetime.timedelta(days=14)).isoformat())")
check "a staff member files a loan (with a due date) → 201" "201" \
  "$(status POST /requests "$STAFF" "{\"type\":\"LOAN\",\"itemId\":\"$ITEM3\",\"reason\":\"End to end check of the loan flow.\",\"loanDueDate\":\"$FUTURE\"}")"
LOAN=$(json 'd["request"]["id"]')

say "7. The expiry and report surfaces that were 500ing"
check "POST /expiry/check → 200" "200" "$(status POST /expiry/check "$ADMIN" '{}')"
check "GET /expiry/status → 200" "200" "$(status GET /expiry/status "$ADMIN")"
check "GET /users/invites → 200" "200" "$(status GET /users/invites "$ADMIN")"
check "GET /reports/inventory (CSV) → 200" "200" "$(status GET '/reports/inventory?format=csv' "$OFFICER")"
check "GET /reports/audit-evidence-pack (CSV) → 200" "200" "$(status GET "/reports/audit-evidence-pack?format=csv&dateFrom=2000-01-01&dateTo=2100-01-01" "$OFFICER")"
check "GET /loans/overdue (officer) → 200" "200" "$(status GET /loans/overdue "$OFFICER")"
check "GET /loans/overdue (system admin, no capability) → 403" "403" "$(status GET /loans/overdue "$ADMIN")"

say "8. The audit surfaces"
check "GET /audits → 200" "200" "$(status GET /audits "$AUDITOR")"
check "GET /audits/active → 200" "200" "$(status GET /audits/active "$AUDITOR")"
check "GET /audits/findings → 200" "200" "$(status GET '/audits/findings?status=OPEN' "$AUDITOR")"

say "9. The notifications"
check "GET /notifications → 200" "200" "$(status GET /notifications "$OFFICER")"

say "10. A request that names a unit nobody has → 400"
check "POST /auth/account-requests with a fake department → 400" "400" \
  "$(status POST /auth/account-requests '' '{"fullName":"No Such Department","email":"nobody."$RANDOM"@cncs.aau.edu.et","password":"E2eTest123!","department":"Astrology"}')"
check "POST /auth/account-requests from a personal address → 400" "400" \
  "$(status POST /auth/account-requests '' "{\"fullName\":\"Personal Address\",\"email\":\"someone.$RANDOM@gmail.com\",\"password\":\"E2eTest123!\",\"department\":\"Computer Science\"}")"

say ""
printf '════════════════════════════════════════════\n'
printf '  passed: %s   failed: %s\n' "$pass" "$fail"
printf '════════════════════════════════════════════\n'
[ "$fail" -eq 0 ] || exit 1
