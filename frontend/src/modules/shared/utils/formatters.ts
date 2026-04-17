export function formatPhoneNumber(value: string) {
  return value.replace(/\D+/g, '');
}

export function formatDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString();
}
