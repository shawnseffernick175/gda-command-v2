/**
 * ESLint custom rule: require-source-url
 *
 * For JSX elements <Stat>, <Metric>, <Field>, <SourceUrlChip>:
 *   requires that the `sourceUrl` (or `url` for SourceUrlChip) prop is passed.
 *
 * For elements with data-testid matching /^data-point-/: requires either an <a>
 *   ancestor or <a> descendant. This is a best-effort static check — the primary
 *   enforcement for data-point anchors is via the R1 DOM runtime test (D5 §4.1).
 *
 * This is a static AST enforcement of R1 (every data point has a searchable source).
 */

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require sourceUrl prop on R1-binding components and anchor context for data-point-* elements',
    },
    messages: {
      missingSourceUrl: '{{component}} requires a "{{prop}}" prop (R1: every data point has a searchable source).',
      dataPointMissingAnchor: 'Element with data-testid="data-point-*" must have an <a> ancestor or be an <a> element (R1).',
    },
    schema: [],
  },
  create(context) {
    const COMPONENT_PROP_MAP = {
      Stat: 'sourceUrl',
      Metric: 'sourceUrl',
      Field: 'sourceUrl',
      SourceUrlChip: 'url',
    };

    function getTestIdValue(node) {
      const attr = node.attributes.find(
        (a) =>
          a.type === 'JSXAttribute' &&
          a.name.type === 'JSXIdentifier' &&
          a.name.name === 'data-testid'
      );
      if (!attr) return null;
      if (attr.value && attr.value.type === 'Literal') return attr.value.value;
      if (attr.value && attr.value.type === 'JSXExpressionContainer') {
        const expr = attr.value.expression;
        if (expr.type === 'TemplateLiteral' && expr.quasis.length > 0) {
          return expr.quasis[0].value.raw;
        }
        if (expr.type === 'Literal') return expr.value;
      }
      return null;
    }

    function isAnchorElement(node) {
      if (!node || node.type !== 'JSXOpeningElement') return false;
      return node.name.type === 'JSXIdentifier' && node.name.name === 'a';
    }

    function hasAnchorAncestor(node) {
      let current = node.parent;
      while (current) {
        if (current.type === 'JSXElement' && isAnchorElement(current.openingElement)) {
          return true;
        }
        current = current.parent;
      }
      return false;
    }

    function hasAnchorChild(node) {
      const parent = node.parent;
      if (!parent || parent.type !== 'JSXElement') return false;
      return parent.children.some((child) => {
        if (child.type === 'JSXElement' && isAnchorElement(child.openingElement)) return true;
        return false;
      });
    }

    return {
      JSXOpeningElement(node) {
        const name = node.name.type === 'JSXIdentifier' ? node.name.name : null;

        // Check sourceUrl prop requirement
        if (name && name in COMPONENT_PROP_MAP) {
          const requiredProp = COMPONENT_PROP_MAP[name];
          const hasProp = node.attributes.some(
            (attr) =>
              attr.type === 'JSXAttribute' &&
              attr.name.type === 'JSXIdentifier' &&
              attr.name.name === requiredProp
          );

          if (!hasProp) {
            context.report({
              node,
              messageId: 'missingSourceUrl',
              data: { component: name, prop: requiredProp },
            });
          }
        }

        // Check data-point-* elements for anchor context
        const testId = getTestIdValue(node);
        if (testId && typeof testId === 'string' && testId.startsWith('data-point-')) {
          if (name === 'a' || name === 'SourceUrlChip') return;
          if (hasAnchorAncestor(node) || hasAnchorChild(node)) return;

          context.report({
            node,
            messageId: 'dataPointMissingAnchor',
          });
        }
      },
    };
  },
};

module.exports = rule;
