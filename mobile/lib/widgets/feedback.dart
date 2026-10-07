import 'package:flutter/material.dart';

import '../theme/tokens.dart';
import 'app_button.dart';
import 'app_fields.dart';

/// Toasts and dialogs — the design system's `Toast` and `Dialog`/`ConfirmDialog`
/// (§8), with §7's rule applied to both: **confirm before anything irreversible**,
/// and the confirmation states the specific consequence rather than "Are you sure?".
///
/// Flutter's `ScaffoldMessenger` owns the queue, so this file does not reimplement
/// stacking. What it does add is the thing the web toast has and the raw snack bar
/// does not: an icon and a tone, and the **single-slot** rule. Anything a user can
/// trigger repeatedly in a second — the audit walkthrough is the reason this exists
/// — passes `replace: true`, so a stream of scans reads as one line that stays
/// current instead of a column of near-identical toasts.
enum ToastTone { success, error, info }

void showAppToast(
  BuildContext context, {
  required String message,
  ToastTone tone = ToastTone.info,
  bool replace = false,
  VoidCallback? onAction,
  String? actionLabel,
}) {
  final messenger = ScaffoldMessenger.maybeOf(context);
  if (messenger == null) return;

  if (replace) messenger.hideCurrentSnackBar();

  final (icon, color) = switch (tone) {
    ToastTone.success => (Icons.check_circle_outline, AppColors.success500),
    ToastTone.error => (Icons.error_outline, AppColors.danger500),
    ToastTone.info => (Icons.info_outline, AppColors.brand300),
  };

  messenger.showSnackBar(
    SnackBar(
      // §8: success/info auto-dismiss at 5s; errors get 8s because someone reading
      // a failure needs longer than someone reading a confirmation.
      duration: Duration(seconds: tone == ToastTone.error ? 8 : 5),
      content: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 19, color: color),
          const SizedBox(width: AppSpace.s2),
          Expanded(child: Text(message)),
        ],
      ),
      action: onAction == null
          ? null
          : SnackBarAction(label: actionLabel ?? 'Retry', onPressed: onAction),
    ),
  );
}

/// A confirmation dialog for an irreversible action.
///
/// [body] must state the concrete effect — "This will mark CNCS-DEMO-0003 as
/// disposed. This cannot be undone from this screen." — because that sentence is
/// the entire safety mechanism. The primary button uses the destructive styling
/// for reject/dispose and the brand styling for approve, so the colour of the
/// button matches the weight of the decision.
Future<bool> showConfirmDialog(
  BuildContext context, {
  required String title,
  required String body,
  String confirmLabel = 'Confirm',
  String cancelLabel = 'Cancel',
  bool destructive = false,
  IconData? icon,
}) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (context) => _DialogFrame(
      children: [
        _DialogHeader(
          icon: icon ?? (destructive ? Icons.warning_amber_outlined : Icons.info_outline),
          iconColor: destructive ? AppColors.danger600 : AppColors.brand600,
          iconBackground: destructive ? AppColors.danger50 : AppColors.brand50,
          title: title,
        ),
        const SizedBox(height: AppSpace.s3),
        Text(
          body,
          style: const TextStyle(fontSize: 14, color: AppColors.aauGray600, height: 1.5),
        ),
        const SizedBox(height: AppSpace.s5),
        Row(
          children: [
            Expanded(
              child: AppButton(
                label: cancelLabel,
                variant: AppButtonVariant.outline,
                expand: true,
                onPressed: () => Navigator.of(context).pop(false),
              ),
            ),
            const SizedBox(width: AppSpace.s3),
            Expanded(
              child: AppButton(
                label: confirmLabel,
                variant: destructive ? AppButtonVariant.destructive : AppButtonVariant.primary,
                expand: true,
                onPressed: () => Navigator.of(context).pop(true),
              ),
            ),
          ],
        ),
      ],
    ),
  );

  return result ?? false;
}

