export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');

  if (!local || !domain) {
    return '<invalid-email>';
  }

  const visibleLocal = local.length <= 2 ? local[0] ?? '*' : local.slice(0, 2);

  return `${visibleLocal}***@${domain}`;
}

export function maskRecipients(to: string | string[]): string[] {
  const recipients = Array.isArray(to) ? to : [to];
  return recipients.map(maskEmail);
}
