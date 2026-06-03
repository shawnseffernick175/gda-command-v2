/**
 * ESLint custom rule: font-floor
 *
 * Enforces minimum font size of 11px in JSX className strings.
 * Catches: text-[Npx] where N < 11, fontSize: "Npx" where N < 11.
 * Tailwind default classes like text-xs (12px) are safe.
 *
 * Part of gda-rules plugin — build MUST fail on violation.
 */

const MIN_FONT_PX = 11;

const rule = {
  meta: {
    type: "problem",
    docs: {
      description: `Enforce minimum font size of ${MIN_FONT_PX}px (GDA design token floor)`,
    },
    messages: {
      fontTooSmall:
        'Font size {{size}}px is below the {{min}}px minimum. Use at least text-[{{min}}px] or a larger Tailwind text class.',
    },
    schema: [],
  },
  create(context) {
    // Match text-[Npx] in className strings
    const TW_FONT_RE = /text-\[(\d+(?:\.\d+)?)px\]/g;
    // Match fontSize: "Npx" or fontSize: 'Npx' in style objects
    const STYLE_FONT_RE = /(\d+(?:\.\d+)?)px/;

    function checkStringForTwFontSize(node, value) {
      let match;
      TW_FONT_RE.lastIndex = 0;
      while ((match = TW_FONT_RE.exec(value)) !== null) {
        const px = parseFloat(match[1]);
        if (px < MIN_FONT_PX) {
          context.report({
            node,
            messageId: "fontTooSmall",
            data: { size: String(px), min: String(MIN_FONT_PX) },
          });
        }
      }
    }

    return {
      // Check className attribute strings
      JSXAttribute(node) {
        if (
          node.name &&
          node.name.name === "className" &&
          node.value
        ) {
          if (node.value.type === "Literal" && typeof node.value.value === "string") {
            checkStringForTwFontSize(node.value, node.value.value);
          }
          if (node.value.type === "JSXExpressionContainer") {
            const expr = node.value.expression;
            if (expr.type === "Literal" && typeof expr.value === "string") {
              checkStringForTwFontSize(expr, expr.value);
            }
            if (expr.type === "TemplateLiteral") {
              for (const quasi of expr.quasis) {
                checkStringForTwFontSize(quasi, quasi.value.raw);
              }
            }
          }
        }

        // Check style={{ fontSize: "Npx" }}
        if (
          node.name &&
          node.name.name === "style" &&
          node.value &&
          node.value.type === "JSXExpressionContainer"
        ) {
          const expr = node.value.expression;
          if (expr.type === "ObjectExpression") {
            for (const prop of expr.properties) {
              if (
                prop.key &&
                (prop.key.name === "fontSize" || prop.key.value === "fontSize") &&
                prop.value &&
                prop.value.type === "Literal" &&
                typeof prop.value.value === "string"
              ) {
                const m = STYLE_FONT_RE.exec(prop.value.value);
                if (m) {
                  const px = parseFloat(m[1]);
                  if (px < MIN_FONT_PX) {
                    context.report({
                      node: prop.value,
                      messageId: "fontTooSmall",
                      data: { size: String(px), min: String(MIN_FONT_PX) },
                    });
                  }
                }
              }
            }
          }
        }
      },
    };
  },
};

module.exports = rule;