/// The reject dialog: a required reason, 3–500 characters, matching the server's
/// own bound so the only way to see the API's validation error is a real edge case.
///
/// Returns the reason, or `null` if the user backed out. The two are different
/// outcomes and the caller must treat them differently — a cancelled reject must
/// not be reported as a rejected request.
Future<String?> showReasonDialog(
  BuildContext context, {
  required String title,
  required String body,
  String hint = 'Explain why this request is being rejected…',
  String confirmLabel = 'Reject',
  int minLength = 3,
  int maxLength = 500,
}) async {
  final controller = TextEditingController();
  String? errorText;

  final result = await showDialog<String>(
    context: context,
    builder: (context) => StatefulBuilder(
      builder: (context, setState) => _DialogFrame(
        children: [
          _DialogHeader(
            icon: Icons.cancel_outlined,
            iconColor: AppColors.danger600,
            iconBackground: AppColors.danger50,
            title: title,
          ),
          const SizedBox(height: AppSpace.s3),
          Text(
            body,
            style: const TextStyle(fontSize: 14, color: AppColors.aauGray600, height: 1.5),
          ),
          const SizedBox(height: AppSpace.s4),
          AppTextArea(
            label: 'Reason',
            controller: controller,
            hint: hint,
            required: true,
            minLines: 3,
            maxLength: maxLength,
            errorText: errorText,
          ),
          const SizedBox(height: AppSpace.s5),
          Row(
            children: [
              Expanded(
                child: AppButton(
                  label: 'Cancel',
                  variant: AppButtonVariant.outline,
                  expand: true,
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ),
              const SizedBox(width: AppSpace.s3),
              Expanded(
                child: AppButton(
                  label: confirmLabel,
                  variant: AppButtonVariant.destructive,
                  expand: true,
                  onPressed: () {
                    final reason = controller.text.trim();
                    if (reason.length < minLength) {
                      setState(() => errorText =
                          'Please write at least $minLength characters — the requester sees this.');
                      return;
                    }
                    Navigator.of(context).pop(reason);
                  },
                ),
              ),
            ],
          ),
        ],
      ),
    ),
  );

  controller.dispose();
  return result;
}

/// A prompt dialog returning the entered text — used by the admin screens'
/// rename/create forms, where a full page would be overkill but an inline text
/// field under a table is too easy to miss.
Future<String?> showPromptDialog(
  BuildContext context, {
  required String title,
  required String label,
  String? body,
  String? hint,
  String? initialValue,
  String confirmLabel = 'Save',
  String? errorText,
  int minLength = 1,
  int? maxLength,
}) async {
  final controller = TextEditingController(text: initialValue);
  String? error = errorText;

  final result = await showDialog<String>(
    context: context,
    builder: (context) => StatefulBuilder(
      builder: (context, setState) => _DialogFrame(
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w600,
              color: AppColors.aauGray900,
            ),
          ),
          if (body != null) ...[
            const SizedBox(height: AppSpace.s2),
            Text(
              body,
              style: const TextStyle(fontSize: 13.5, color: AppColors.aauGray600, height: 1.5),
            ),
          ],
          const SizedBox(height: AppSpace.s4),
          AppTextField(
            label: label,
            controller: controller,
            hint: hint,
            autofocus: true,
            errorText: error,
            maxLength: maxLength,
            onSubmitted: (_) => _submit(
              context,
              controller: controller,
              minLength: minLength,
              setError: (value) => setState(() => error = value),
            ),
          ),
          const SizedBox(height: AppSpace.s5),
          Row(
            children: [
              Expanded(
                child: AppButton(
                  label: 'Cancel',
                  variant: AppButtonVariant.outline,
                  expand: true,
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ),
              const SizedBox(width: AppSpace.s3),
              Expanded(
                child: AppButton(
                  label: confirmLabel,
                  expand: true,
                  onPressed: () => _submit(
                    context,
                    controller: controller,
                    minLength: minLength,
                    setError: (value) => setState(() => error = value),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    ),
  );

  controller.dispose();
  return result;
}

void _submit(
  BuildContext context, {
  required TextEditingController controller,
  required int minLength,
  required ValueChanged<String?> setError,
}) {
  final value = controller.text.trim();
  if (value.length < minLength) {
    setError('This field is required.');
    return;
  }
  Navigator.of(context).pop(value);
}

class _DialogFrame extends StatelessWidget {
  const _DialogFrame({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Dialog(
        backgroundColor: Colors.white,
        // §5.4: a dialog caps at 480 and never spans a tablet.
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Padding(
            padding: const EdgeInsets.all(AppSpace.s5),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: children,
            ),
          ),
        ),
      );
}

class _DialogHeader extends StatelessWidget {
  const _DialogHeader({
    required this.icon,
    required this.iconColor,
    required this.iconBackground,
    required this.title,
  });

  final IconData icon;
  final Color iconColor;
  final Color iconBackground;
  final String title;

  @override
  Widget build(BuildContext context) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(color: iconBackground, shape: BoxShape.circle),
            child: Icon(icon, size: 20, color: iconColor),
          ),
          const SizedBox(width: AppSpace.s3),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(top: AppSpace.s2),
              child: Text(
                title,
                style: const TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w600,
                  color: AppColors.aauGray900,
                  height: 1.3,
                ),
              ),
            ),
          ),
        ],
      );
}

/// The standard bottom sheet: white, `radius-lg` top corners, dismissible.
/// One helper so the "More" menu, the filters and the select pickers cannot drift
/// into three different sheet shapes.
Future<T?> showAppSheet<T>(
  BuildContext context, {
  required Widget child,
  bool isDismissible = true,
}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    isDismissible: isDismissible,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(borderRadius: AppRadius.sheetTop),
    builder: (context) => SafeArea(top: false, child: child),
  );
}
