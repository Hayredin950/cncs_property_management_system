import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/format.dart';
import '../theme/theme.dart';
import '../theme/tokens.dart';

/// Form primitives. §8's rule that binds them together is that a field owns its
/// **label above** the input and its **error below** it, in `danger-700` — the two
/// places a standard `InputDecoration` label can land (floating inside the box)
/// read as placeholder text on a phone and disappear the moment you type.

class AppTextField extends StatelessWidget {
  const AppTextField({
    super.key,
    required this.label,
    this.controller,
    this.hint,
    this.helper,
    this.errorText,
    this.keyboardType,
    this.obscureText = false,
    this.prefixIcon,
    this.suffix,
    this.onChanged,
    this.onSubmitted,
    this.enabled = true,
    this.autofocus = false,
    this.maxLines = 1,
    this.maxLength,
    this.textCapitalization = TextCapitalization.none,
    this.uppercase = false,
    this.mono = false,
    this.required = false,
    this.inputFormatters,
    this.textInputAction,
    this.focusNode,
  });

  final String label;
  final TextEditingController? controller;
  final String? hint;
  final String? helper;
  final String? errorText;
  final TextInputType? keyboardType;
  final bool obscureText;
  final IconData? prefixIcon;

  /// A trailing widget — the standard uses are a password visibility toggle and
  /// the tag input's submit arrow.
  final Widget? suffix;

  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final bool enabled;
  final bool autofocus;
  final int maxLines;
  final int? maxLength;
  final TextCapitalization textCapitalization;

  /// Upper-cases as the user types. Tag IDs are the one field where this is
  /// correct rather than rude: `CNCS-DEMO-0001` is case-insensitive to the API,
  /// so showing it the way it will be matched removes a whole class of
  /// "why didn't that find it?" support questions.
  final bool uppercase;

  /// Renders the value in Geist Mono, for tag IDs and serial numbers.
  final bool mono;

  final bool required;
  final List<TextInputFormatter>? inputFormatters;
  final TextInputAction? textInputAction;
  final FocusNode? focusNode;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _FieldLabel(label, required: required),
        const SizedBox(height: AppSpace.stackTight),
        TextField(
          controller: controller,
          focusNode: focusNode,
          enabled: enabled,
          autofocus: autofocus,
          obscureText: obscureText,
          keyboardType: keyboardType,
          maxLines: maxLines,
          maxLength: maxLength,
          textCapitalization: textCapitalization,
          textInputAction: textInputAction,
          onChanged: onChanged,
          onSubmitted: onSubmitted,
          style: TextStyle(
            fontSize: 16,
            height: 1.35,
            fontFamily: mono ? AppTheme.fontMono : AppTheme.fontSans,
            letterSpacing: mono ? 0.5 : null,
            color: enabled ? AppColors.aauGray900 : AppColors.aauGray500,
          ),
          inputFormatters: [
            if (uppercase) _UpperCaseFormatter(),
            ...?inputFormatters,
          ],
          decoration: InputDecoration(
            hintText: hint,
            prefixIcon: prefixIcon == null
                ? null
                : Icon(prefixIcon, size: 19, color: AppColors.aauGray400),
            suffixIcon: suffix,
            errorText: errorText,
            counterText: maxLength == null ? null : '',
            helperText: errorText == null ? helper : null,
            helperStyle: const TextStyle(
              fontSize: 12.5,
              color: AppColors.aauGray500,
              height: 1.4,
            ),
          ),
        ),
      ],
    );
  }
}

/// A multi-line input. Split from [AppTextField] rather than a `maxLines` flag so
/// the two can carry different padding and the notes field can show a live count.
class AppTextArea extends StatelessWidget {
  const AppTextArea({
    super.key,
    required this.label,
    this.controller,
    this.hint,
    this.helper,
    this.errorText,
    this.minLines = 4,
    this.maxLength = 1000,
    this.onChanged,
    this.enabled = true,
    this.required = false,
    this.showCount = true,
  });

  final String label;
  final TextEditingController? controller;
  final String? hint;
  final String? helper;
  final String? errorText;
  final int minLines;
  final int maxLength;
  final ValueChanged<String>? onChanged;
  final bool enabled;
  final bool required;

