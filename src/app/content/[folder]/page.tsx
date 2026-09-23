import { notFound } from "next/navigation"
import ContentLibrary from "@/components/content/ContentLibrary"
import { slugToFolder } from "@/lib/content-folders"

export default async function ContentFolderPage({
  params,
}: {
  params: Promise<{ folder: string }>
}) {
  const { folder: slug } = await params
  const folder = slugToFolder(slug)

  if (!folder) notFound()

  return <ContentLibrary initialFolder={folder} />
}
