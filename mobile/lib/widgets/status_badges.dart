import 'package:flutter/material.dart';

import '../models/enums.dart';
import '../theme/tokens.dart';
import 'badge.dart';

/// §3.2's semantic status maps — `frontend/src/components/StatusBadges.tsx` in
/// Flutter. These are the **only** colour/icon pairs that may represent each
/// concept, anywhere in the app, which is why they live together in one file
/// instead of being re-decided per screen.
///
/// The Material Symbols Outlined names below are the deliberate counterparts of
/// the design system's lucide icons (§6) — `Sparkles`→`auto_awesome`, `Archive`
/// →`archive`, `PackageCheck`→`inventory_2`, and so on. The intent is identical;
/// only the glyph family differs, because that is what the Flutter SDK bundles.


class ConditionBadge extends StatelessWidget {
  const ConditionBadge({super.key, required this.condition, this.label, this.dense = false});

  final Condition condition;

  /// Set when the server sent an enum member this build does not know — then the
  /// raw string is shown verbatim rather than "Unknown".
  final String? label;

  final bool dense;

  @override
  Widget build(BuildContext context) => AppBadge(
        tone: _conditionTone(condition),
        icon: _conditionIcon(condition),
        label: label ?? condition.label,
        dense: dense,
      );
}

BadgeTone _conditionTone(Condition condition) => switch (condition) {
      Condition.newItem => BadgeTone.accent,
      Condition.good => BadgeTone.success,
      Condition.fair => BadgeTone.warning,
      Condition.damaged => BadgeTone.orange,
      Condition.beyondRepair => BadgeTone.danger,
      Condition.unknown => BadgeTone.neutral,
    };

IconData _conditionIcon(Condition condition) => switch (condition) {
      Condition.newItem => Icons.auto_awesome_outlined,
      Condition.good => Icons.thumb_up_outlined,
      Condition.fair => Icons.warning_amber_outlined,
      Condition.damaged => Icons.build_outlined,
      Condition.beyondRepair => Icons.block_outlined,
      Condition.unknown => Icons.help_outline,
    };

/// `ACTIVE` renders as a plain dot, not a full chip — disposal is a normal
/// lifecycle end, not an error, and constantly badging "in service" would just be
/// noise. `DISPOSED` gets the calm-slate chip.
class ItemStatusBadge extends StatelessWidget {
  const ItemStatusBadge({super.key, required this.status, this.label, this.dense = false});

  final ItemStatus status;
  final String? label;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    if (status == ItemStatus.active) {
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.circle, size: 9, color: AppColors.success700),
          const SizedBox(width: 6),
          Text(
            label ?? status.label,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: AppColors.success700,
            ),
          ),
        ],
      );
    }

    return AppBadge(
      tone: status == ItemStatus.disposed ? BadgeTone.neutral : BadgeTone.info,
      icon: status == ItemStatus.disposed ? Icons.archive_outlined : Icons.help_outline,
      label: label ?? status.label,
      dense: dense,
    );
  }
}

class RequestStatusBadge extends StatelessWidget {
  const RequestStatusBadge({super.key, required this.status, this.dense = false});

  final RequestStatus status;
  final bool dense;

  @override
  Widget build(BuildContext context) => AppBadge(
        tone: switch (status) {
          RequestStatus.pending => BadgeTone.warning,
          RequestStatus.approved => BadgeTone.success,
          RequestStatus.rejected => BadgeTone.danger,
          RequestStatus.unknown => BadgeTone.neutral,
        },
        icon: switch (status) {
          RequestStatus.pending => Icons.schedule_outlined,
          RequestStatus.approved => Icons.check_circle_outline,
          RequestStatus.rejected => Icons.cancel_outlined,
          RequestStatus.unknown => Icons.help_outline,
        },
        label: status.label,
        dense: dense,
      );
}

class RequestTypeBadge extends StatelessWidget {
  const RequestTypeBadge({super.key, required this.type, this.dense = false});

  final RequestType type;
  final bool dense;

  @override
  Widget build(BuildContext context) => AppBadge(
        tone: switch (type) {
          RequestType.transfer => BadgeTone.info,
          RequestType.disposal => BadgeTone.orange,
          RequestType.unknown => BadgeTone.neutral,
        },
        icon: switch (type) {
          RequestType.transfer => Icons.swap_horiz_outlined,
          RequestType.disposal => Icons.delete_outline,
          RequestType.unknown => Icons.help_outline,
        },
        label: type.label,
        dense: dense,
      );
}

class RoleBadge extends StatelessWidget {
  const RoleBadge({super.key, required this.role, this.dense = false});

  final Role role;
  final bool dense;

  @override
  Widget build(BuildContext context) => AppBadge(
        tone: switch (role) {
          Role.admin => BadgeTone.violet,
          Role.staff => BadgeTone.brand,
          Role.unknown => BadgeTone.neutral,
        },
        icon: switch (role) {
          Role.admin => Icons.verified_user_outlined,
          Role.staff => Icons.badge_outlined,
          Role.unknown => Icons.person_outline,
        },
        label: role.label,
        dense: dense,
      );
}

/// The three audit hues are deliberately *different*, not a ramp: "found but in
/// the wrong place" is a different kind of problem from "not found", not simply a
/// worse or better version of it.
class AuditResultBadge extends StatelessWidget {
  const AuditResultBadge({super.key, required this.result, this.dense = false});

  final AuditItemResult result;
  final bool dense;

  @override
  Widget build(BuildContext context) => AppBadge(
        tone: switch (result) {
          AuditItemResult.found => BadgeTone.success,
          AuditItemResult.missing => BadgeTone.danger,
          AuditItemResult.locationMismatch => BadgeTone.warning,
          AuditItemResult.unknown => BadgeTone.neutral,
        },
        icon: switch (result) {
          AuditItemResult.found => Icons.inventory_2_outlined,
          AuditItemResult.missing => Icons.production_quantity_limits_outlined,
          AuditItemResult.locationMismatch => Icons.wrong_location_outlined,
          AuditItemResult.unknown => Icons.help_outline,
        },
        label: result.label,
        dense: dense,
      );
}
