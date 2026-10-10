import 'package:flutter/material.dart';

import '../core/api/api_error.dart';
import '../theme/tokens.dart';

/// The three "nothing to show yet" states (§7, §8, §11).
///
/// The rule that shapes this file is §7's split between a **skeleton** and a
/// **spinner**, which are not interchangeable: a skeleton matches the known shape
/// of the content about to arrive and is used for every list/detail fetch, while a
/// spinner is only for an action of unknown duration inside a control that already
/// exists. So there is no "full page spinner" here at all — a screen that would
/// have wanted one gets a skeleton instead.

/// A shimmering placeholder block. The animation exists to say "this is loading",
/// not to entertain — and it collapses to a flat block under
/// `prefers-reduced-motion`.
class SkeletonBox extends StatefulWidget {
  const SkeletonBox({
    super.key,
    this.width,
    this.height = 14,
    this.radius = AppRadius.sm,
  });

  final double? width;
  final double height;
  final double radius;

  @override
  State<SkeletonBox> createState() => _SkeletonBoxState();
}

class _SkeletonBoxState extends State<SkeletonBox> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  );

  @override
  void initState() {
    super.initState();
    _controller.repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reduced = MediaQuery.disableAnimationsOf(context);

    return SizedBox(
      width: widget.width,
      height: widget.height,
      child: reduced
          ? _bar(const Color(0xFFE7EAEF))
          : FadeTransition(
              opacity: Tween<double>(begin: 0.55, end: 1).animate(
                CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
              ),
              child: _bar(const Color(0xFFE7EAEF)),
            ),
    );
  }

  Widget _bar(Color color) => DecoratedBox(
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(widget.radius),
        ),
      );
}

/// The card-shaped skeleton used by every list — the shape of an `ItemCard`, a request
/// row, an audit row.
///
/// [height] is a **minimum**, not a fixed box, and that is a correction rather than a
/// preference: an earlier version subtracted its padding from a hard height and then
/// laid out a fixed set of lines inside it, so any call site asking for a card shorter
/// than ~96px got a `RenderFlex` overflow — yellow-and-black stripes in debug, clipped
/// content in release. A skeleton that only works at one size is a skeleton that will
/// be wrong in the next list someone adds.
class SkeletonList extends StatelessWidget {
  const SkeletonList({super.key, this.count = 5, this.height = 96});

  final int count;

  /// The intended card height. The thumbnail scales to it, and the card grows if the
  /// text lines need more room rather than overflowing.
  final double height;

  @override
  Widget build(BuildContext context) {
    final thumb = (height - AppSpace.s8).clamp(28.0, 64.0);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var index = 0; index < count; index++) ...[
          if (index > 0) const SizedBox(height: AppSpace.stack),
          ConstrainedBox(
            constraints: BoxConstraints(minHeight: height),
            child: Container(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: AppRadius.mdAll,
                border: Border.all(color: AppColors.aauGray200),
              ),
              padding: const EdgeInsets.all(AppSpace.cardPadding),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SkeletonBox(width: thumb, height: thumb, radius: AppRadius.sm),
                  const SizedBox(width: AppSpace.s3),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const SkeletonBox(height: 13, width: 180),
                        const SizedBox(height: AppSpace.s2),
                        SkeletonBox(
                          height: 11,
                          width: MediaQuery.sizeOf(context).width * 0.4,
                        ),
                        const SizedBox(height: AppSpace.s3),
                        const SkeletonBox(height: 18, width: 84, radius: 999),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }
}

/// The detail-page skeleton — photo block, title, then the field-group rhythm.
class SkeletonDetail extends StatelessWidget {
  const SkeletonDetail({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AspectRatio(
          aspectRatio: 4 / 3,
          child: SkeletonBox(height: double.infinity, radius: AppRadius.md),
        ),
        const SizedBox(height: AppSpace.s4),
        const SkeletonBox(height: 20, width: 240),
        const SizedBox(height: AppSpace.s2),
        const SkeletonBox(height: 14, width: 160),
        const SizedBox(height: AppSpace.s6),
        for (var group = 0; group < 3; group++) ...[
          const SkeletonBox(height: 12, width: 90),
          const SizedBox(height: AppSpace.s3),
          const SkeletonBox(height: 14, width: double.infinity),
          const SizedBox(height: AppSpace.s2),
          const SkeletonBox(height: 14, width: 220),
          const SizedBox(height: AppSpace.s6),
        ],
      ],
    );
  }
}

