import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/theme.dart';
import '../theme/tokens.dart';

/// §8's `PhotoFrame` — a fixed 4:3 box around `photoUrl`.
///
/// `photoUrl` is a plain URL string with no validation that it resolves, so a
/// dead link is a normal outcome rather than an error: the placeholder is what
/// stops a broken-image glyph from appearing in the middle of a card. It is
/// **category-derived**, because a laptop icon on a laptop's card tells you what
/// the record is even while the photo is missing.
class PhotoFrame extends StatelessWidget {
  const PhotoFrame({
    super.key,
    required this.url,
    this.categoryName,
    this.aspectRatio = 4 / 3,
    this.radius = AppRadius.md,
    this.fit = BoxFit.cover,
    this.iconSize = 40,
  });

  final String? url;
  final String? categoryName;
  final double aspectRatio;
  final double radius;
  final BoxFit fit;
  final double iconSize;

  @override
  Widget build(BuildContext context) {
    final source = url?.trim();
    final hasPhoto = source != null && source.isNotEmpty;

    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: AspectRatio(
        aspectRatio: aspectRatio,
        child: hasPhoto
            ? CachedNetworkImage(
                imageUrl: source,
                fit: fit,
                width: double.infinity,
                // A tinted block rather than a spinner: the photo appears in place
                // of a same-sized block, so nothing on the page moves when it lands.
                placeholder: (context, _) => const ColoredBox(color: AppColors.aauGray100),
                errorWidget: (context, _, _) => _placeholder(),
              )
            : _placeholder(),
      ),
    );
  }

  Widget _placeholder() => ColoredBox(
        color: AppColors.aauGray100,
        child: Center(
          child: Icon(
            categoryIcon(categoryName),
            size: iconSize,
            color: AppColors.aauGray300,
          ),
        ),
      );

  /// A small, opinionated lookup — the point is that the *same* category always
  /// draws the *same* icon, not that every category has one. Anything unmapped
  /// falls back to the generic package glyph, which is honest.
  static IconData categoryIcon(String? categoryName) {
    final name = (categoryName ?? '').toLowerCase();
    if (name.contains('laptop') || name.contains('computer') || name.contains('desktop')) {
      return Icons.laptop_mac_outlined;
    }
    if (name.contains('monitor') || name.contains('display') || name.contains('screen')) {
      return Icons.desktop_windows_outlined;
    }
    if (name.contains('printer') || name.contains('scanner') || name.contains('copier')) {
      return Icons.print_outlined;
    }
    if (name.contains('projector')) return Icons.videocam_outlined;
    if (name.contains('network') || name.contains('router') || name.contains('switch')) {
      return Icons.router_outlined;
    }
    if (name.contains('phone') || name.contains('telephone')) {
      return Icons.phone_in_talk_outlined;
    }
    if (name.contains('furniture') ||
        name.contains('chair') ||
        name.contains('desk') ||
        name.contains('table')) {
      return Icons.chair_outlined;
    }
    if (name.contains('microscope') || name.contains('lab')) {
      return Icons.biotech_outlined;
    }
    if (name.contains('vehicle') || name.contains('car')) {
      return Icons.directions_car_outlined;
    }
    if (name.contains('camera')) return Icons.photo_camera_outlined;
    if (name.contains('tool')) return Icons.handyman_outlined;
    if (name.contains('book')) return Icons.menu_book_outlined;
    return Icons.inventory_2_outlined;
  }
}

/// A tag ID, in Geist Mono with the tracking §4 asks for, so `0`/`O` and `1`/`I`/`l`
/// read apart. `.tag-id` in the web's `tokens.css` is this rule, and it is applied
/// here rather than at each call site for exactly the same reason.
class TagIdText extends StatelessWidget {
  const TagIdText({
    super.key,
    required this.tagId,
    this.fontSize = 13,
    this.color = AppColors.aauGray700,
    this.weight = FontWeight.w600,
  });