  /// A live character count. The request-reason field's 10-character minimum is
  /// the reason it exists — a user should see they are short *before* they submit.
  final bool showCount;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _FieldLabel(label, required: required),
        const SizedBox(height: AppSpace.stackTight),
        TextField(
          controller: controller,
          enabled: enabled,
          minLines: minLines,
          maxLines: minLines,
          maxLength: maxLength,
          onChanged: onChanged,
          style: const TextStyle(fontSize: 16, height: 1.45, color: AppColors.aauGray900),
          decoration: InputDecoration(
            hintText: hint,
            errorText: errorText,
            counterText: showCount ? null : '',
          ),
        ),
      ],
    );
  }
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel(this.label, {required this.required});

  final String label;
  final bool required;

  @override
  Widget build(BuildContext context) {
    // An empty label is a real state: the select sheet's filter box has no label
    // of its own, and an empty Text would still claim a line of height.
    if (label.isEmpty) return const SizedBox.shrink();

    return Row(
      children: [
        Flexible(
          child: Text(
            label,
            style: const TextStyle(
              fontSize: 13.5,
              fontWeight: FontWeight.w500,
              color: AppColors.aauGray700,
            ),
          ),
        ),
        if (required)
          const Text(
            ' *',
            style: TextStyle(fontSize: 13.5, color: AppColors.danger600),
          ),
      ],
    );
  }
}

/// The mobile counterpart of §8's `<select>` / `Combobox`.
///
/// The web app uses a native `<select>` below `md` "for the OS picker UX". The
/// Flutter equivalent of that picker is a modal bottom sheet with a scrollable
/// list — one tap to open, the options thumb-reachable, a check mark on the
/// current value, and a filter box once the list is long enough to need one.
/// That is better than `DropdownButtonFormField`'s floating menu here for the
/// practical reason that a head-height menu is unusable one-handed on a phone.
class AppSelectField<T> extends StatelessWidget {
  const AppSelectField({
    super.key,
    required this.label,
    required this.value,
    required this.options,
    required this.labelOf,
    required this.onChanged,
    this.hint,
    this.helper,
    this.errorText,
    this.enabled = true,
    this.required = false,
    this.clearLabel,
    this.searchHint,
  });

  final String label;
  final T? value;
  final List<T> options;
  final String Function(T value) labelOf;
  final ValueChanged<T?> onChanged;
  final String? hint;
  final String? helper;
  final String? errorText;
  final bool enabled;
  final bool required;

  /// When set, the sheet offers a row that resets the value to `null`. Used by
  /// the optional filters (an "All categories" row) and never by a required field.
  final String? clearLabel;

  final String? searchHint;

  @override
  Widget build(BuildContext context) {
    final hasValue = value != null;
    final display = hasValue ? labelOf(value as T) : (hint ?? 'Select…');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _FieldLabel(label, required: required),
        const SizedBox(height: AppSpace.stackTight),
        Material(
          color: enabled ? Colors.white : AppColors.aauGray100,
          shape: RoundedRectangleBorder(
            borderRadius: AppRadius.smAll,
            side: BorderSide(
              color: errorText != null ? AppColors.danger600 : AppColors.aauGray300,
            ),
          ),
          child: InkWell(
            borderRadius: AppRadius.smAll,
            onTap: enabled ? () => _open(context) : null,
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpace.s3,
                vertical: AppSpace.s3,
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      display,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 16,
                        color: hasValue
                            ? (enabled ? AppColors.aauGray900 : AppColors.aauGray500)
                            : AppColors.aauGray400,
                      ),
                    ),
                  ),
                  const Icon(Icons.expand_more, size: 20, color: AppColors.aauGray500),
                ],
              ),
            ),
          ),
        ),
        if (errorText != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(
              errorText!,
              style: const TextStyle(fontSize: 13, color: AppColors.danger700),
            ),
          )
        else if (helper != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(
              helper!,
              style: const TextStyle(fontSize: 12.5, color: AppColors.aauGray500, height: 1.4),
            ),
          ),
      ],
    );
  }

  Future<void> _open(BuildContext context) async {
    final selected = await showSelectSheet<T>(
      context: context,
      title: label,
      options: options,
      labelOf: labelOf,
      current: value,
      clearLabel: clearLabel,
      searchHint: searchHint,
    );

    if (selected == null) return;
    onChanged(selected.value);
  }
}

/// A sentinel so **"cleared" is distinguishable from "sheet dismissed"** — without
/// it, cancelling the sheet would be indistinguishable from choosing the empty row,
/// and a filter would silently reset every time a user changed their mind.
class SelectResult<T> {
  const SelectResult(this.value);

  final T? value;
}