/// A spinner for an action *inside a control that already exists*. Named to make
/// the wrong use obvious: if you are reaching for this to fill a page, you want a
/// skeleton.
class InlineSpinner extends StatelessWidget {
  const InlineSpinner({super.key, this.size = 20, this.color});

  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: size,
        height: size,
        child: CircularProgressIndicator(
          strokeWidth: 2,
          color: color ?? AppColors.brand600,
        ),
      );
}

/// A centred spinner for the one case a skeleton cannot serve: an overlay over
/// content that is already on screen and being replaced.
class LoadingOverlay extends StatelessWidget {
  const LoadingOverlay({super.key, this.label});

  final String? label;

  @override
  Widget build(BuildContext context) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const InlineSpinner(size: 26),
            if (label != null) ...[
              const SizedBox(height: AppSpace.s3),
              Text(
                label!,
                style: const TextStyle(color: AppColors.aauGray500, fontSize: 13.5),
              ),
            ],
          ],
        ),
      );
}

/// §11's empty states: icon + heading + one line of body copy + an optional
/// primary action. Copy is specific to *why* the list is empty — "no items yet"
/// and "no items match these filters" are two different EmptyStates, which is why
/// [title] and [body] are required rather than defaulted. A generic "Nothing
/// here" is the failure this component exists to prevent.
class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    required this.body,
    this.actionLabel,
    this.onAction,
    this.compact = false,
  });

  final IconData icon;
  final String title;
  final String body;
  final String? actionLabel;
  final VoidCallback? onAction;

  /// For an empty state inside an already-bounded card or sheet.
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: EdgeInsets.symmetric(
          horizontal: AppSpace.s6,
          vertical: compact ? AppSpace.s6 : AppSpace.s10,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: const BoxDecoration(
                color: AppColors.aauGray100,
                shape: BoxShape.circle,
              ),
              child: Icon(icon, size: 24, color: AppColors.aauGray400),
            ),
            const SizedBox(height: AppSpace.s4),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: AppColors.aauGray900,
              ),
            ),
            const SizedBox(height: AppSpace.stackTight),
            Text(
              body,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 13.5, color: AppColors.aauGray500, height: 1.45),
            ),
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: AppSpace.s5),
              OutlinedButton.icon(
                onPressed: onAction,
                icon: const Icon(Icons.refresh, size: 18),
                label: Text(actionLabel!),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// §8's `ErrorState` with its sub-variants. Each one has its own icon and lead
/// sentence, and then — the part that matters — **the server's own `error` string
/// is shown verbatim**, never paraphrased. A `409` that says exactly which request
/// already exists is worth more than any wording this app could invent.
class ErrorState extends StatelessWidget {
  const ErrorState({super.key, required this.error, this.onRetry, this.compact = false});

  final Object error;
  final VoidCallback? onRetry;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final (icon, lead) = _variant(error);
    final detail = describeError(error);

    return Center(
      child: Padding(
        padding: EdgeInsets.symmetric(
          horizontal: AppSpace.s6,
          vertical: compact ? AppSpace.s6 : AppSpace.s10,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: const BoxDecoration(
                color: AppColors.danger50,
                shape: BoxShape.circle,
              ),
              child: Icon(icon, size: 24, color: AppColors.danger600),
            ),
            const SizedBox(height: AppSpace.s4),
            Text(
              lead,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: AppColors.aauGray900,
              ),
            ),
            const SizedBox(height: AppSpace.stackTight),
            // Verbatim, and selectable — someone pasting this into a support
            // message should not have to retype it.
            SelectableText(
              detail,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 13.5, color: AppColors.aauGray600, height: 1.45),
            ),
            if (onRetry != null) ...[
              const SizedBox(height: AppSpace.s5),
              OutlinedButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh, size: 18),
                label: const Text('Try again'),
              ),
            ],
          ],
        ),
      ),
    );
  }

  (IconData, String) _variant(Object error) {
    if (error is NetworkError) {
      return (Icons.wifi_off_outlined, 'You appear to be offline');
    }
    if (error is ApiError) {
      return switch (error.status) {
        401 => (Icons.lock_outline, 'Your session has ended'),
        403 => (Icons.gpp_maybe_outlined, 'You do not have access to this'),
        404 => (Icons.search_off_outlined, 'Not found'),
        409 => (Icons.priority_high_outlined, 'That conflicts with an existing record'),
        410 => (Icons.archive_outlined, 'This item is no longer in service'),
        >= 500 => (Icons.cloud_off_outlined, 'The server had a problem'),
        _ => (Icons.error_outline, 'Something went wrong'),
      };
    }
    return (Icons.error_outline, 'Something went wrong');
  }
}

