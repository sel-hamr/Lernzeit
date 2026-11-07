import { useNavigate, useSearchParams } from 'react-router'
import { useDocFolders } from '@/data/hooks'
import { DOC_ROOT } from '@/lib/docs'
import { DocEditor } from './DocEditor'

export function NewDocPage() {
  const folders = useDocFolders()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  if (!folders) return null
  const asked = params.get('folder')
  const folderId = asked && folders.some((f) => f.id === asked) ? asked : DOC_ROOT
  return (
    <DocEditor
      folderId={folderId}
      folders={folders}
      onCancel={() => navigate(folderId === DOC_ROOT ? '/docs' : `/docs/folder/${folderId}`)}
      onSaved={(doc) => navigate(`/docs/${doc.id}`, { replace: true })}
    />
  )
}
