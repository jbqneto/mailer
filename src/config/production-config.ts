const placeholderPattern = /^(replace[-_]with|change[-_]me)|example\.(com|net|org)|local\.test$/i;

export function assertProductionValue(key: string, value: string): void {
  if (
    process.env.NODE_ENV === 'production' &&
    placeholderPattern.test(value.trim())
  ) {
    throw new Error(`${key} must be replaced before production startup`);
  }
}