  final String tagId;
  final double fontSize;
  final Color color;
  final FontWeight weight;

  @override
  Widget build(BuildContext context) => Text(
        tagId.toUpperCase(),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          fontFamily: AppTheme.fontMono,
          fontSize: fontSize,
          fontWeight: weight,
          letterSpacing: 0.55,
          color: color,
        ),
      );
}

/// The tag ID plus a copy control, which is "small, cheap, genuinely useful when
/// someone needs to paste a tag ID into a request or an email" (§10.2).
///
/// The icon swaps to a check for a moment on success, because a copy with no
/// feedback is indistinguishable from a copy that silently failed.
class CopyableTagId extends StatefulWidget {
  const CopyableTagId({
    super.key,
    required this.tagId,
    this.fontSize = 14,
    this.copiedMessage,
  });

  final String tagId;
  final double fontSize;

  /// Overridable so a caller can say what was copied ("Public link copied").
  final String? copiedMessage;

  @override
  State<CopyableTagId> createState() => _CopyableTagIdState();
}

class _CopyableTagIdState extends State<CopyableTagId> {
  var _copied = false;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Flexible(child: TagIdText(tagId: widget.tagId, fontSize: widget.fontSize)),
        const SizedBox(width: AppSpace.s1),
        IconButton(
          onPressed: _copy,
          tooltip: _copied ? 'Copied' : 'Copy tag ID',
          visualDensity: VisualDensity.compact,
          constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
          padding: EdgeInsets.zero,
          icon: Icon(
            _copied ? Icons.check : Icons.copy_outlined,
            size: 16,
            color: _copied ? AppColors.success600 : AppColors.aauGray400,
          ),
        ),
      ],
    );
  }

  Future<void> _copy() async {
    await Clipboard.setData(ClipboardData(text: widget.tagId.toUpperCase()));
    if (!mounted) return;
    setState(() => _copied = true);
    // A haptic tick plus the icon swap, because the toast would be noise for a
    // copy of six characters — the design system's own rule is that a toast is
    // for a mutation, and this is not one.
    HapticFeedback.selectionClick();
    await Future<void>.delayed(const Duration(milliseconds: 1400));
    if (mounted) setState(() => _copied = false);
  }
}

/// An initials-only avatar. There is no avatar upload anywhere in the system, so
/// this is the only form an avatar takes — and the background is derived from the
/// id, so the same person is always the same tint (§8).
class InitialsAvatar extends StatelessWidget {
  const InitialsAvatar({super.key, required this.initial, this.id = '', this.size = 40});

  final String initial;
  final String id;
  final double size;

  /// The tone ramp the web app uses for derived avatars. Deliberately the muted
  /// `-100`/`-700` pairs so an avatar never out-shouts the status badges beside it.
  static const List<(Color, Color)> _ramp = [
    (AppColors.brand100, AppColors.brand900),
    (AppColors.violet100, AppColors.violet700),
    (AppColors.success100, AppColors.success700),
    (AppColors.warning100, AppColors.warning700),
    (AppColors.info100, AppColors.info700),
    (AppColors.orange100, AppColors.orange700),
  ];

  @override
  Widget build(BuildContext context) {
    // A stable hash of the id, not `id.hashCode`: Dart's String hashCode is
    // randomised per process, which would repaint everyone a new colour on every
    // launch and defeat the whole point of "the same person is always the same tint".
    var hash = 0;
    for (final unit in id.codeUnits) {
      hash = (hash * 31 + unit) & 0x7fffffff;
    }
    final (background, foreground) = _ramp[hash % _ramp.length];

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(color: background, shape: BoxShape.circle),
      alignment: Alignment.center,
      child: Text(
        initial.toUpperCase(),
        style: TextStyle(
          fontSize: size * 0.4,
          fontWeight: FontWeight.w600,
          color: foreground,
        ),
      ),
    );
  }
}
