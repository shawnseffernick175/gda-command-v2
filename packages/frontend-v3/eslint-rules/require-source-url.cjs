/**
 * ESLint custom rule: require-source-url
 *
 * For JSX elements <Stat>, <Metric>, <Field>, <SourceUrlChip>:
 *   requires that the `sourceUrl` (or `url` for SourceUrlChip) prop is passed.
 *
 * This is a static AST enforcement of R1 (every data point has a searchable source).
 */

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require sourceUrl prop on R1-binding components (Stat, Metric, Field, SourceUrlChip)',
    },
    messages: {
      missingSourceUrl: '{{component}} requires a "{{prop}}" prop (R1: every data point has a searchable source).',
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

    return {
      JSXOpeningElement(node) {
        const name = node.name.type === 'JSXIdentifier' ? node.name.name : null;
        if (!name || !(name in COMPONENT_PROP_MAP)) return;

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
      },
    };
  },
};

module.exports = rule;
