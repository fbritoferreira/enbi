// @enbi/server — pure field-level validator for collection rules (ADR-0049).
import type { FieldRule } from "@enbi/db";

export type FieldError = { field: string; message: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isNumeric(v: unknown): boolean {
  return typeof v === "number" ? Number.isFinite(v) : Number.isFinite(Number(v));
}

function toNumber(v: unknown): number {
  return typeof v === "number" ? v : Number(v);
}

/** Coerce a primitive value to string without falling through Object's default. */
function toStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  // For anything else (object, symbol…) use JSON representation.
  return JSON.stringify(v) ?? "";
}

/**
 * Validate `body` against `rules`. Returns ALL errors found; never throws.
 * For PUT (full-replace) callers: pass only the fields present in the body;
 * `required` still applies so a required field omitted from a PUT body errors.
 * (ADR-0049: validate provided fields + required on both POST and PUT.)
 */
export function validateFields(
  rules: Record<string, FieldRule>,
  body: Record<string, unknown>,
): FieldError[] {
  const errors: FieldError[] = [];

  for (const [field, rule] of Object.entries(rules)) {
    const value = body[field];
    const absent = value === undefined || value === null || value === "";

    // required check
    if (rule.required && absent) {
      errors.push({ field, message: `"${field}" is required.` });
      continue; // skip further checks — no value to validate
    }

    // If absent and not required, skip all remaining checks for this field.
    if (absent) continue;

    // type check
    if (rule.type !== undefined) {
      let typeOk = false;
      switch (rule.type) {
        case "string":
          typeOk = typeof value === "string";
          break;
        case "number":
          typeOk = isNumeric(value);
          break;
        case "boolean":
          typeOk = value === true || value === false;
          break;
        case "email":
          typeOk = typeof value === "string" && EMAIL_RE.test(value);
          break;
        case "url":
          try {
            new URL(toStr(value));
            typeOk = true;
          } catch {
            typeOk = false;
          }
          break;
      }
      if (!typeOk) {
        errors.push({ field, message: `"${field}" must be a valid ${rule.type}.` });
        // Continue to remaining checks — min/max/pattern/enum may still apply
        // for partial info, but for type failures the value is likely unusable.
        // We stop further checks on this field to avoid noisy cascading errors.
        continue;
      }
    }

    // min / max
    if (rule.min !== undefined || rule.max !== undefined) {
      const isStr = typeof value === "string";
      const isNum =
        rule.type === "number" ||
        (rule.type === undefined && isNumeric(value) && !isStr && typeof value !== "boolean");

      if (isStr) {
        const len = (value as string).length;
        if (rule.min !== undefined && len < rule.min) {
          errors.push({
            field,
            message: `"${field}" must be at least ${rule.min} characters.`,
          });
        }
        if (rule.max !== undefined && len > rule.max) {
          errors.push({
            field,
            message: `"${field}" must be at most ${rule.max} characters.`,
          });
        }
      } else if (isNum) {
        const num = toNumber(value);
        if (rule.min !== undefined && num < rule.min) {
          errors.push({
            field,
            message: `"${field}" must be at least ${rule.min}.`,
          });
        }
        if (rule.max !== undefined && num > rule.max) {
          errors.push({
            field,
            message: `"${field}" must be at most ${rule.max}.`,
          });
        }
      }
    }

    // pattern
    if (rule.pattern !== undefined) {
      let re: RegExp;
      try {
        re = new RegExp(rule.pattern);
      } catch {
        // Invalid regex is a config error — treat it as a failure so callers
        // notice the misconfiguration rather than silently skipping.
        errors.push({
          field,
          message: `"${field}" has an invalid validation pattern (config error).`,
        });
        continue;
      }
      if (!re.test(toStr(value))) {
        errors.push({
          field,
          message: `"${field}" does not match the required pattern.`,
        });
      }
    }

    // enum
    if (rule.enum !== undefined) {
      if (!rule.enum.includes(toStr(value))) {
        errors.push({
          field,
          message: `"${field}" must be one of: ${rule.enum.join(", ")}.`,
        });
      }
    }
  }

  return errors;
}
