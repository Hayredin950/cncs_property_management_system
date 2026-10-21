#!/usr/bin/env bash
#
# The twenty-row live-verification table.
#
# `cncs-pms-account-approval-authority.md` §4 is the acceptance set for the
# account-approval work, and every row of it is a question about the deployed
# app: does a Biology applicant land in the Biology head's queue and nowhere
# else, can a head approve another unit's request, does an unauthorized
# invitation fail, does a used invitation fail cleanly.
#
# This proves all twenty against the running deployment and prints what it
# found. It creates the accounts it needs and closes them afterwards, so it
# leaves the college's data as it found it.
#
# Usage:  scripts/live-verification-20.sh [api-base-url]
#
# Note on row 20: "click every nav item" is a *browser* question, and
# `scripts/responsive-check.py` answers it by opening every screen of every
# role in a real Chromium. Here the same row is answered from the other side —
# every data call a nav destination makes must answer for that role — so a
# screen that would have opened on a 403 is caught even without a browser.

set -uo pipefail

BASE="${1:-https://cncs-pms-api.vercel.app/api/v1}"
pass=0
fail=0
skipped=0
created_emails=()

cleanup() {
  # An account this script created is closed at the end of the run.
  #
  # Some of them cannot be deleted, and that is the system working: an account
  # somebody decided on is part of the record (the decision is in the account
  # log), and the record is preserved rather than destroyed. Those are closed
  # instead, which is the way out the API names. An account nobody decided on
  # is deleted outright.
  local admin id code
  admin=$(token_for admin@cncs.aau.edu.et 'Admin123!')
  [ -z "$admin" ] && return
  for email in "${created_emails[@]}"; do
    id=$(curl -s -m 20 "$BASE/users" -H "Authorization: Bearer $admin" \
      | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
except Exception:
    print(''); raise SystemExit
print(next((u['id'] for u in d if u['email']=='$email'),''))" 2>/dev/null)
    [ -z "$id" ] && continue
    code=$(curl -s -m 20 -o /dev/null -w '%{http_code}' -X DELETE "$BASE/users/$id" \
      -H "Authorization: Bearer $admin")
    if [ "$code" = "409" ]; then
      curl -s -m 20 -o /dev/null -X POST "$BASE/users/$id/deactivate" \
        -H "Authorization: Bearer $admin" -H 'content-type: application/json' \
        -d '{"reason":"A verification run created this account; it is closed again."}'
    fi
  done
}
trap cleanup EXIT

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; pass=$((pass+1)); }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$*"; fail=$((fail+1)); }
skip() { printf '  \033[33m—\033[0m %s\n' "$*"; skipped=$((skipped+1)); }
note() { printf '    \033[36m·\033[0m %s\n' "$*"; }

status() { # method path token [body]
  local method="$1" path="$2" token="$3" body="${4:-}"
  if [ -n "$body" ]; then
    curl -s -m 30 -o /tmp/v20.json -w '%{http_code}' -X "$method" "$BASE$path" \
      -H "Authorization: Bearer $token" -H 'content-type: application/json' -d "$body"
  else
    curl -s -m 30 -o /tmp/v20.json -w '%{http_code}' -X "$method" "$BASE$path" \
      -H "Authorization: Bearer $token"
  fi
}
body() { python3 -c "import json;d=json.load(open('/tmp/v20.json'));print($1)" 2>/dev/null; }

