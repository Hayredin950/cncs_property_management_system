import 'package:cncs_pms_mobile/models/enums.dart';
import 'package:cncs_pms_mobile/models/permissions.dart';
import 'package:flutter_test/flutter_test.dart';

/// `reviewQueueStatuses` is the single answer to "what is waiting on this
/// viewer's decision". The dashboard tile, its preview list and the Requests
/// screen all ask it, so the count and the list cannot disagree — which they did
/// while every half asked for `PENDING` alone.
void main() {
  test('the officer reviews both transfer stages and the return handshake', () {
    expect(
      reviewQueueStatuses(Role.propertyOfficer),
      'PENDING,PENDING_STAGE1,PENDING_STAGE2,RETURN_PENDING_CONFIRMATION',
    );
  });

  test('a head reviews the stages but cannot confirm a loan return', () {
    expect(
      reviewQueueStatuses(Role.departmentHead),
      'PENDING,PENDING_STAGE1,PENDING_STAGE2',
    );
  });

  test('roles with no decision rights have no review queue', () {
    // Staff see their own filings; the auditor and admin have no asset queue.
    expect(reviewQueueStatuses(Role.staff), isNull);
    expect(reviewQueueStatuses(Role.auditor), isNull);
    expect(reviewQueueStatuses(Role.systemAdmin), isNull);
    expect(reviewQueueStatuses(null), isNull);
  });
}
