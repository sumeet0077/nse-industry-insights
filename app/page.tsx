// app/page.tsx
// Root redirect → performance overview
import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/performance");
}
