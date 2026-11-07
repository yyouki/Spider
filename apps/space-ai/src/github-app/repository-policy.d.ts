export function isValidNewRepositoryName(value: unknown): value is string;
export function isWritablePersonalRepository(repository: unknown, expectedLogin: string): boolean;
export function parsePersonalRepositoryTarget(
  value: unknown,
  expectedLogin: string
): { owner: string; name: string } | null;

export function findPotentialSecretPaths(files: unknown): string[];
