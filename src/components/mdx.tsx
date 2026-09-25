import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { Children, type ReactNode } from 'react';
import { Screenshot } from './screenshot';

/**
 * Enabled by starting the server with `PDF_PRINT=1` (see `bun run pdf`).
 * Renders collapsible/tabbed content fully expanded so nothing is hidden
 * in the exported PDF. Only affects server rendering while the flag is set.
 */
const isPrinting = process.env.PDF_PRINT === '1';

function PrintingAccordion(props: React.ComponentProps<typeof Accordion>) {
  return (
    <div>
      <h3>{props.title}</h3>
      {props.children}
    </div>
  );
}

function PrintingAccordions(props: React.ComponentProps<typeof Accordions>) {
  return <div>{props.children}</div>;
}

function PrintingTabs(props: React.ComponentProps<typeof Tabs>) {
  const labels = props.items ?? [];
  return (
    <div>
      {Children.map(props.children, (child, i) => (
        <div>
          {labels[i] ? <h3>{labels[i]}</h3> : null}
          {child}
        </div>
      ))}
    </div>
  );
}

function PrintingTab({ children }: { children?: ReactNode }) {
  return <div>{children}</div>;
}

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Accordion: isPrinting ? PrintingAccordion : Accordion,
    Accordions: isPrinting ? PrintingAccordions : Accordions,
    Tabs: isPrinting ? PrintingTabs : Tabs,
    Tab: isPrinting ? PrintingTab : Tab,
    Screenshot,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
