// Deliberately narrow rules. These supplement GitHub secret scanning, not replace it.
export function securityFindings(path, content) {
  const findings = [];
  const name = path.replaceAll('\\', '/').split('/').at(-1);
  if (
    (name.startsWith('.env') && name !== '.env.example') ||
    /\.local\.txt$|\.(?:pem|p12|pfx|key)$/i.test(name)
  )
    findings.push('private-file');
  const patterns = {
    'neon-password': /\bnpg_[A-Za-z0-9]{16,}\b/,
    'github-token': /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/,
    'aws-access-key': /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
    'google-api-key': /\bAIza[\w-]{35}\b/,
    'provider-token':
      /\b(?:sk-[A-Za-z0-9_-]{48,}|npm_[A-Za-z0-9]{36,}|vcp_[A-Za-z0-9_]{32,}|xox[baprs]-[A-Za-z0-9-]{20,})\b/,
    'literal-auth-secret': /\bAUTH_SECRET\s*[:=]\s*['"]?[A-Za-z0-9+/_=-]{32,}/,
    'literal-service-secret':
      /\b(?:DATABASE_PASSWORD|DB_PASSWORD|NEON_API_KEY|VERCEL_TOKEN|GITHUB_TOKEN|API_KEY|ACCESS_TOKEN|CLIENT_SECRET)\s*[:=]\s*['"][A-Za-z0-9+/_=.-]{20,}['"]/,
    'private-key': /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/,
  };
  for (const [rule, pattern] of Object.entries(patterns))
    if (pattern.test(content)) findings.push(rule);
  for (const match of content.matchAll(
    /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|rediss?|amqps?|https?):\/\/[^\s'"`<>]+/g,
  )) {
    try {
      const url = new URL(match[0]);
      if (
        url.password &&
        !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
        !/^(?:[^.]+\.)*example(?:\.com|\.org|\.net)?$/.test(url.hostname)
      )
        findings.push('remote-database-credential');
    } catch {
      /* A partial URL is not a credential. */
    }
  }
  return [...new Set(findings)];
}