/// Opens the picker sheet on its own. Public because the compact filter chip below
/// needs the same sheet as the full-width field — one picker, two triggers.
Future<SelectResult<T>?> showSelectSheet<T>({
  required BuildContext context,
  required String title,
  required List<T> options,
  required String Function(T) labelOf,
  T? current,
  String? clearLabel,
  String? searchHint,
}) {
  return showModalBottomSheet<SelectResult<T>>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(borderRadius: AppRadius.sheetTop),
    builder: (context) => _SelectSheet<T>(
      title: title,
      options: options,
      labelOf: labelOf,
      current: current,
      clearLabel: clearLabel,
      searchHint: searchHint,
    ),
  );
}

/// A compact pill for a filter row: "Department ▾", filled and brand-tinted when a
/// value is set so an active filter is visible without opening anything.
///
/// This is the phone's answer to §8's `FilterBar` trigger — the same sheet, one row
/// of screen instead of two stacked fields, which matters because a filter bar that
/// eats a third of the viewport is how a browse screen stops showing any items.
class AppFilterChip<T> extends StatelessWidget {
  const AppFilterChip({
    super.key,
    required this.label,
    required this.value,
    required this.options,
    required this.labelOf,
    required this.onChanged,
    this.allLabel = 'All',
    this.icon,
  });

  final String label;
  final T? value;
  final List<T> options;
  final String Function(T) labelOf;
  final ValueChanged<T?> onChanged;

  /// The row that resets the filter. Named rather than hard-coded so a chip can say
  /// "All departments" and read as a sentence.
  final String allLabel;

  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final active = value != null;

    return Material(
      color: active ? AppColors.brand50 : Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: const BorderRadius.all(Radius.circular(999)),
        side: BorderSide(color: active ? AppColors.brand200 : AppColors.aauGray300),
      ),
      child: InkWell(
        borderRadius: const BorderRadius.all(Radius.circular(999)),
        onTap: () async {
          final result = await showSelectSheet<T>(
            context: context,
            title: label,
            options: options,
            labelOf: labelOf,
            current: value,
            clearLabel: allLabel,
          );
          if (result == null) return;
          onChanged(result.value);
        },
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpace.s3, vertical: 9),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[
                Icon(
                  icon,
                  size: 15,
                  color: active ? AppColors.brand700 : AppColors.aauGray500,
                ),
                const SizedBox(width: 5),
              ],
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 150),
                child: Text(
                  active ? labelOf(value as T) : label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 13.5,
                    fontWeight: active ? FontWeight.w600 : FontWeight.w500,
                    color: active ? AppColors.brand700 : AppColors.aauGray700,
                  ),
                ),
              ),
              const SizedBox(width: 3),
              Icon(
                Icons.expand_more,
                size: 17,
                color: active ? AppColors.brand700 : AppColors.aauGray500,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SelectSheet<T> extends StatefulWidget {
  const _SelectSheet({
    required this.title,
    required this.options,
    required this.labelOf,
    required this.current,
    this.clearLabel,
    this.searchHint,
  });

  final String title;
  final List<T> options;
  final String Function(T) labelOf;
  final T? current;
  final String? clearLabel;
  final String? searchHint;

  @override
  State<_SelectSheet<T>> createState() => _SelectSheetState<T>();
}

class _SelectSheetState<T> extends State<_SelectSheet<T>> {
  var _query = '';

  /// A filter box only earns its space past ~10 rows; below that it is a control
  /// that can only get in the way.
  bool get _searchable => widget.options.length > 10;

  List<T> get _visible {
    if (_query.isEmpty) return widget.options;
    final needle = _query.toLowerCase();
    return widget.options
        .where((option) => widget.labelOf(option).toLowerCase().contains(needle))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final options = _visible;

    return SafeArea(
      top: false,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.75,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: AppSpace.s2),
            // The grab handle, which also tells a user this surface drags down.
            Container(
              width: 36,
              height: 4,
              decoration: const BoxDecoration(
                color: AppColors.aauGray300,
                borderRadius: BorderRadius.all(Radius.circular(999)),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpace.s4,
                AppSpace.s3,
                AppSpace.s4,
                AppSpace.s2,
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      widget.title,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: AppColors.aauGray900,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close, size: 20),
                    tooltip: 'Close',
                    color: AppColors.aauGray500,
                  ),
                ],
              ),
            ),
            if (_searchable)
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpace.s4,
                  0,
                  AppSpace.s4,
                  AppSpace.s2,
                ),
                child: AppTextField(
                  label: '',
                  hint: widget.searchHint ?? 'Filter…',
                  prefixIcon: Icons.search,
                  onChanged: (value) => setState(() => _query = value),
                ),
              ),
            const Divider(height: 1),
            Flexible(
              child: ListView.separated(
                shrinkWrap: true,
                padding: EdgeInsets.zero,
                itemCount: options.length + (widget.clearLabel == null ? 0 : 1),
                separatorBuilder: (_, _) => const Divider(height: 1),
                itemBuilder: (context, index) {
                  if (widget.clearLabel != null && index == 0) {
                    return _row(
                      label: widget.clearLabel!,
                      selected: widget.current == null,
                      onTap: () => Navigator.of(context).pop(SelectResult<T>(null)),
                      muted: true,
                    );
                  }
                  final option = options[index - (widget.clearLabel == null ? 0 : 1)];
                  return _row(
                    label: widget.labelOf(option),
                    selected: option == widget.current,
                    onTap: () => Navigator.of(context).pop(SelectResult<T>(option)),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _row({
    required String label,
    required bool selected,
    required VoidCallback onTap,
    bool muted = false,
  }) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpace.s4,
          vertical: AppSpace.s3,
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 15.5,
                  fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                  color: muted ? AppColors.aauGray500 : AppColors.aauGray900,
                ),
              ),
            ),
            if (selected)
              const Icon(Icons.check, size: 20, color: AppColors.brand600),
          ],
        ),
      ),
    );
  }
}

