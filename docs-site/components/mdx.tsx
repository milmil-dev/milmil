import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { Files, Folder, File } from 'fumadocs-ui/components/files';
import { Tabs, Tab } from 'fumadocs-ui/components/tabs';
import { Steps, Step } from 'fumadocs-ui/components/steps';
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import { Callout } from 'fumadocs-ui/components/callout';
import { TypeTable } from 'fumadocs-ui/components/type-table';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Files,
    Folder,
    File,
    Tabs,
    Tab,
    Steps,
    Step,
    Accordion,
    Accordions,
    Callout,
    TypeTable,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
