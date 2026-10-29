import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_error.dart';
import '../../data/providers/core_providers.dart';
import '../../data/providers/taxonomy_provider.dart';
import '../../models/department.dart';
import '../../models/user.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_card.dart';
import '../../widgets/app_fields.dart';
import '../../widgets/states.dart';

/// `/request-account` — public form that asks for an account.
///
/// Anyone may ask; nobody gets in by asking. Success shows a confirmation and
/// never stores a token — the account is `PENDING_APPROVAL` until a system
/// administrator decides it from the queue.
class RequestAccountPage extends ConsumerStatefulWidget {
  const RequestAccountPage({super.key});

  @override
  ConsumerState<RequestAccountPage> createState() => _RequestAccountPageState();
}

class _RequestAccountPageState extends ConsumerState<RequestAccountPage> {
  final _fullName = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();

  var _submitting = false;
  Object? _error;
  final _fieldErrors = <String, String?>{};
  AccountRequestResponse? _submitted;

  /// The chosen `GET /departments` id, sent to the server as `departmentId`.
  ///
  /// The request has to name a real unit — the server refuses one that does not
  /// exist, and the approval queue is scoped to the unit's head. That is why this
  /// is a picker over the server's list rather than a free-text field.
  String? _departmentId;

  @override
  void dispose() {
    _fullName.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final fullName = _fullName.text.trim();
    final email = _email.text.trim();
    final password = _password.text;
    final departmentId = _departmentId;

    final errors = <String, String?>{};
    if (fullName.isEmpty) errors['fullName'] = 'Enter your full name.';
    if (email.isEmpty || !email.contains('@')) errors['email'] = 'Enter a valid email address.';
    if (departmentId == null) errors['departmentId'] = 'Choose your department.';
    if (password.length < 8) errors['password'] = 'At least 8 characters.';

    setState(() {
      _fieldErrors
        ..clear()
        ..addAll(errors);
      _error = null;
    });
    if (errors.values.any((value) => value != null)) return;

    setState(() => _submitting = true);
    try {
      final result = await ref.read(authApiProvider).requestAccount(
            fullName: fullName,
            email: email,
            password: password,
            departmentId: departmentId!,
          );
      if (!mounted) return;
      setState(() => _submitted = result);
    } on ApiError catch (error) {
      setState(() {
        if (error.isConflict) {
          _fieldErrors['email'] = error.message;
        } else {
          _error = error;
        }
      });
    } on NetworkError catch (error) {
      setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  /// The id is what the form stores and sends; the name is what the field shows.
  String _departmentName(List<Department> departments, String id) {
    for (final department in departments) {
      if (department.id == id) return department.name;
    }
    return id;
  }

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(AppSpace.gutter),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 400),
          child: AppCard(
            padding: const EdgeInsets.all(AppSpace.s5),
            child: _submitted != null ? _success(_submitted!) : _form(),
          ),
        ),
      ),
    );
  }

  Widget _success(AccountRequestResponse result) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Icon(Icons.check_circle_outline, size: 36, color: AppColors.brand600),
        const SizedBox(height: AppSpace.s3),
        const Text(
          'Request submitted',
          style: TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.w600,
            color: AppColors.aauGray900,
          ),
        ),
        const SizedBox(height: AppSpace.s2),
        Text(
          '${result.message}. You will be able to sign in once a system administrator '
          'approves the request for ${result.email}.',
          style: const TextStyle(fontSize: 13.5, color: AppColors.aauGray600, height: 1.45),
        ),
        const SizedBox(height: AppSpace.s5),
        AppButton(
          label: 'Back to sign in',
          expand: true,
          onPressed: () => context.go('/login'),
        ),
      ],
    );
  }

  Widget _form() {
    final departmentsAsync = ref.watch(departmentsProvider);
    final departments = departmentsAsync.value ?? const <Department>[];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          'Request an account',
          style: TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.w600,
            color: AppColors.aauGray900,
          ),
        ),
        const SizedBox(height: AppSpace.s1),
        const Text(
          'Ask for access to the CNCS property register. A system administrator must '
          'approve before you can sign in.',
          style: TextStyle(fontSize: 13.5, color: AppColors.aauGray500, height: 1.45),
        ),
        const SizedBox(height: AppSpace.s5),
        AppTextField(
          label: 'Full name',
          controller: _fullName,
          hint: 'Selam Bekele',
          errorText: _fieldErrors['fullName'],
          enabled: !_submitting,
          required: true,
        ),
        const SizedBox(height: AppSpace.stack),
        AppTextField(
          label: 'Email',
          controller: _email,
          hint: 'you@aau.edu.et',
          keyboardType: TextInputType.emailAddress,
          errorText: _fieldErrors['email'],
          enabled: !_submitting,
          required: true,
        ),
        const SizedBox(height: AppSpace.stack),
        AppSelectField<String>(
          label: 'Department',
          value: _departmentId,
          options: departments.map((department) => department.id).toList(),
          labelOf: (id) => _departmentName(departments, id),
          onChanged: (id) => setState(() => _departmentId = id),
          hint: departmentsAsync.isLoading ? 'Loading departments…' : 'Select your department',
          helper: departmentsAsync.hasError
              ? 'The department list could not be loaded. Check your connection and try again.'
              : 'The unit whose head will review your request.',
          errorText: _fieldErrors['departmentId'],
          enabled: !_submitting && departments.isNotEmpty,
          required: true,
        ),
        const SizedBox(height: AppSpace.stack),
        AppTextField(
          label: 'Password',
          controller: _password,
          obscureText: true,
          errorText: _fieldErrors['password'],
          enabled: !_submitting,
          required: true,
          helper: 'At least 8 characters. This is the password you will use after approval.',
        ),
        if (_error != null) ...[
          const SizedBox(height: AppSpace.stack),
          InlineError(error: _error!),
        ],
        const SizedBox(height: AppSpace.s5),
        AppButton(
          label: 'Submit request',
          expand: true,
          size: AppButtonSize.lg,
          loading: _submitting,
          onPressed: _submit,
        ),
        const SizedBox(height: AppSpace.s4),
        TextButton(
          onPressed: () => context.go('/login'),
          child: const Text('← Back to sign in'),
        ),
      ],
    );
  }
}
