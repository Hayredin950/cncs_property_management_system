import 'package:flutter/material.dart';

import '../theme/tokens.dart';

/// A row of under-lined labels that switches what a screen is showing.
///
/// Two screens now split one page into jobs — an item's Details/History, and the
/// Accounts screen's Requests/Invite/Accounts. Colour alone never carries the
/// selection (§12): the active label also gets a heavier weight and a 2px underline,
/// so it reads correctly in a screenshot and to a colour-blind eye.
class SegmentedTabs extends StatelessWidget {
  const SegmentedTabs({
    super.key,
    required this.labels,
    required this.index,
    required this.onChanged,
  });

  final List<String> labels;
  final int index;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.aauGrayLine)),
      ),
      child: Row(
        children: [
          for (final (position, label) in labels.indexed)
            Expanded(
              child: InkWell(
                onTap: () => onChanged(position),
                child: Semantics(
                  selected: position == index,
                  button: true,
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: AppSpace.s3),
                    decoration: BoxDecoration(
                      border: Border(
                        bottom: BorderSide(
                          color: position == index ? AppColors.brand600 : Colors.transparent,
                          width: 2,
                        ),
                      ),
                    ),
                    child: Text(
                      label,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight:
                            position == index ? FontWeight.w600 : FontWeight.w500,
                        color:
                            position == index ? AppColors.brand700 : AppColors.aauGray500,
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