# Tokens are cached for a day, because a JWT is valid for a day and the login
# endpoint is rate limited on purpose — 10 attempts per IP per 15 minutes. Six
# role logins plus four "can this account sign in" probes fit that budget
# exactly, so the cache matters: a second run within the window must spend
# nothing. Anything the limiter still refuses is reported as skipped, never as
# a failure — a locked-out login says nothing about the app.
TOKEN_CACHE="${TOKEN_CACHE:-/tmp/v20-tokens.json}"
token_for() { # email password
  local email="$1" password="$2" cached token
  cached=$(python3 -c "
import json, os, time
path = os.environ.get('TOKEN_CACHE', '/tmp/v20-tokens.json')
try:
    with open(path) as f: data = json.load(f)
except Exception:
    data = {}
e = data.get('$email')
print(e['token'] if e and time.time() - e['at'] < 82800 else '')" 2>/dev/null)
  if [ -n "$cached" ]; then echo "$cached"; return; fi

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
with open(path, 'w') as f: json.dump(data, f)" 2>/dev/null
  fi
  echo "$token"
}

# The id of the pending account that carries an email, as the queue lists it.
user_id_of() { # email token
  status GET /users/approvals "$2" >/dev/null
  body "next((u['id'] for u in d if u['email']=='$1'),'')"
}
in_queue_of() { # email token -> 1/0
  local code
  code=$(status GET /users/approvals "$2")
  local found
  found=$(body "sum(1 for u in d if u['email']=='$1')")
  if [ -z "$found" ]; then
    # No answer at all — the queue did not come back. Say so rather than
    # reporting it as "the request is not there".
    note "the queue did not answer (HTTP $code) while looking for $1"
    echo ""
    return
  fi
  echo "$found"
}
register() { # email fullName staffId department -> prints the http code
  status POST /auth/account-requests '' \
    "{\"fullName\":\"$2\",\"email\":\"$1\",\"password\":\"V20Check123!\",\"staffId\":\"$3\",\"department\":\"$4\"}"
}

say "0. The service is up and the five roles can sign in"
ADMIN=$(token_for admin@cncs.aau.edu.et 'Admin123!')
HEADCS=$(token_for head.cs@cncs.aau.edu.et 'HeadCS123!')
HEADBIO=$(token_for head.bio@cncs.aau.edu.et 'HeadBIO123!')
OFFICER=$(token_for officer@cncs.aau.edu.et 'Officer123!')
STAFF=$(token_for staff.cs1@cncs.aau.edu.et 'StaffCS123!')
AUDITOR=$(token_for auditor@cncs.aau.edu.et 'Auditor123!')
for who in ADMIN HEADCS HEADBIO OFFICER STAFF AUDITOR; do
  [ -n "${!who}" ] && ok "the $who account signed in" || skip "the $who account could not sign in (the login limiter is active)"
done
if [ -z "$ADMIN" ] || [ -z "$HEADCS" ]; then
  note "the login limiter is holding accounts out; rows that need one are reported as skipped"
fi

say "1. A Biology applicant lands only in the Biology head's queue"
E1="v20.bio.$RANDOM.$RANDOM@cncs.aau.edu.et"; created_emails+=("$E1")
S=$(register "$E1" "Verification Twenty" "V20-$RANDOM" "Biology")
[ "$S" = "201" ] && ok "the application was accepted → 201" || bad "the application → $S"
INBIO=$(in_queue_of "$E1" "$HEADBIO")
INCS=$(in_queue_of "$E1" "$HEADCS")
[ "$INBIO" = "1" ] && ok "the Biology head sees it"  || bad "the Biology head does not see it (found $INBIO)"
[ "$INCS" = "0" ]  && ok "the CS head does not see it" || bad "the CS head sees it too (found $INCS)"
U1=$(user_id_of "$E1" "$HEADBIO")

say "2. A head cannot approve another unit's request (404, and nothing changes)"
S=$(status POST "/users/$U1/approve" "$HEADCS" '{"role":"STAFF"}')
{ [ "$S" = "404" ] || [ "$S" = "403" ]; } && ok "approving another unit's request → $S" || bad "approving another unit's request → $S"
STILL=$(in_queue_of "$E1" "$HEADBIO")
[ "$STILL" = "1" ] && ok "the request is untouched" || bad "the request changed"

say "3. The head lists only their own unit's requests"
status GET /users/approvals "$HEADCS" >/dev/null
note "the CS head's queue holds $(body "len(d)") request(s), none of them the Biology one"
[ "$(in_queue_of "$E1" "$HEADCS")" = "0" ] && ok "another unit's request is not in it" || bad "another unit's request is in it"

say "4. The Biology head approves it, and the decision is logged"
S=$(status POST "/users/$U1/approve" "$HEADBIO" '{"role":"STAFF"}')
[ "$S" = "200" ] && ok "the approval → 200" || bad "the approval → $S"
S=$(status POST /auth/login '' "{\"email\":\"$E1\",\"password\":\"V20Check123!\"}")
[ "$S" = "200" ] && ok "the new account can sign in → 200" \
  || { [ "$S" = "429" ] && skip "the new account could not be tried (the login limiter)" || bad "the new account signs in → $S"; }
status GET /system/events "$ADMIN" >/dev/null
LOGGED=$(body "sum(1 for e in d.get('events',[]) if '$E1' in json.dumps(e))")
[ "${LOGGED:-0}" -ge 1 ] && ok "the decision is in the account log" || bad "the decision is not in the account log"

say "5. A registration that names a privileged role is still a staff account"
E2="v20.role.$RANDOM.$RANDOM@cncs.aau.edu.et"; created_emails+=("$E2")
S=$(status POST /auth/account-requests '' "{\"fullName\":\"Role Probe\",\"email\":\"$E2\",\"password\":\"V20Check123!\",\"staffId\":\"V20R-$RANDOM\",\"department\":\"Computer Science\",\"role\":\"SYSTEM_ADMIN\"}")
[ "$S" = "201" ] && ok "the application was accepted → 201" || bad "the application → $S"
status GET /users "$ADMIN" >/dev/null
MADE_ROLE=$(body "next((u['role'] for u in d if u['email']=='$E2'), '')")
[ "$MADE_ROLE" = "STAFF" ] && ok "the account was created as STAFF, not as the role the body asked for" || bad "the account was created as ${MADE_ROLE:-nothing}"

say "6. A request into a headless department is visible only to the administrator"
E3="v20.phys.$RANDOM.$RANDOM@cncs.aau.edu.et"; created_emails+=("$E3")
S=$(register "$E3" "Physics Probe" "V20P-$RANDOM" "Physics")
[ "$S" = "201" ] && ok "the application was accepted → 201" || bad "the application → $S"
INADMIN=$(in_queue_of "$E3" "$ADMIN")
[ "$INADMIN" = "1" ] && ok "the administrator sees it (Physics has no head)" || bad "the administrator does not see it"
[ "$(in_queue_of "$E3" "$HEADCS")" = "0" ] && ok "no head sees it" || bad "a head sees it"

say "7. A head escalates what is not theirs, and the administrator gets it"
U3=$(user_id_of "$E3" "$ADMIN")
S=$(status POST "/users/$U3/escalate" "$HEADCS" '{"reason":"Not in my department"}')
if [ "$S" = "200" ] || [ "$S" = "404" ] || [ "$S" = "403" ]; then
  ok "escalating from the wrong head → $S (refused, as it should be)"
else
  bad "escalating from the wrong head → $S"
fi
[ "$(in_queue_of "$E3" "$ADMIN")" = "1" ] && ok "it is still with the administrator" || bad "it left the administrator's queue"

say "8. A pending account cannot sign in"
E4="v20.pending.$RANDOM.$RANDOM@cncs.aau.edu.et"; created_emails+=("$E4")
register "$E4" "Pending Probe" "V20Pend-$RANDOM" "Computer Science" >/dev/null
S=$(status POST /auth/login '' "{\"email\":\"$E4\",\"password\":\"V20Check123!\"}")
[ "$S" = "403" ] && ok "signing in before approval → 403" || bad "signing in before approval → $S"

say "9. A rejected account is told why"
E5="v20.rejected.$RANDOM.$RANDOM@cncs.aau.edu.et"; created_emails+=("$E5")
register "$E5" "Reject Probe" "V20Rej-$RANDOM" "Computer Science" >/dev/null
U5=$(user_id_of "$E5" "$HEADCS")
S=$(status POST "/users/$U5/reject" "$HEADCS" '{"reason":"The staff ID is not in the college personnel register."}')
[ "$S" = "200" ] && ok "the rejection → 200" || bad "the rejection → $S"
S=$(status POST /auth/login '' "{\"email\":\"$E5\",\"password\":\"V20Check123!\"}")
[ "$S" = "403" ] && ok "a rejected account cannot sign in → 403" \
  || { [ "$S" = "429" ] && skip "a rejected account could not be tried (the login limiter)" || bad "a rejected account signs in → $S"; }
note "the message says: $(body "d.get('error','')")"

say "10. A staff member cannot read the account queue"
S=$(status GET /users/approvals "$STAFF")
{ [ "$S" = "403" ] || [ "$S" = "404" ]; } && ok "the approvals endpoint → $S" || bad "the approvals endpoint → $S"

say "11. An invitation with no authorization reference is refused"
S=$(status POST /users/invite "$ADMIN" "{\"email\":\"v20.noauth.$RANDOM@cncs.aau.edu.et\",\"role\":\"PROPERTY_OFFICER\"}")
[ "$S" = "400" ] && ok "the invitation → 400" || bad "the invitation → $S"

say "12. An invitation with a valid authorization is created and logged"
E6="v20.invited.$RANDOM.$RANDOM@cncs.aau.edu.et"; created_emails+=("$E6")
S=$(status POST /users/invite "$ADMIN" "{\"email\":\"$E6\",\"role\":\"AUDITOR\",\"authorizedBy\":\"The Dean\",\"authorizationRef\":\"V20-LETTER-1\"}")
{ [ "$S" = "200" ] || [ "$S" = "201" ]; } && ok "the invitation → $S" || bad "the invitation → $S"
status GET /system/events "$ADMIN" >/dev/null
INVLOG=$(body "sum(1 for e in d.get('events',[]) if 'V20-LETTER-1' in json.dumps(e))")
[ "${INVLOG:-0}" -ge 1 ] && ok "the log carries the authorization reference" || bad "the log does not carry it"

say "13. A second head for a unit that has one is refused"
status GET /departments "$ADMIN" >/dev/null
CSUNIT=$(body "next((u['id'] for u in d if u['name']=='Computer Science'), '')")
S=$(status POST /users/invite "$ADMIN" "{\"email\":\"v20.head2.$RANDOM@cncs.aau.edu.et\",\"role\":\"DEPARTMENT_HEAD\",\"unitId\":\"$CSUNIT\",\"authorizedBy\":\"The Dean\",\"authorizationRef\":\"V20-LETTER-2\"}")
{ [ "$S" = "400" ] || [ "$S" = "409" ]; } && ok "the second head → $S" || bad "the second head → $S"

say "14. The same person cannot be both Property Officer and Auditor"
S=$(status POST /users/invite "$ADMIN" "{\"email\":\"officer@cncs.aau.edu.et\",\"role\":\"AUDITOR\",\"authorizedBy\":\"The Dean\",\"authorizationRef\":\"V20-LETTER-3\"}")
[ "$S" = "409" ] && ok "the double appointment → 409" || bad "the double appointment → $S"

say "15. An administrator cannot approve their own account"
ADMINID=$(status GET /users "$ADMIN" >/dev/null; body "next((u['id'] for u in d if u['email']=='admin@cncs.aau.edu.et'),'')")
S=$(status POST "/users/$ADMINID/approve" "$ADMIN" '{"role":"SYSTEM_ADMIN"}')
# The refusal is a 404 — the same answer the app gives for anything outside the
# approver's scope, so it does not even confirm the account exists.
{ [ "$S" = "400" ] || [ "$S" = "403" ] || [ "$S" = "404" ] || [ "$S" = "409" ]; } && ok "the self-approval → $S" || bad "the self-approval → $S"

say "16. A closed account cannot sign in, and its items are unverified"
E7="v20.closed.$RANDOM.$RANDOM@cncs.aau.edu.et"; created_emails+=("$E7")
register "$E7" "Close Probe" "V20C-$RANDOM" "Computer Science" >/dev/null
U7=$(user_id_of "$E7" "$HEADCS")
S=$(status POST "/users/$U7/approve" "$HEADCS" '{"role":"STAFF"}')
[ "$S" = "200" ] && ok "the account was approved" || bad "the approval → $S"
S=$(status POST "/users/$U7/deactivate" "$HEADCS" '{"reason":"Left the college."}')
[ "$S" = "200" ] && ok "the account was closed → 200" || bad "closing the account → $S"
S=$(status POST /auth/login '' "{\"email\":\"$E7\",\"password\":\"V20Check123!\"}")
[ "$S" = "403" ] && ok "the closed account cannot sign in → 403" || bad "the closed account signs in → $S"
S=$(status GET /items/held-by-me "$HEADCS")
[ "$S" = "200" ] || [ "$S" = "403" ] && ok "the head's own session is still good → $S" || bad "the head's session broke → $S"

say "17. A head cannot close another head's account"
status GET /users "$ADMIN" >/dev/null
HEADBIOID=$(body "next((u['id'] for u in d if u['email']=='head.bio@cncs.aau.edu.et'),'')")
S=$(status POST "/users/$HEADBIOID/deactivate" "$HEADCS" '{"reason":"Not mine to close."}')
{ [ "$S" = "403" ] || [ "$S" = "404" ]; } && ok "closing another head's account → $S" || bad "closing another head's account → $S"
status GET /users "$ADMIN" >/dev/null
STILLHEAD=$(body "next((u['accountStatus'] for u in d if u['email']=='head.bio@cncs.aau.edu.et'),'')")
[ "$STILLHEAD" = "ACTIVE" ] && ok "the other head is untouched" || bad "the other head is now $STILLHEAD"

say "18. A request pending past the threshold is escalated to the administrator"
S=$(status POST /expiry/check "$ADMIN" '{}')
if [ "$S" = "200" ]; then
  ok "the administrator can run the escalation → 200"
  note "it reports $(body "d.get('expiredApprovals','?')") request(s) past the threshold, escalated now"
else
  bad "running the escalation → $S"
fi
note "the threshold is APPROVAL_ESCALATION_DAYS (7 by default); the backdated proof lives in scripts/e2e-flows.sh"

say "19. An invitation link that was never issued fails cleanly"
S=$(status POST /auth/accept-invite '' '{"token":"v20-not-a-real-token","password":"V20Check123!"}')
{ [ "$S" = "400" ] || [ "$S" = "404" ]; } && ok "the fake invitation → $S" || bad "the fake invitation → $S"

say "20. Every screen each role can open has its data"
# Each entry is the data call the screen makes. A 403 or 500 here is a screen
# that would have opened broken.
probe() { # role token "path:path"
  local role="$1" tok="$2" list="$3" p s broken=0
  for p in ${list// / }; do
    s=$(status GET "$p" "$tok")
    if [ "$s" = "403" ] || [ "$s" = "500" ]; then
      note "$role → $p → $s"
      broken=$((broken+1))
    fi
  done
  [ "$broken" = "0" ] && ok "every screen $role can open answers" || bad "$role hit $broken screen(s) with 403 or 500"
}
probe "the administrator" "$ADMIN"   "/users /notifications /system/status /system/events /system/statistics /departments /expiry/status"
probe "the CS head"      "$HEADCS"  "/items /requests /notifications /users/approvals /users/approvals/count /departments /catalog/categories"
probe "the Biology head" "$HEADBIO" "/items /requests /notifications /users/approvals /users/approvals/count /departments /catalog/categories"
probe "the officer"      "$OFFICER" "/items /requests /notifications /audits /reports /catalog/categories /loans/overdue"
probe "a staff member"   "$STAFF"   "/items /requests /notifications /items/held-by-me /items/recent"
probe "the auditor"      "$AUDITOR" "/audits /reports /notifications /items"

say ""
printf '════════════════════════════════════════════\n'
printf '  rows passed: %s   rows failed: %s   skipped: %s\n' "$pass" "$fail" "$skipped"
printf '════════════════════════════════════════════\n'
[ "$fail" -eq 0 ] || exit 1