/// A `YYYY-MM-DD` date control.
///
/// Every date in the reports feature is UTC and the label says so, because the
/// server parses a bare date as UTC: a device in Addis (UTC+3) that sent its local
/// date would silently shift the window by three hours, and a report that appears
/// to be missing "today" is the bug this label prevents (§10.9).
class AppDateField extends StatelessWidget {
  const AppDateField({
    super.key,
    required this.label,
    required this.value,
    required this.onChanged,
    this.hint,
    this.helper,
    this.clearLabel = 'Clear',
  });

  /// `YYYY-MM-DD` or null.
  final String? value;
  final String label;
  final ValueChanged<String?> onChanged;
  final String? hint;
  final String? helper;
  final String clearLabel;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _FieldLabel(label, required: false),
        const SizedBox(height: AppSpace.stackTight),
        Row(
          children: [
            Expanded(
              child: Material(
                color: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: AppRadius.smAll,
                  side: const BorderSide(color: AppColors.aauGray300),
                ),
                child: InkWell(
                  borderRadius: AppRadius.smAll,
                  onTap: () => _pick(context),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpace.s3,
                      vertical: AppSpace.s3,
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.calendar_today_outlined,
                            size: 17, color: AppColors.aauGray400),
                        const SizedBox(width: AppSpace.s2),
                        Expanded(
                          child: Text(
                            value == null ? (hint ?? 'Any date') : _pretty(value!),
                            style: const TextStyle(fontSize: 15.5),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            if (value != null)
              TextButton(
                onPressed: () => onChanged(null),
                child: Text(clearLabel),
              ),
          ],
        ),
        if (helper != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(
              helper!,
              style: const TextStyle(fontSize: 12.5, color: AppColors.aauGray500, height: 1.4),
            ),
          ),
      ],
    );
  }

  static String _pretty(String isoDate) {
    final parsed = DateTime.tryParse(isoDate);
    return formatDateUtc(parsed?.toUtc().toIso8601String()) ?? isoDate;
  }

  Future<void> _pick(BuildContext context) async {
    final initial = DateTime.tryParse(value ?? '') ?? DateTime.now().toUtc();
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime.utc(2000),
      lastDate: DateTime.utc(2100),
      helpText: '$label (UTC)',
    );
    if (picked == null) return;
    // Parsed back as a UTC calendar date, never converted to local midnight.
    onChanged(
      DateTime.utc(picked.year, picked.month, picked.day)
          .toIso8601String()
          .substring(0, 10),
    );
  }
}

/// A form section: the `h2` group heading §10.6 asks for, with an optional
/// one-line explanation under it.
class AppFormSection extends StatelessWidget {
  const AppFormSection({super.key, required this.title, this.subtitle, required this.children});

  final String title;
  final String? subtitle;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Column(
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
        if (subtitle != null) ...[
          const SizedBox(height: 2),
          Text(
            subtitle!,
            style: const TextStyle(fontSize: 13, color: AppColors.aauGray500, height: 1.4),
          ),
        ],
        const SizedBox(height: AppSpace.stack),
        for (final (index, child) in children.indexed) ...[
          if (index > 0) const SizedBox(height: AppSpace.stack),
          child,
        ],
      ],
    );
  }
}

/// Upper-cases input without a regex-validated formatter, so it works on every
/// platform keyboard (including ones that report a composing region).
class _UpperCaseFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    return newValue.copyWith(text: newValue.text.toUpperCase());
  }
}
