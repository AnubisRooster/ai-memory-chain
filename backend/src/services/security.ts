export interface SecurityScanResult {
  safe: boolean;
  threats: SecurityThreat[];
}

export interface SecurityThreat {
  field: string;
  type: ThreatType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  matchedPattern?: string;
}

export type ThreatType =
  | 'prompt_injection'
  | 'jailbreak'
  | 'xss'
  | 'sql_injection'
  | 'command_injection'
  | 'path_traversal'
  | 'excessive_length'
  | 'encoding_attack';

interface PatternRule {
  pattern: RegExp;
  type: ThreatType;
  severity: SecurityThreat['severity'];
  description: string;
}

const PROMPT_INJECTION_PATTERNS: PatternRule[] = [
  {
    pattern: /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?|context)/i,
    type: 'prompt_injection',
    severity: 'critical',
    description: 'Attempt to override system instructions',
  },
  {
    pattern: /disregard\s+(all\s+)?(previous|prior|your)\s+(previous\s+)?(instructions?|programming|rules?)/i,
    type: 'prompt_injection',
    severity: 'critical',
    description: 'Attempt to disregard system programming',
  },
  {
    pattern: /you\s+are\s+now\s+(a|an|acting\s+as|pretending)/i,
    type: 'jailbreak',
    severity: 'high',
    description: 'Role reassignment attempt',
  },
  {
    pattern: /forget\s+(everything|all|your)\s+(you|instructions?|rules?|know)/i,
    type: 'prompt_injection',
    severity: 'critical',
    description: 'Memory wipe injection',
  },
  {
    pattern: /system\s*:\s*you\s+(are|must|should|will)/i,
    type: 'prompt_injection',
    severity: 'high',
    description: 'Fake system prompt injection',
  },
  {
    pattern: /\[system\]|\[inst\]|\[\/inst\]|<\|im_start\|>|<\|system\|>/i,
    type: 'prompt_injection',
    severity: 'critical',
    description: 'Chat template delimiter injection',
  },
  {
    pattern: /do\s+not\s+follow\s+(any|the|your)\s+(safety|content|ethical)/i,
    type: 'jailbreak',
    severity: 'critical',
    description: 'Safety bypass attempt',
  },
  {
    pattern: /pretend\s+(you\s+)?(are|have|can|don'?t\s+have)\s+(no\s+)?(restrictions?|limitations?|filters?|rules?)/i,
    type: 'jailbreak',
    severity: 'high',
    description: 'Restriction removal attempt',
  },
  {
    pattern: /bypass\s+(your|the|all)\s+(safety|content|security|ethical)\s*(filters?|rules?|restrictions?|guidelines?)/i,
    type: 'jailbreak',
    severity: 'critical',
    description: 'Direct safety bypass request',
  },
  {
    pattern: /\bDAN\b.*mode|developer\s+mode\s+(enabled|output|on)/i,
    type: 'jailbreak',
    severity: 'high',
    description: 'Known jailbreak technique (DAN/Developer Mode)',
  },
];

