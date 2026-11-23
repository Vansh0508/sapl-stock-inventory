import { notFound } from "next/navigation"
import ContentLibrary from "@/components/content/ContentLibrary"
import { fabricSlugToFolder } from "@/lib/content-folders"

export default async function ContentFabricFolderPage({
  params,
}: {
  params: Promise<{ folder: string }>
}) {
  const { folder: slug } = await params
  const folder = fabricSlugToFolder(slug)

  if (!folder) notFound()

  return <ContentLibrary initialFolder={folder} />
}
