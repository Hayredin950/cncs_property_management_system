import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_error.dart';
import '../../../core/files.dart';
import '../../../data/providers/core_providers.dart';
import '../../../data/providers/items_provider.dart';
import '../../../models/item.dart';
import '../../../theme/tokens.dart';
import '../../../widgets/app_button.dart';
import '../../../widgets/app_card.dart';
import '../../../widgets/feedback.dart';
import '../../../widgets/media.dart';
import '../../../widgets/states.dart';

/// The tag PNG, fetched with the auth header.
///
/// A `FutureProvider` rather than an `Image.network`, and that is not a style
/// choice: `GET /items/:id/tag` sits behind `authenticate`, so a plain URL fetch
/// sends no token and caches the 401 body as an image. The web client documents the
/// same trap, which is why both clients go through their authenticated byte helper.
final itemTagPngProvider = FutureProvider.family<Uint8List, String>((ref, itemId) async {
  final bytes = await ref.watch(itemsApiProvider).tagPng(itemId);
  return Uint8List.fromList(bytes);
});

/// §10.6's `TagStickerCard`: the on-screen preview of the printable QR sticker, plus
/// the controls around it.
///
/// **Regenerate does not change the Tag ID.** It reissues the sticker's *design* —
/// which is exactly why it needs a confirmation dialog that says so, because the
/// natural fear when you press a button like that is that every label already stuck
/// to a piece of equipment just stopped working.
class TagPanel extends ConsumerStatefulWidget {
  const TagPanel({super.key, required this.item});

  final Item item;

  @override
  ConsumerState<TagPanel> createState() => _TagPanelState();
}

class _TagPanelState extends ConsumerState<TagPanel> {
  var _busy = false;

  @override
  Widget build(BuildContext context) {
    final png = ref.watch(itemTagPngProvider(widget.item.id));

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Printable tag',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: AppColors.aauGray700,
            ),
          ),
          const SizedBox(height: AppSpace.s3),
          Center(
            child: Container(
              padding: const EdgeInsets.all(AppSpace.s3),
              decoration: BoxDecoration(
                color: Colors.white,
                border: Border.all(color: AppColors.aauGray300),
                borderRadius: AppRadius.smAll,
              ),
              child: png.when(
                loading: () => const SizedBox(
                  width: 160,
                  height: 160,
                  child: Center(child: InlineSpinner()),
                ),
                error: (error, _) => SizedBox(
                  width: 220,
                  child: InlineError(
                    error: error,
                    onRetry: () => ref.invalidate(itemTagPngProvider(widget.item.id)),
                  ),
                ),
                data: (bytes) => Column(
                  children: [
                    Image.memory(bytes, width: 160, height: 160, fit: BoxFit.contain),
                    const SizedBox(height: AppSpace.s2),
                    TagIdText(tagId: widget.item.tagId, fontSize: 13),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: AppSpace.s3),
          const Text(
            'Print it or send it on. Anyone who scans the code opens this item\u2019s public '
            'page, and the tag ID printed under it is what a lookup by hand needs.',
            style: TextStyle(fontSize: 12, color: AppColors.aauGray500, height: 1.45),
          ),
          const SizedBox(height: AppSpace.s4),
          Row(
            children: [
              Expanded(
                child: AppButton(
                  label: 'Download',
                  icon: Icons.download_outlined,
                  variant: AppButtonVariant.outline,
                  expand: true,
                  onPressed: _busy ? null : _download,
                ),
              ),
              const SizedBox(width: AppSpace.s2),
              Expanded(
                child: AppButton(
                  label: 'Share',
                  icon: Icons.ios_share_outlined,
                  variant: AppButtonVariant.secondary,
                  expand: true,
                  onPressed: _busy ? null : _share,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpace.s2),
          AppButton(
            label: 'Regenerate sticker design',
            icon: Icons.refresh,
            variant: AppButtonVariant.ghost,
            expand: true,
            loading: _busy,
            onPressed: _busy ? null : _regenerate,
          ),
          const Padding(
            padding: EdgeInsets.only(top: AppSpace.s3),
            child: Text(
              'Regenerating reissues the artwork only — the Tag ID, and every printed QR '
              'code bearing it, stays the same.',
              style: TextStyle(fontSize: 12, color: AppColors.aauGray500, height: 1.45),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _download() async {
    setState(() => _busy = true);
    try {
      final file = await ref.read(itemActionsProvider).downloadTag(
            itemId: widget.item.id,
            tagId: widget.item.tagId,
          );
      if (!mounted) return;
      showAppToast(
        context,
        message: 'Saved ${file.filename}.',
        tone: ToastTone.success,
        actionLabel: 'Open',
        onAction: () => openFile(file),
      );
    } on ApiError catch (error) {
      if (mounted) showAppToast(context, message: error.message, tone: ToastTone.error);
    } on NetworkError catch (error) {
      if (mounted) showAppToast(context, message: error.message, tone: ToastTone.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _share() async {
    setState(() => _busy = true);
    try {
      final file = await ref.read(itemActionsProvider).downloadTag(
            itemId: widget.item.id,
            tagId: widget.item.tagId,
          );
      if (!mounted) return;
      await shareFile(file, subject: 'Property tag ${widget.item.tagId}');
    } on ApiError catch (error) {
      if (mounted) showAppToast(context, message: error.message, tone: ToastTone.error);
    } on NetworkError catch (error) {
      if (mounted) showAppToast(context, message: error.message, tone: ToastTone.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _regenerate() async {
    final confirmed = await showConfirmDialog(
      context,
      title: 'Regenerate the sticker?',
      body: 'This replaces the printed sticker\u2019s design. The Tag ID itself does not '
          'change, so every sticker already attached to equipment keeps working and its '
          'QR code still opens this item.',
      confirmLabel: 'Regenerate',
      icon: Icons.refresh,
    );
    if (!confirmed || !mounted) return;

    setState(() => _busy = true);
    try {
      final tagId = await ref.read(itemActionsProvider).regenerateTag(widget.item.id);
      ref.invalidate(itemTagPngProvider(widget.item.id));
      if (!mounted) return;
      showAppToast(
        context,
        message: 'New sticker design issued for $tagId.',
        tone: ToastTone.success,
      );
    } on ApiError catch (error) {
      if (mounted) showAppToast(context, message: error.message, tone: ToastTone.error);
    } on NetworkError catch (error) {
      if (mounted) showAppToast(context, message: error.message, tone: ToastTone.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
