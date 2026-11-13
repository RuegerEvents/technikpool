import 'api/generated/export.dart';

/// Whether the user maintains [org]'s inventory — registers units, makes kits.
/// ADMIN is that rung (`ROLE_FOR.inventory` in apps/web/src/lib/roles.ts). An
/// organization whose role the server did not send is counted in, and the
/// server decides.
bool canManageInventory(MemberOrganization org, {required bool isAdmin}) {
  if (isAdmin) return true;
  return switch (org.role) {
    MemberOrganizationRole.admin || MemberOrganizationRole.owner || null => true,
    _ => false,
  };
}

/// The organizations a "new …" form offers: the ones the user manages, or —
/// when that is none — all of them, so the server's refusal can say why
/// rather than the form having nothing to pick.
List<MemberOrganization> manageableOrgs(CurrentUser user) {
  final eligible = user.organizations
      .where((o) => canManageInventory(o, isAdmin: user.isAdmin))
      .toList();
  return eligible.isEmpty ? user.organizations : eligible;
}
