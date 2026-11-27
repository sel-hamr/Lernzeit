import { lazy } from 'react'
import { FileText } from 'lucide-react'
import { definePlugin } from '@/app/plugin'

export const docsPlugin = definePlugin({
  id: 'docs',
  label: 'Docs',
  short: 'Docs',
  icon: FileText,
  path: '/docs',
  description: 'Markdown you saved to read.',
  routes: [{ path: '/docs/*', page: lazy(() => import('./DocsRoutes')) }],
})
