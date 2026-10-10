import 'package:flutter/material.dart';

import '../theme/tokens.dart';
import 'states.dart';

/// The content region every screen in the authenticated shell uses.
///
/// It encodes the shell's own rhythm (§5.5 shell C): page title, optional primary
/// action, a hairline, then the content — so a screen cannot accidentally ship a
/// different one. Two content widths are offered because §5.4 distinguishes them:
/// data-dense lists get the full width, while a form or a single item caps at
/// 640pt, since "a form or one item card doesn't need 1280px just because the
/// monitor has it" — and on a phone that cap is simply not reached.
class PageScaffold extends StatelessWidget {
  const PageScaffold({
    super.key,
    required this.title,
    this.subtitle,
    this.trailing,
    this.children,
    this.body,
    this.maxWidth = 640,
    this.flush = false,
    this.padBottom = AppSpace.s10,
    this.onRefresh,
  });

  final String title;
  final String? subtitle;

  /// The header's trailing control — usually one primary action.
  final Widget? trailing;

  /// Content that scrolls under the header. Use this or [body], not both.
  final List<Widget>? children;

  /// A pre-built body, for a screen that needs a `CustomScrollView` of its own
  /// (the item detail's tabs, the scan screen's fixed viewport).
  final Widget? body;

  /// §5.4. `640` for forms and single records, `1280` for lists and dashboards.
  final double maxWidth;

  /// Drops the title block and the hairline. Used by the tabbed item detail,
  /// where the tabs own the heading.
  final bool flush;

  final double padBottom;

  /// Wires a pull-to-refresh gesture. On a phone this is the refresh affordance,
  /// so every screen that displays server state should pass it.
  final Future<void> Function()? onRefresh;

  @override
  Widget build(BuildContext context) {
    final content = ConstrainedBox(
      constraints: BoxConstraints(maxWidth: maxWidth),
      child: body ??
          Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final (index, child) in (children ?? const <Widget>[]).indexed) ...[
                if (index > 0) const SizedBox(height: AppSpace.stack),
                child,
              ],
            ],
          ),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!flush) _header(context),
        Expanded(
          child: onRefresh == null
              ? _scroller(content)
              : RefreshIndicator(
                  color: AppColors.brand600,
                  onRefresh: onRefresh!,
                  child: _scroller(content),
                ),
        ),
      ],
    );
  }

  Widget _scroller(Widget content) => SingleChildScrollView(
        physics: onRefresh == null
            ? const ClampingScrollPhysics()
            : const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(
          AppSpace.gutter,
          flush ? AppSpace.s4 : AppSpace.s4,
          AppSpace.gutter,
          padBottom,
        ),
        child: Center(
          child: Align(
            alignment: Alignment.topCenter,
            child: content,
          ),
        ),
      );

  Widget _header(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(bottom: BorderSide(color: AppColors.aauGrayLine)),
      ),
      padding: const EdgeInsets.fromLTRB(
        AppSpace.gutter,
        AppSpace.s3,
        AppSpace.gutter,
        AppSpace.s3,
      ),
      child: Center(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: maxWidth),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w600,
                        color: AppColors.aauGray900,
                        height: 1.25,
                      ),
                    ),
                    if (subtitle != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        subtitle!,
                        style: const TextStyle(
                          fontSize: 13,
                          color: AppColors.aauGray500,
                          height: 1.4,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              if (trailing != null) ...[
                const SizedBox(width: AppSpace.s3),
                trailing!,
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// An `h2` inside a page, with an optional trailing action ("View all →").
class SectionHeader extends StatelessWidget {
  const SectionHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.actionLabel,
    this.onAction,
    this.icon,
  });

  final String title;
  final String? subtitle;
  final String? actionLabel;
  final VoidCallback? onAction;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpace.s3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 18, color: AppColors.aauGray500),
            const SizedBox(width: AppSpace.s2),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: AppColors.aauGray900,
                  ),
                ),
                if (subtitle != null)
                  Text(
                    subtitle!,
                    style: const TextStyle(
                      fontSize: 12.5,
                      color: AppColors.aauGray500,
                      height: 1.4,
                    ),
                  ),
              ],
            ),
          ),
          if (actionLabel != null && onAction != null)
            TextButton(
              onPressed: onAction,
              style: TextButton.styleFrom(
                foregroundColor: AppColors.brand700,
                padding: const EdgeInsets.symmetric(horizontal: AppSpace.s2),
                minimumSize: const Size(0, 36),
              ),
              child: Text(actionLabel!, style: const TextStyle(fontSize: 13.5)),
            ),
        ],
      ),
    );
  }
}

/// A screen-level failure that replaces the whole content region, with the shell
/// chrome intact so the user can still navigate away. A "the API is down" screen
/// that also removes the tab bar turns a recoverable error into a dead end.
class PageError extends StatelessWidget {
  const PageError({super.key, required this.error, this.onRetry});

  final Object error;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.all(AppSpace.gutter),
        child: ErrorState(error: error, onRetry: onRetry),
      );
}
