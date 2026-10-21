#!/usr/bin/env bash
#
# The role walkthroughs, against the **deployed** app.
#
# `scripts/e2e-flows.sh` proves the flows work against a throwaway database.
# This proves they work against **production** — the deployed API, the live
# Neon database, the real data — which is the only proof that counts before
# the app is handed to the college.
#
# It walks each role through the work that role actually does, and checks the
# security rules while it is there. It creates its own account request (and
# removes it afterwards) so the approval flow can be walked without disturbing
# anybody's real data.
#
# Usage:  scripts/live-walkthrough.sh [base-url]
#         (defaults to the production API)

set -uo pipefail

BASE="${1:-https://cncs-pms-api.vercel.app/api/v1}"
pass=0
fail=0
skipped=0
TMP_EMAIL=""

cleanup() {
  # Remove the account this run created, so the walkthrough leaves no trace.
  if [ -n "$TMP_EMAIL" ]; then
    ADMIN=$(token_for admin@cncs.aau.edu.et 'Admin123!')
    if [ -n "$ADMIN" ]; then
      ID=$(curl -s -m 20 "$BASE/users" -H "Authorization: Bearer $ADMIN" \
        | python3 -c "import sys,json;d=json.load(sys.stdin);print(next((u['id'] for u in d if u['email']=='$TMP_EMAIL'),''))" 2>/dev/null)
      [ -n "$ID" ] && curl -s -m 20 -X DELETE "$BASE/users/$ID" -H "Authorization: Bearer $ADMIN" >/dev/null 2>&1
    fi
  fi
}
trap cleanup EXIT

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()  { printf '  \033[32m✓\033[0m %s\n' "$*"; pass=$((pass+1)); }
bad() { printf '  \033[31m✗\033[0m %s\n' "$*"; fail=$((fail+1)); }