/// An inline failure banner, for a failure that did **not** consume the whole
/// screen — a mutation that failed in a sheet, a login error, a form's submit
/// error. Deliberately not a toast: a toast disappears, and an error the user
/// still needs to act on should stay put.
class InlineError extends StatelessWidget {
  const InlineError({super.key, required this.error, this.onRetry, this.retryLabel = 'Retry'});

  final Object error;
  final VoidCallback? onRetry;
  final String retryLabel;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpace.s3),
      decoration: BoxDecoration(
        color: AppColors.danger50,
        borderRadius: AppRadius.smAll,
        border: Border.all(color: AppColors.danger200),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.error_outline, size: 18, color: AppColors.danger700),
          const SizedBox(width: AppSpace.s2),
          Expanded(
            child: Text(
              describeError(error),
              style: const TextStyle(
                fontSize: 13.5,
                color: AppColors.danger700,
                height: 1.4,
              ),
            ),
          ),
          if (onRetry != null)
            TextButton(
              onPressed: onRetry,
              style: TextButton.styleFrom(
                foregroundColor: AppColors.danger700,
                padding: const EdgeInsets.symmetric(horizontal: AppSpace.s2),
                minimumSize: const Size(0, 32),
              ),
              child: Text(retryLabel),
            ),
        ],
      ),
    );
  }
}

/// A calm informational note — the "Dates are in UTC" hint, the "disposed items
/// are reachable only through Reports" explanation, the read-only banner on a
/// disposed item's form. Not an error, and styled so it cannot be mistaken for one.
class InfoNote extends StatelessWidget {
  const InfoNote({super.key, required this.message, this.icon = Icons.info_outline, this.tone = InfoTone.info});

  final String message;
  final IconData icon;
  final InfoTone tone;

  @override
  Widget build(BuildContext context) {
    final (background, border, foreground) = switch (tone) {
      InfoTone.info => (AppColors.brand50, AppColors.brand200, AppColors.brand900),
      InfoTone.warning => (AppColors.warning50, AppColors.warning200, AppColors.warning700),
      InfoTone.neutral => (AppColors.aauGray100, AppColors.aauGray200, AppColors.aauGray700),
    };

    return Container(
      padding: const EdgeInsets.all(AppSpace.s3),
      decoration: BoxDecoration(
        color: background,
        borderRadius: AppRadius.smAll,
        border: Border.all(color: border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: foreground),
          const SizedBox(width: AppSpace.s2),
          Expanded(
            child: Text(
              message,
              style: TextStyle(fontSize: 13.5, color: foreground, height: 1.45),
            ),
          ),
        ],
      ),
    );
  }
}

enum InfoTone { info, warning, neutral }
