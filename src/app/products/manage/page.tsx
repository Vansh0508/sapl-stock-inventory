import { redirect } from "next/navigation"

export default function ManageRootPage() {
  redirect("/products/manage/currencies")
}
