import { source } from '@/lib/source';
import { createFromSource } from 'fumadocs-core/search/server';

// Statically export the search index (required for `output: 'export'`).
// The index is pre-rendered to a JSON file and searched client-side.
export const revalidate = false;
export const { staticGET: GET } = createFromSource(source);