const XSS_PATTERNS: PatternRule[] = [
  {
    pattern: /<script[\s>]/i,
    type: 'xss',
    severity: 'high',
    description: 'Script tag injection',
  },
  {
    pattern: /on(load|error|click|mouse|focus|blur|submit|change|input)\s*=/i,
    type: 'xss',
    severity: 'high',
    description: 'Event handler injection',
  },
  {
    pattern: /javascript\s*:/i,
    type: 'xss',
    severity: 'high',
    description: 'JavaScript protocol injection',
  },
  {
    pattern: /<iframe[\s>]/i,
    type: 'xss',
    severity: 'high',
    description: 'Iframe injection',
  },
  {
    pattern: /<(object|embed|applet|form|meta|link|base)[\s>]/i,
    type: 'xss',
    severity: 'medium',
    description: 'Dangerous HTML element injection',
  },
  {
    pattern: /expression\s*\(|url\s*\(\s*(javascript|data)\s*:/i,
    type: 'xss',
    severity: 'high',
    description: 'CSS expression / data URI attack',
  },
];

const INJECTION_PATTERNS: PatternRule[] = [
  {
    pattern: /('\s*(OR|AND|UNION)\s+')|(--.*)|(;\s*(DROP|DELETE|UPDATE|INSERT|ALTER|EXEC)\s)/i,
    type: 'sql_injection',
    severity: 'high',
    description: 'SQL injection pattern detected',
  },
  {
    pattern: /(\$\{.*\})|(`.*`.*\|)|(;\s*(rm|cat|wget|curl|nc|bash|sh|python|perl|ruby)\s)/i,
    type: 'command_injection',
    severity: 'critical',
    description: 'Shell command injection pattern',
  },
  {
    pattern: /\.\.[\/\\]/,
    type: 'path_traversal',
    severity: 'high',
    description: 'Path traversal attempt',
  },
];

const ENCODING_PATTERNS: PatternRule[] = [
  {
    pattern: /&#x?[0-9a-f]+;/i,
    type: 'encoding_attack',
    severity: 'low',
    description: 'HTML entity encoding (potential obfuscation)',
  },
  {
    pattern: /%3[cC].*%3[eE]/,
    type: 'encoding_attack',
    severity: 'medium',
    description: 'URL-encoded HTML tag',
  },
  {
    pattern: /\\u00[23][0-9a-fA-F]/,
    type: 'encoding_attack',
    severity: 'low',
    description: 'Unicode escape sequence (potential obfuscation)',
  },
];

const ALL_PATTERNS = [
  ...PROMPT_INJECTION_PATTERNS,
  ...XSS_PATTERNS,
  ...INJECTION_PATTERNS,
  ...ENCODING_PATTERNS,
];

const MAX_FIELD_LENGTHS: Record<string, number> = {
  summary: 2000,
  content: 100000,
  tag: 200,
  data_key: 500,
  data_value: 50000,
  filename: 500,
};

function scanText(text: string, fieldName: string): SecurityThreat[] {
  const threats: SecurityThreat[] = [];
  if (!text || typeof text !== 'string') return threats;

  for (const rule of ALL_PATTERNS) {
    const match = text.match(rule.pattern);
    if (match) {
      threats.push({
        field: fieldName,
        type: rule.type,
        severity: rule.severity,
        description: rule.description,
        matchedPattern: match[0].slice(0, 100),
      });
    }
  }

  return threats;
}

function scanDataObject(data: Record<string, unknown>, prefix: string): SecurityThreat[] {
  const threats: SecurityThreat[] = [];

  for (const [key, value] of Object.entries(data)) {
    const fieldPath = `${prefix}.${key}`;

    threats.push(...scanText(key, `${fieldPath}[key]`));

    if (typeof value === 'string') {
      if (value.length > MAX_FIELD_LENGTHS.data_value) {
        threats.push({
          field: fieldPath,
          type: 'excessive_length',
          severity: 'low',
          description: `Value exceeds ${MAX_FIELD_LENGTHS.data_value} chars (${value.length})`,
        });
      }
      threats.push(...scanText(value, fieldPath));
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      threats.push(...scanDataObject(value as Record<string, unknown>, fieldPath));
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        if (typeof value[i] === 'string') {
          threats.push(...scanText(value[i] as string, `${fieldPath}[${i}]`));
        }
      }
    }
  }

  return threats;
}

export function scanMemoryInput(input: {
  summary?: string;
  data?: Record<string, unknown>;
  tags?: string[];
  type?: string;
  content?: string;
  filenames?: string[];
}): SecurityScanResult {
  const threats: SecurityThreat[] = [];

  if (input.summary && typeof input.summary === 'string') {
    if (input.summary.length > MAX_FIELD_LENGTHS.summary) {
      threats.push({
        field: 'summary',
        type: 'excessive_length',
        severity: 'medium',
        description: `Summary exceeds ${MAX_FIELD_LENGTHS.summary} chars (${input.summary.length})`,
      });
    }
    threats.push(...scanText(input.summary, 'summary'));
  }

  if (input.content) {
    if (input.content.length > MAX_FIELD_LENGTHS.content) {
      threats.push({
        field: 'content',
        type: 'excessive_length',
        severity: 'low',
        description: `Content exceeds ${MAX_FIELD_LENGTHS.content} chars`,
      });
    }
    threats.push(...scanText(input.content, 'content'));
  }

  if (input.tags) {
    for (let i = 0; i < input.tags.length; i++) {
      const tag = input.tags[i];
      if (tag.length > MAX_FIELD_LENGTHS.tag) {
        threats.push({
          field: `tags[${i}]`,
          type: 'excessive_length',
          severity: 'low',
          description: `Tag exceeds ${MAX_FIELD_LENGTHS.tag} chars`,
        });
      }
      threats.push(...scanText(tag, `tags[${i}]`));
    }
  }

  if (input.data) {
    threats.push(...scanDataObject(input.data, 'data'));
  }

  if (input.filenames) {
    for (let i = 0; i < input.filenames.length; i++) {
      threats.push(...scanText(input.filenames[i], `files[${i}].filename`));
    }
  }

  const hasCritical = threats.some((t) => t.severity === 'critical');
  const hasHigh = threats.some((t) => t.severity === 'high');

  return {
    safe: !hasCritical && !hasHigh,
    threats,
  };
}

export function formatThreatReport(result: SecurityScanResult): string {
  if (result.threats.length === 0) return 'No threats detected.';
  return result.threats
    .map((t) => `[${t.severity.toUpperCase()}] ${t.field}: ${t.description}`)
    .join('\n');
}