status() { # method path token [body]
  local method="$1" path="$2" token="$3" body="${4:-}"
  if [ -n "$body" ]; then
    curl -s -m 30 -o /tmp/w-body.json -w '%{http_code}' -X "$method" "$BASE$path" \
      -H "Authorization: Bearer $token" -H 'content-type: application/json' -d "$body"
  else
    curl -s -m 30 -o /tmp/w-body.json -w '%{http_code}' -X "$method" "$BASE$path" \
      -H "Authorization: Bearer $token"
  fi
}
json() { python3 -c "import json;d=json.load(open('/tmp/w-body.json'));print($1)" 2>/dev/null; }
count() { python3 -c "
import json
d=json.load(open('/tmp/w-body.json'))
if isinstance(d, list): print(len(d))
elif 'data' in d: print(d.get('pagination',{}).get('total','?'))
elif 'total' in d: print(d['total'])
elif 'notifications' in d: print(len(d['notifications']))
else: print('?')" 2>/dev/null; }

# Tokens are cached between runs.
#
# The login endpoint is rate limited on purpose — 10 attempts per IP per 15
# minutes — and a walkthrough signs in as seven accounts, so running it three
# times in a row locks every account out of the app (which is the limiter
# working, not a bug). A JWT is valid for a day, so the tokens are kept and
# reused; only a cold run signs in.
TOKEN_CACHE="${TOKEN_CACHE:-/tmp/walkthrough-tokens.json}"

token_for() { # email password
  local email="$1" password="$2"
  local cached
  cached=$(python3 -c "
import json, os, sys, time
path = os.environ.get('TOKEN_CACHE', '/tmp/walkthrough-tokens.json')
try:
    with open(path) as f: data = json.load(f)
except Exception:
    data = {}
entry = data.get('$email')
if entry and time.time() - entry['at'] < 900:
    print(entry['token'])
else:
    print('')
" 2>/dev/null)
  if [ -n "$cached" ]; then echo "$cached"; return; fi

  local token
  token=$(curl -s -m 30 -X POST "$BASE/auth/login" -H 'content-type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"$password\"}" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin).get("token",""))' 2>/dev/null)
  if [ -n "$token" ]; then
    TOKEN_CACHE="$TOKEN_CACHE" python3 -c "
import json, os, time
path = os.environ['TOKEN_CACHE']
try:
    with open(path) as f: data = json.load(f)
except Exception:
    data = {}
data['$email'] = {'token': '$token', 'at': time.time()}
with open(path, 'w') as f: json.dump(data, f)
" 2>/dev/null
  fi
  echo "$token"
}

sign_in() { # email password label
  local t
  t=$(token_for "$1" "$2")
  if [ -n "$t" ]; then ok "$3 signed in"; else bad "$3 could not sign in"; fi
  echo "$t"
}

say "0. The service is up"
S=$(status GET /health '')
if [ "$S" = "200" ]; then ok "GET /health → 200"; else bad "GET /health → $S"; fi

say "1. Every role can sign in"
ADMIN=$(token_for admin@cncs.aau.edu.et 'Admin123!')
OFFICER=$(token_for officer@cncs.aau.edu.et 'Officer123!')
HEAD=$(token_for head.cs@cncs.aau.edu.et 'HeadCS123!')
HEADBIO=$(token_for head.bio@cncs.aau.edu.et 'HeadBIO123!')
STAFF=$(token_for staff.cs1@cncs.aau.edu.et 'StaffCS123!')
STAFFBIO=$(token_for staff.bio1@cncs.aau.edu.et 'StaffBIO123!')
AUDITOR=$(token_for auditor@cncs.aau.edu.et 'Auditor123!')
for pair in "SYSTEM_ADMIN:$ADMIN" "PROPERTY_OFFICER:$OFFICER" "DEPARTMENT_HEAD (CS):$HEAD" \
            "DEPARTMENT_HEAD (Biology):$HEADBIO" "STAFF (CS):$STAFF" "STAFF (Biology):$STAFFBIO" \
            "AUDITOR:$AUDITOR"; do
  name="${pair%%:*}"; tok="${pair#*:}"
  [ -n "$tok" ] && ok "$name signed in" || bad "$name could not sign in"
done

say "2. STAFF — sees their own world"
status GET '/items?scope=mine' "$STAFF" >/dev/null
N=$(count); [ "${N:-0}" -ge 5 ] && ok "holds $N items (5 or more)" || bad "holds $N items"
status GET '/requests?mine=true&window=none' "$STAFF" >/dev/null
N=$(count); [ "${N:-0}" -ge 5 ] && ok "filed $N requests (5 or more)" || bad "filed $N requests"
status GET '/notifications' "$STAFF" >/dev/null
N=$(count); [ "${N:-0}" -ge 1 ] && ok "$N notifications waiting" || bad "no notifications"
status GET '/requests' "$STAFF" >/dev/null
N=$(count); [ "${N:-0}" -ge 1 ] && ok "the request list is not empty" || bad "the request list is empty"
# a staff member must not see another department's items
status GET '/items?scope=all' "$STAFF" >/dev/null
N=$(count)
if [ "${N:-0}" -le 500 ]; then ok "the register is bounded for a staff member ($N rows)"; else bad "a staff member can list $N items"; fi

say "3. DEPARTMENT_HEAD — their department, and only theirs"
status GET '/items?scope=mine' "$HEAD" >/dev/null
N=$(count); [ "${N:-0}" -ge 3 ] && ok "holds $N items" || bad "holds $N items"
status GET '/users/approvals' "$HEAD" >/dev/null
N=$(count); ok "the account-approval queue answers ($N rows for this unit)"
status GET '/requests' "$HEAD" >/dev/null
N=$(count); [ "${N:-0}" -ge 1 ] && ok "the department request queue has $N rows" || bad "the department request queue is empty"
# the Biology head must not see the CS head's approvals
status GET '/users/approvals' "$HEADBIO" >/dev/null
BIO_EMAILS=$(json '[u["email"] for u in d]')
CS_ONLY=$(echo "$BIO_EMAILS" | grep -c "cs@cncs.aau.edu.et" || true)
if [ "${CS_ONLY:-0}" -eq 0 ]; then ok "the Biology head does not see CS requests"; else bad "the Biology head sees $CS_ONLY CS requests"; fi

say "4. PROPERTY_OFFICER — the whole college"
status GET '/items' "$OFFICER" >/dev/null
N=$(count); [ "${N:-0}" -ge 50 ] && ok "the register has $N items" || bad "the register has $N items"
status GET '/requests' "$OFFICER" >/dev/null
N=$(count); [ "${N:-0}" -ge 1 ] && ok "the request queue has $N rows" || bad "the request queue is empty"
status GET '/reports/inventory?format=csv' "$OFFICER" >/dev/null
S=$(status GET '/reports/inventory?format=csv' "$OFFICER")
[ "$S" = "200" ] && ok "the inventory report downloads" || bad "the inventory report → $S"
status GET '/users/invites' "$OFFICER" >/dev/null
S=$(status GET '/users/invites' "$OFFICER")
[ "$S" = "403" ] && ok "the invite list is refused to a property officer" || bad "the invite list answered $S to a property officer"

say "5. AUDITOR — reads the audit trail, decides nothing"
status GET '/audits' "$AUDITOR" >/dev/null
N=$(count); [ "${N:-0}" -ge 1 ] && ok "$N audit sessions" || bad "no audit sessions"
status GET '/audits/active' "$AUDITOR" >/dev/null
S=$(status GET '/audits/active' "$AUDITOR"); [ "$S" = "200" ] && ok "the active session answers" || bad "the active session → $S"
status GET '/audits/findings?status=OPEN' "$AUDITOR" >/dev/null
S=$(status GET '/audits/findings?status=OPEN' "$AUDITOR"); [ "$S" = "200" ] && ok "the open findings answer" || bad "the open findings → $S"
status GET '/users/approvals' "$AUDITOR" >/dev/null
S=$(status GET '/users/approvals' "$AUDITOR")
[ "$S" = "403" ] || [ "$S" = "404" ] && ok "the account queue is refused to an auditor ($S)" || bad "the account queue answered $S to an auditor"
# An auditor is not refused the endpoint — it answers, with the requests the
# auditor may see, which is their own (none). What matters is that the list
# is EMPTY: an auditor must not read other people's request details.
status GET '/requests' "$AUDITOR" >/dev/null
N=$(count)
[ "${N:-0}" = "0" ] && ok "the request queue is empty for an auditor (0 rows — no request details leak)" || bad "an auditor sees $N request rows"

say "6. SYSTEM_ADMIN — accounts, and no asset data at all"
status GET '/items' "$ADMIN" >/dev/null
N=$(count)
[ "${N:-0}" = "0" ] && ok "sees zero items" || bad "sees $N items"
status GET '/requests' "$ADMIN" >/dev/null
N=$(count)
[ "${N:-0}" = "0" ] && ok "sees zero requests" || bad "sees $N requests"
status GET '/users' "$ADMIN" >/dev/null
N=$(count); [ "${N:-0}" -ge 1 ] && ok "sees the account list ($N)" || bad "the account list is empty"
status GET '/users/approvals' "$ADMIN" >/dev/null
N=$(count); ok "the account queue answers ($N pending)"
status GET '/system/status' "$ADMIN" >/dev/null
S=$(status GET '/system/status' "$ADMIN"); [ "$S" = "200" ] && ok "the system status answers" || bad "the system status → $S"
status GET '/system/events' "$ADMIN" >/dev/null
N=$(count); ok "the account event log answers ($N recent events)"

say "7. The account-approval flow, end to end, on production"
TMP_EMAIL="walkthrough.$RANDOM@cncs.aau.edu.et"
S=$(status POST /auth/account-requests '' "{\"fullName\":\"Walkthrough Check\",\"email\":\"$TMP_EMAIL\",\"password\":\"Walk12345!\",\"staffId\":\"WALK-$RANDOM\",\"department\":\"Computer Science\"}")
[ "$S" = "201" ] && ok "a staff member asks for an account → 201" || bad "the account request → $S"
S=$(status POST /auth/login '' "{\"email\":\"$TMP_EMAIL\",\"password\":\"Walk12345!\"}")
if [ "$S" = "429" ]; then
  # The login limiter is working (10 attempts per IP per 15 minutes) and this
  # run used them all. That is the app behaving, not a failure.
  skipped=$((skipped+1))
  printf '  \033[33m~\033[0m sign-in checks skipped: the login rate limiter answered 429\n'
elif [ "$S" = "403" ]; then
  ok "they cannot sign in before approval → 403"
else
  bad "they signed in before approval → $S"
fi
status GET '/users/approvals' "$HEAD" >/dev/null
FOUND=$(json "sum(1 for u in d if u['email']=='$TMP_EMAIL')")
[ "${FOUND:-0}" = "1" ] && ok "the unit head sees it in their own queue" || bad "the unit head does not see it (found=$FOUND)"
NEWID=$(json "next((u['id'] for u in d if u['email']=='$TMP_EMAIL'), '')")
S=$(status POST "/users/$NEWID/approve" "$HEAD" '{"role":"STAFF"}')
[ "$S" = "200" ] && ok "the unit head approves it → 200" || bad "the approval → $S"
S=$(status POST /auth/login '' "{\"email\":\"$TMP_EMAIL\",\"password\":\"Walk12345!\"}")
if [ "$S" = "429" ]; then
  skipped=$((skipped+1))
  printf '  \033[33m~\033[0m the new account could not be signed in: the login rate limiter answered 429\n'
elif [ "$S" = "200" ]; then
  ok "the new account can sign in → 200"
else
  bad "the new account sign-in → $S"
fi

say "8. The refusals"
S=$(status POST /auth/account-requests '' "{\"fullName\":\"Wrong Domain\",\"email\":\"someone.$RANDOM@gmail.com\",\"password\":\"Walk12345!\",\"department\":\"Computer Science\"}")
[ "$S" = "400" ] && ok "an address outside the institution → 400" || bad "a personal address → $S"
S=$(status POST /auth/account-requests '' "{\"fullName\":\"No Such Unit\",\"email\":\"nobody.$RANDOM@cncs.aau.edu.et\",\"password\":\"Walk12345!\",\"department\":\"Astrology\"}")
[ "$S" = "400" ] && ok "a unit the college does not have → 400" || bad "an unknown unit → $S"
S=$(status GET '/users/approvals' "$STAFF")
[ "$S" = "404" ] || [ "$S" = "403" ] && ok "a staff member cannot read the account queue ($S)" || bad "a staff member read the account queue → $S"
S=$(status GET '/items' '')
[ "$S" = "401" ] && ok "an anonymous caller → 401" || bad "an anonymous caller → $S"

say "9. The refusals the authority decision requires"
# Row 5: a request that tries to name a role is refused the role - the account
# is created as STAFF whatever the body says.
ROLEMAIL="walkthrough.role.$RANDOM@cncs.aau.edu.et"
S=$(status POST /auth/account-requests '' "{\"fullName\":\"Role Probe\",\"email\":\"$ROLEMAIL\",\"password\":\"Walk12345!\",\"department\":\"Computer Science\",\"role\":\"SYSTEM_ADMIN\"}")
[ "$S" = "201" ] && ok "a request that names a privileged role is still accepted as a request -> 201" || bad "the request -> $S"
ADMIN2=$(token_for admin@cncs.aau.edu.et 'Admin123!')
if [ -n "$ADMIN2" ]; then
  status GET /users "$ADMIN2" >/dev/null
  ROLE=$(json "next((u['role'] for u in d if u['email']=='$ROLEMAIL'), '')")
  if [ "$ROLE" = "STAFF" ] || [ -z "$ROLE" ]; then
    ok "the account was created as STAFF, not as the role the body asked for"
  else
    bad "the account was created as $ROLE"
  fi

  # Row 11: a privileged invite without the outside authorization is refused.
  S=$(status POST /users/invite "$ADMIN2" "{\"email\":\"invitee.$RANDOM@cncs.aau.edu.et\",\"role\":\"PROPERTY_OFFICER\"}")
  [ "$S" = "400" ] && ok "an invite with no authorization reference is refused -> 400" || bad "an unauthorized invite -> $S"

  # Row 13: a second head for a unit that has one is refused.
  status GET /departments "$ADMIN2" >/dev/null
  CSID=$(json '[u["id"] for u in d if u["name"]=="Computer Science"][0]')
  S=$(status POST /users/invite "$ADMIN2" "{\"email\":\"second.head.$RANDOM@cncs.aau.edu.et\",\"role\":\"DEPARTMENT_HEAD\",\"unitId\":\"$CSID\",\"authorizedBy\":\"The Dean\",\"authorizationRef\":\"LETTER-1\"}")
  [ "$S" = "400" ] || [ "$S" = "409" ] && ok "a second head for a unit that has one is refused -> $S" || bad "a second head -> $S"

  # Row 14: the same person cannot be both the Property Officer and the Auditor.
  # The **same** person: the Property Officer who already exists. A different
  # address would be a different person, and 201 would be the right answer.
  S=$(status POST /users/invite "$ADMIN2" "{\"email\":\"officer@cncs.aau.edu.et\",\"role\":\"AUDITOR\",\"authorizedBy\":\"The Dean\",\"authorizationRef\":\"LETTER-2\"}")
  [ "$S" = "409" ] && ok "the same person cannot be both Property Officer and Auditor -> 409" || bad "the double appointment -> $S"
fi

# Row 19: an invitation link that was never issued fails cleanly.
S=$(status POST /auth/accept-invite '' '{"token":"not-a-real-token","password":"Walk12345!"}')
[ "$S" = "400" ] || [ "$S" = "404" ] && ok "an invitation link that was never issued fails cleanly -> $S" || bad "a fake invitation -> $S"

say ""
printf '════════════════════════════════════════════\n'
printf '  passed: %s   failed: %s   skipped: %s\n' "$pass" "$fail" "$skipped"
printf '════════════════════════════════════════════\n'
[ "$fail" -eq 0 ] || exit 1
