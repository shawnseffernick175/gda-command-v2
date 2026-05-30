/**
 * ESLint rule: require-source-url
 * For JSX elements <Stat>, <Metric>, <Field>, <SourceUrlChip>,
 * require that `sourceUrl` (or `url` for SourceUrlChip) prop is passed.
 */

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require sourceUrl prop on Stat, Metric, Field, and SourceUrlChip components (R1 rule)",
    },
    messages: {
      missingSourceUrl:
        "R1 violation: <{{name}}> must have a '{{prop}}' prop. Every data point needs a searchable source.",
    },
    schema: [],
  },
  create(context) {
    const COMPONENTS_URL = ["Stat", "Metric", "Field"];
    const COMPONENTS_SOURCE_URL_CHIP = ["SourceUrlChip"];

    return {
      JSXOpeningElement(node) {
        const name = node.name?.name;
        if (!name) return;

        if (COMPONENTS_URL.includes(name)) {
          const hasSourceUrl = node.attributes.some(
            (attr) => attr.type === "JSXAttribute" && attr.name?.name === "sourceUrl"
          );
          if (!hasSourceUrl) {
            context.report({
              node,
              messageId: "missingSourceUrl",
              data: { name, prop: "sourceUrl" },
            });
          }
        }

        if (COMPONENTS_SOURCE_URL_CHIP.includes(name)) {
          const hasUrl = node.attributes.some(
            (attr) => attr.type === "JSXAttribute" && attr.name?.name === "url"
          );
          if (!hasUrl) {
            context.report({
              node,
              messageId: "missingSourceUrl",
              data: { name, prop: "url" },
            });
          }
        }
      },
    };
  },
};
