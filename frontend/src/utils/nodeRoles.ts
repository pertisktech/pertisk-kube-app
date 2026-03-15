const NODE_ROLE_ORDER = ['control-plane', 'master', 'worker', 'node'] as const;

const getNodeRoleRank = (role: string): number => {
  const normalizedRole = role.trim().toLowerCase();
  const index = NODE_ROLE_ORDER.indexOf(normalizedRole as (typeof NODE_ROLE_ORDER)[number]);
  return index === -1 ? NODE_ROLE_ORDER.length : index;
};

export const compareNodeRoleLabels = (first: string, second: string): number => {
  const firstRank = getNodeRoleRank(first);
  const secondRank = getNodeRoleRank(second);

  if (firstRank !== secondRank) {
    return firstRank - secondRank;
  }

  return first.localeCompare(second, undefined, {
    sensitivity: 'base',
  });
};

export const sortNodeRoles = (roles?: string[] | null): string[] => {
  const uniqueRoles = Array.from(new Set((roles ?? []).filter(Boolean)));
  return uniqueRoles.sort(compareNodeRoleLabels);
};

export const compareNodeRoleSets = (first?: string[] | null, second?: string[] | null): number => {
  const firstRoles = sortNodeRoles(first?.length ? first : ['worker']);
  const secondRoles = sortNodeRoles(second?.length ? second : ['worker']);
  const maxLength = Math.max(firstRoles.length, secondRoles.length);

  for (let index = 0; index < maxLength; index += 1) {
    const firstRole = firstRoles[index];
    const secondRole = secondRoles[index];

    if (firstRole == null) return -1;
    if (secondRole == null) return 1;

    const comparison = compareNodeRoleLabels(firstRole, secondRole);
    if (comparison !== 0) {
      return comparison;
    }
  }

  return 0;
};