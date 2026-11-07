import { Route, Routes } from 'react-router'
import { DocPage } from './DocPage'
import { DocsPage } from './DocsPage'
import { NewDocPage } from './NewDocPage'

export default function DocsRoutes() {
  return (
    <Routes>
      <Route index element={<DocsPage />} />
      <Route path="new" element={<NewDocPage />} />
      <Route path="folder/:folderId" element={<DocsPage />} />
      <Route path=":docId" element={<DocPage />} />
    </Routes>
  )
}
